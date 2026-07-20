import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { StoragePurpose, StorageVisibility } from "@prisma/client";

import { MediaDomainError } from "../../../features/media/domain/errors";
import {
  attachMedia,
  detachMedia,
  reorderMedia,
  replaceSingletonMedia,
  updateMediaAltText,
} from "../../../features/media/services/media-lifecycle";
import {
  createPrivateAvatarDownloadTarget,
  createPublicMediaDownloadTarget,
} from "../../../features/media/services/delivery";
import { getMediaContainer, resolvePublicMediaBatch } from "../../../features/media/services/media-query";
import { StorageDomainError } from "../../../features/storage/domain/errors";
import { generateStorageObjectKey } from "../../../features/storage/domain/policy";
import { DeterministicStorageProvider } from "../../../features/storage/providers/deterministic";
import { setStorageProviderForTests } from "../../../features/storage/providers/registry";
import { rejectStoredAsset } from "../../../features/storage/services/storage-admin";
import { deleteStoredAsset } from "../../../features/storage/services/storage-assets";
import type { StorageActor } from "../../../features/storage/services/actor";
import { prisma } from "../../../lib/db/prisma";
import {
  createStorageFixture,
  resetStorageTestDatabase,
} from "../../storage/helpers/storage-fixture";

test("Gate 5B media lifecycle is atomic, authorized, idempotent, and history preserving", async (t) => {
  await resetStorageTestDatabase();
  const fixture = await createStorageFixture("gate5b-media");
  await prisma.organizationSettings.createMany({
    data: [
      { organizationId: fixture.organization.id },
      { organizationId: fixture.foreignOrganization.id },
    ],
  });
  t.after(() => setStorageProviderForTests(undefined));

  await t.test("customer avatar is private, person-owned, replayable, and replaceable", async () => {
    const firstAsset = await createReadyAsset(fixture.actors.customer, "CUSTOMER_AVATAR");
    const key = randomUUID();
    const attached = await attachMedia(fixture.actors.customer, {
      altText: "  Customer avatar  ",
      assetId: firstAsset.id,
      expectedVersion: 0,
      idempotencyKey: key,
      slot: "CUSTOMER_AVATAR",
      target: { kind: "CUSTOMER_PROFILE" },
    });
    assert.equal(attached.version, 1);
    assert.equal(attached.bindings.length, 1);
    assert.equal(attached.bindings[0]?.altText, "Customer avatar");
    assert.equal(attached.bindings[0]?.media?.stableDeliveryPath, `/api/media/customer/assets/${firstAsset.id}`);

    const replay = await attachMedia(fixture.actors.customer, {
      altText: "  Customer avatar  ",
      assetId: firstAsset.id,
      expectedVersion: 0,
      idempotencyKey: key,
      slot: "CUSTOMER_AVATAR",
      target: { kind: "CUSTOMER_PROFILE" },
    });
    assert.deepEqual(replay, attached);
    assert.equal(await prisma.mediaMutation.count({ where: { actorPersonId: fixture.actors.customer.personId, idempotencyKey: key } }), 1);
    await assert.rejects(attachMedia(fixture.actors.customer, {
      assetId: firstAsset.id,
      expectedVersion: 1,
      idempotencyKey: key,
      slot: "CUSTOMER_AVATAR",
      target: { kind: "CUSTOMER_PROFILE" },
    }), rejectsCode("IDEMPOTENCY_CONFLICT"));

    await assert.rejects(createPrivateAvatarDownloadTarget(fixture.actors.foreignCustomer, firstAsset.id), rejectsCode("NOT_FOUND"));
    await assert.rejects(createPrivateAvatarDownloadTarget(fixture.actors.customer, firstAsset.id), rejectsCode("STORAGE_PROVIDER_NOT_CONFIGURED"));
    await assert.rejects(createPublicMediaDownloadTarget(firstAsset.id), rejectsCode("NOT_FOUND"));

    const foreignAsset = await createReadyAsset(fixture.actors.foreignCustomer, "CUSTOMER_AVATAR");
    await assert.rejects(attachMedia(fixture.actors.customer, {
      assetId: foreignAsset.id,
      expectedVersion: attached.version,
      idempotencyKey: randomUUID(),
      slot: "CUSTOMER_AVATAR",
      target: { kind: "CUSTOMER_PROFILE" },
    }), rejectsCode("NOT_FOUND"));

    const replacement = await createReadyAsset(fixture.actors.customer, "CUSTOMER_AVATAR");
    const replaced = await replaceSingletonMedia(fixture.actors.customer, {
      assetId: replacement.id,
      expectedVersion: attached.version,
      idempotencyKey: randomUUID(),
      slot: "CUSTOMER_AVATAR",
      target: { kind: "CUSTOMER_PROFILE" },
    });
    assert.equal(replaced.version, 2);
    assert.equal(replaced.bindings[0]?.media?.assetId, replacement.id);
    const history = await prisma.mediaBinding.findMany({
      where: { containerId: replaced.id! }, orderBy: { attachedAt: "asc" },
    });
    assert.deepEqual(history.map((binding) => binding.state).sort(), ["ACTIVE", "DETACHED"]);
    assert.equal(history.find((binding) => binding.assetId === firstAsset.id)?.detachedByPersonId, fixture.actors.customer.personId);
    assert.equal(await prisma.storedAsset.count({ where: { id: firstAsset.id } }), 1);
  });

  await t.test("rejected and quarantined assets cannot be attached", async () => {
    const current = await getMediaContainer(fixture.actors.customer, { kind: "CUSTOMER_PROFILE" });
    for (const state of ["REJECTED", "QUARANTINED"] as const) {
      const asset = await createReadyAsset(fixture.actors.customer, "CUSTOMER_AVATAR", state);
      await assert.rejects(replaceSingletonMedia(fixture.actors.customer, {
        assetId: asset.id,
        expectedVersion: current.version,
        idempotencyKey: randomUUID(),
        slot: "CUSTOMER_AVATAR",
        target: { kind: "CUSTOMER_PROFILE" },
      }), rejectsCode("ASSET_NOT_READY"));
    }
  });

  await t.test("business singleton enforces current role, ownership, purpose, readiness, and versions", async () => {
    const logo = await createReadyAsset(fixture.actors.owner, "BUSINESS_LOGO");
    await assert.rejects(attachMedia(fixture.actors.receptionist, {
      assetId: logo.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_LOGO",
      target: { kind: "BUSINESS_PROFILE" },
    }), rejectsCode("FORBIDDEN"));
    await assert.rejects(attachMedia(fixture.actors.staff, {
      assetId: logo.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_LOGO",
      target: { kind: "BUSINESS_PROFILE" },
    }), rejectsCode("FORBIDDEN"));
    await assert.rejects(attachMedia(fixture.actors.revoked, {
      assetId: logo.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_LOGO",
      target: { kind: "BUSINESS_PROFILE" },
    }), rejectsCode("FORBIDDEN"));
    await assert.rejects(attachMedia(fixture.actors.foreignOwner, {
      assetId: logo.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_LOGO",
      target: { kind: "BUSINESS_PROFILE" },
    }), rejectsCode("NOT_FOUND"));
    const replacementRole = await prisma.role.create({
      data: { isSystem: true, name: `gate5b-replacement-${randomUUID()}`, organizationId: fixture.organization.id, systemRole: "OWNER" },
    });
    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: replacementRole.id } });
    await assert.rejects(attachMedia(fixture.actors.owner, {
      assetId: logo.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_LOGO",
      target: { kind: "BUSINESS_PROFILE" },
    }), rejectsCode("FORBIDDEN"));
    await prisma.organizationMember.update({ where: { id: fixture.owner.membership.id }, data: { roleId: fixture.owner.role.id } });

    const wrongPurpose = await createReadyAsset(fixture.actors.owner, "BUSINESS_COVER");
    await assert.rejects(attachMedia(fixture.actors.owner, {
      assetId: wrongPurpose.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_LOGO",
      target: { kind: "BUSINESS_PROFILE" },
    }), rejectsCode("MEDIA_PURPOSE_MISMATCH"));
    const notReady = await createReadyAsset(fixture.actors.owner, "BUSINESS_LOGO", "PENDING_INSPECTION");
    await assert.rejects(attachMedia(fixture.actors.owner, {
      assetId: notReady.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_LOGO",
      target: { kind: "BUSINESS_PROFILE" },
    }), rejectsCode("ASSET_NOT_READY"));

    const attached = await attachMedia(fixture.actors.owner, {
      assetId: logo.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_LOGO",
      target: { kind: "BUSINESS_PROFILE" },
    });
    assert.equal(attached.bindings[0]?.media?.stableDeliveryPath, `/media/${logo.id}`);
    await assert.rejects(attachMedia(fixture.actors.manager, {
      assetId: await createReadyAsset(fixture.actors.manager, "BUSINESS_LOGO").then((asset) => asset.id),
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_LOGO",
      target: { kind: "BUSINESS_PROFILE" },
    }), rejectsCode("STALE_VERSION"));
    await assert.rejects(deleteStoredAsset(fixture.actors.owner, {
      assetId: logo.id,
      expectedVersion: logo.version,
      idempotencyKey: randomUUID(),
    }), rejectsCode("ASSET_IN_USE"));
    await assert.rejects(createPublicMediaDownloadTarget(logo.id), rejectsCode("STORAGE_PROVIDER_NOT_CONFIGURED"));
  });

  await t.test("concurrent singleton replacement has one winner and no duplicate ACTIVE binding", async () => {
    const current = await getMediaContainer(fixture.actors.owner, { kind: "BUSINESS_PROFILE" });
    const first = await createReadyAsset(fixture.actors.owner, "BUSINESS_LOGO");
    const second = await createReadyAsset(fixture.actors.manager, "BUSINESS_LOGO");
    const results = await Promise.allSettled([
      replaceSingletonMedia(fixture.actors.owner, {
        assetId: first.id, expectedVersion: current.version, idempotencyKey: randomUUID(), slot: "BUSINESS_LOGO", target: { kind: "BUSINESS_PROFILE" },
      }),
      replaceSingletonMedia(fixture.actors.manager, {
        assetId: second.id, expectedVersion: current.version, idempotencyKey: randomUUID(), slot: "BUSINESS_LOGO", target: { kind: "BUSINESS_PROFILE" },
      }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const container = await prisma.mediaContainer.findFirstOrThrow({ where: { kind: "BUSINESS_PROFILE", organizationId: fixture.organization.id } });
    assert.equal(await prisma.mediaBinding.count({ where: { containerId: container.id, slot: "BUSINESS_LOGO", state: "ACTIVE" } }), 1);
  });

  await t.test("collection attachment serializes concurrent creators and supports exact reorder and alt updates", async () => {
    const starting = await getMediaContainer(fixture.actors.owner, { kind: "BUSINESS_PROFILE" });
    const left = await createReadyAsset(fixture.actors.owner, "BUSINESS_GALLERY_IMAGE");
    const right = await createReadyAsset(fixture.actors.manager, "BUSINESS_GALLERY_IMAGE");
    const results = await Promise.allSettled([
      attachMedia(fixture.actors.owner, {
        assetId: left.id, expectedVersion: starting.version, idempotencyKey: randomUUID(), slot: "BUSINESS_GALLERY", target: { kind: "BUSINESS_PROFILE" },
      }),
      attachMedia(fixture.actors.manager, {
        assetId: right.id, expectedVersion: starting.version, idempotencyKey: randomUUID(), slot: "BUSINESS_GALLERY", target: { kind: "BUSINESS_PROFILE" },
      }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.ok(results.find((result) => result.status === "rejected")?.reason instanceof MediaDomainError);
    let container = await getMediaContainer(fixture.actors.owner, { kind: "BUSINESS_PROFILE" });
    assert.equal(container.bindings.filter((binding) => binding.slot === "BUSINESS_GALLERY").length, 1);

    const third = await createReadyAsset(fixture.actors.owner, "BUSINESS_GALLERY_IMAGE");
    container = await attachMedia(fixture.actors.owner, {
      assetId: third.id,
      expectedVersion: container.version,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_GALLERY",
      target: { kind: "BUSINESS_PROFILE" },
    });
    const gallery = container.bindings.filter((binding) => binding.slot === "BUSINESS_GALLERY");
    assert.equal(gallery.length, 2);
    await assert.rejects(reorderMedia(fixture.actors.owner, {
      bindingIds: [gallery[0]!.id],
      expectedVersion: container.version,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_GALLERY",
      target: { kind: "BUSINESS_PROFILE" },
    }), rejectsCode("VALIDATION_ERROR"));
    container = await reorderMedia(fixture.actors.owner, {
      bindingIds: [gallery[1]!.id, gallery[0]!.id],
      expectedVersion: container.version,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_GALLERY",
      target: { kind: "BUSINESS_PROFILE" },
    });
    const reordered = container.bindings.filter((binding) => binding.slot === "BUSINESS_GALLERY");
    assert.deepEqual(reordered.map((binding) => binding.id), [gallery[1]!.id, gallery[0]!.id]);
    container = await updateMediaAltText(fixture.actors.manager, {
      altText: "  Gallery image \u0000 ",
      bindingId: reordered[0]!.id,
      expectedVersion: container.version,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_GALLERY",
      target: { kind: "BUSINESS_PROFILE" },
    });
    assert.equal(container.bindings.find((binding) => binding.id === reordered[0]!.id)?.altText, "Gallery image");
    const reusedAssetId = reordered[0]!.media!.assetId!;
    await assert.rejects(attachMedia(fixture.actors.owner, {
      assetId: reusedAssetId,
      expectedVersion: container.version,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_GALLERY",
      target: { kind: "BUSINESS_PROFILE" },
    }), rejectsCode("MEDIA_SLOT_OCCUPIED"));
  });

  await t.test("Business gallery enforces its exact active-item limit", async () => {
    let container = await getMediaContainer(fixture.actors.owner, { kind: "BUSINESS_PROFILE" });
    const active = container.bindings.filter((binding) => binding.slot === "BUSINESS_GALLERY").length;
    for (let index = active; index < 24; index += 1) {
      const asset = await createReadyAsset(fixture.actors.owner, "BUSINESS_GALLERY_IMAGE");
      container = await attachMedia(fixture.actors.owner, {
        assetId: asset.id,
        expectedVersion: container.version,
        idempotencyKey: randomUUID(),
        slot: "BUSINESS_GALLERY",
        target: { kind: "BUSINESS_PROFILE" },
      });
    }
    assert.equal(container.bindings.filter((binding) => binding.slot === "BUSINESS_GALLERY").length, 24);
    const overflow = await createReadyAsset(fixture.actors.owner, "BUSINESS_GALLERY_IMAGE");
    await assert.rejects(attachMedia(fixture.actors.owner, {
      assetId: overflow.id,
      expectedVersion: container.version,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_GALLERY",
      target: { kind: "BUSINESS_PROFILE" },
    }), rejectsCode("MEDIA_COLLECTION_LIMIT_REACHED"));
  });

  await t.test("service, store, product variant, and menu targets enforce exact organization ownership", async () => {
    const category = await prisma.category.create({ data: { name: "Gate 5B", slug: `gate5b-${randomUUID()}` } });
    const service = await prisma.service.create({
      data: { categoryId: category.id, name: "Managed service", organizationId: fixture.organization.id },
    });
    const store = await prisma.store.create({
      data: { name: "Managed store", organizationId: fixture.organization.id, slug: `gate5b-${randomUUID()}` },
    });
    const marketplaceCategory = await prisma.marketplaceCategory.create({
      data: { name: "Managed", normalizedName: "managed", slug: `gate5b-${randomUUID()}` },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: marketplaceCategory.id,
        name: "Managed product",
        normalizedSearchText: "managed product",
        slug: `managed-${randomUUID()}`,
        storeId: store.id,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        currency: "IQD",
        isDefault: true,
        optionKey: "default",
        price: "1000",
        productId: product.id,
        sku: `SKU-${randomUUID()}`,
        storeId: store.id,
        title: "Default",
      },
    });
    const menuCategory = await prisma.menuCategory.create({
      data: { businessId: fixture.organization.id, name: "Managed menu" },
    });
    const menuItem = await prisma.menuItem.create({
      data: { businessId: fixture.organization.id, menuCategoryId: menuCategory.id, name: "Managed item", price: "5000" },
    });
    const cases = [
      { purpose: "SERVICE_IMAGE", slot: "SERVICE_PRIMARY", target: { kind: "SERVICE", serviceId: service.id } },
      { purpose: "STORE_LOGO", slot: "STORE_LOGO", target: { kind: "STORE", storeId: store.id } },
      { purpose: "STORE_COVER", slot: "STORE_COVER", target: { kind: "STORE", storeId: store.id } },
      { purpose: "RESTAURANT_MENU_IMAGE", slot: "MENU_ITEM_PRIMARY", target: { kind: "MENU_ITEM", menuItemId: menuItem.id } },
    ] as const;
    const versions = new Map<string, number>();
    for (const entry of cases) {
      const asset = await createReadyAsset(fixture.actors.owner, entry.purpose);
      const versionKey = JSON.stringify(entry.target);
      const result = await attachMedia(fixture.actors.owner, {
        assetId: asset.id,
        expectedVersion: versions.get(versionKey) ?? 0,
        idempotencyKey: randomUUID(),
        slot: entry.slot,
        target: entry.target,
      });
      versions.set(versionKey, result.version);
      assert.equal(result.bindings.some((binding) => binding.media?.assetId === asset.id), true);
      await assert.rejects(getMediaContainer(fixture.actors.foreignOwner, entry.target), rejectsCode("NOT_FOUND"));
    }
    const productAsset = await createReadyAsset(fixture.actors.owner, "PRODUCT_IMAGE");
    const productResult = await attachMedia(fixture.actors.owner, {
      assetId: productAsset.id,
      expectedVersion: 0,
      idempotencyKey: randomUUID(),
      productVariantId: variant.id,
      slot: "PRODUCT_IMAGE",
      target: { kind: "PRODUCT", productId: product.id },
    });
    assert.equal(productResult.bindings[0]?.variantId, variant.id);
    const foreignStore = await prisma.store.create({
      data: { name: "Foreign", organizationId: fixture.foreignOrganization.id, slug: `foreign-${randomUUID()}` },
    });
    const foreignProduct = await prisma.product.create({
      data: {
        categoryId: marketplaceCategory.id,
        name: "Foreign product",
        normalizedSearchText: "foreign product",
        slug: `foreign-${randomUUID()}`,
        storeId: foreignStore.id,
      },
    });
    const foreignVariant = await prisma.productVariant.create({
      data: {
        optionKey: "foreign", price: "1", productId: foreignProduct.id, sku: `FOREIGN-${randomUUID()}`, storeId: foreignStore.id, title: "Foreign",
      },
    });
    const anotherAsset = await createReadyAsset(fixture.actors.owner, "PRODUCT_IMAGE");
    await assert.rejects(attachMedia(fixture.actors.owner, {
      assetId: anotherAsset.id,
      expectedVersion: productResult.version,
      idempotencyKey: randomUUID(),
      productVariantId: foreignVariant.id,
      slot: "PRODUCT_IMAGE",
      target: { kind: "PRODUCT", productId: product.id },
    }), rejectsCode("NOT_FOUND"));
    assert.equal(await prisma.mediaBinding.count({ where: { assetId: anotherAsset.id } }), 0);
    assert.equal(await prisma.mediaMutation.count({ where: { container: { productId: product.id }, action: "ATTACH_MEDIA" } }), 1);

    await assert.rejects(prisma.mediaContainer.create({
      data: {
        kind: "STORE",
        organizationId: fixture.organization.id,
        storeId: foreignStore.id,
      },
    }));
    await assert.rejects(prisma.mediaBinding.create({
      data: {
        assetId: anotherAsset.id,
        containerId: productResult.id!,
        createdByPersonId: fixture.actors.owner.personId,
        slot: "SERVICE_PRIMARY",
      },
    }));
    await assert.rejects(prisma.mediaBinding.create({
      data: {
        assetId: anotherAsset.id,
        containerId: productResult.id!,
        createdByPersonId: fixture.actors.owner.personId,
        productVariantId: foreignVariant.id,
        slot: "PRODUCT_IMAGE",
        sortOrder: 1,
      },
    }));
    assert.equal(await prisma.mediaBinding.count({ where: { assetId: anotherAsset.id } }), 0);
  });

  await t.test("stable delivery authorizes canonical bindings, never persists signed targets, and delete succeeds after detach", async () => {
    const provider = new DeterministicStorageProvider();
    setStorageProviderForTests(provider);
    try {
      const customer = await getMediaContainer(fixture.actors.customer, { kind: "CUSTOMER_PROFILE" });
      const avatar = await createReadyAsset(fixture.actors.customer, "CUSTOMER_AVATAR", "READY", provider);
      await replaceSingletonMedia(fixture.actors.customer, {
        assetId: avatar.id,
        expectedVersion: customer.version,
        idempotencyKey: randomUUID(),
        slot: "CUSTOMER_AVATAR",
        target: { kind: "CUSTOMER_PROFILE" },
      });
      const privateTarget = await createPrivateAvatarDownloadTarget(fixture.actors.customer, avatar.id);
      assert.match(privateTarget.url, /^https:\/\/deterministic-storage\.invalid\/download\//u);
      await assert.rejects(createPublicMediaDownloadTarget(avatar.id), rejectsCode("NOT_FOUND"));

      let business = await getMediaContainer(fixture.actors.owner, { kind: "BUSINESS_PROFILE" });
      const cover = await createReadyAsset(fixture.actors.owner, "BUSINESS_COVER", "READY", provider);
      business = await attachMedia(fixture.actors.owner, {
        assetId: cover.id,
        expectedVersion: business.version,
        idempotencyKey: randomUUID(),
        slot: "BUSINESS_COVER",
        target: { kind: "BUSINESS_PROFILE" },
      });
      const publicTarget = await createPublicMediaDownloadTarget(cover.id);
      assert.match(publicTarget.url, /^https:\/\/deterministic-storage\.invalid\/download\//u);
      assert.doesNotMatch(JSON.stringify(await prisma.mediaMutation.findMany({ where: { containerId: business.id! } })), /signature=|deterministic-storage\.invalid/u);
      await prisma.organizationSettings.update({
        where: { organizationId: fixture.organization.id },
        data: { marketplaceVisible: false },
      });
      await assert.rejects(createPublicMediaDownloadTarget(cover.id), rejectsCode("NOT_FOUND"));
      await prisma.organizationSettings.update({
        where: { organizationId: fixture.organization.id },
        data: { marketplaceVisible: true },
      });
      await prisma.storedAsset.update({
        where: { id: cover.id },
        data: { quarantinedAt: new Date(), state: "QUARANTINED" },
      });
      await assert.rejects(createPublicMediaDownloadTarget(cover.id), rejectsCode("NOT_FOUND"));
      const suppressed = await resolvePublicMediaBatch([{
        id: fixture.organization.id,
        kind: "BUSINESS_PROFILE",
        legacyValues: ["https://cdn.example.com/cover.jpg"],
        slot: "BUSINESS_COVER",
      }]);
      assert.deepEqual(suppressed.get(`BUSINESS_PROFILE:${fixture.organization.id}:BUSINESS_COVER`), []);
      await prisma.storedAsset.update({ where: { id: cover.id }, data: { quarantinedAt: null, state: "READY" } });

      const galleryBinding = business.bindings.find((binding) => binding.slot === "BUSINESS_GALLERY")!;
      business = await detachMedia(fixture.actors.owner, {
        bindingId: galleryBinding.id,
        expectedVersion: business.version,
        idempotencyKey: randomUUID(),
        slot: "BUSINESS_GALLERY",
        target: { kind: "BUSINESS_PROFILE" },
      });
      const deletable = await createReadyAsset(fixture.actors.owner, "BUSINESS_GALLERY_IMAGE", "READY", provider);
      business = await attachMedia(fixture.actors.owner, {
        assetId: deletable.id,
        expectedVersion: business.version,
        idempotencyKey: randomUUID(),
        slot: "BUSINESS_GALLERY",
        target: { kind: "BUSINESS_PROFILE" },
      });
      const deletableBinding = business.bindings.find((binding) => binding.media?.assetId === deletable.id)!;
      business = await detachMedia(fixture.actors.manager, {
        bindingId: deletableBinding.id,
        expectedVersion: business.version,
        idempotencyKey: randomUUID(),
        slot: "BUSINESS_GALLERY",
        target: { kind: "BUSINESS_PROFILE" },
      });
      const deleted = await deleteStoredAsset(fixture.actors.owner, {
        assetId: deletable.id,
        expectedVersion: deletable.version,
        idempotencyKey: randomUUID(),
      });
      assert.equal(deleted.state, "DELETED");
      assert.equal(provider.hasObject(deletable.objectKey), false);
      assert.equal(await prisma.mediaBinding.count({ where: { assetId: deletable.id, state: "DETACHED" } }), 1);
    } finally {
      setStorageProviderForTests(undefined);
    }
  });

  await t.test("admin rejection atomically rejects and detaches active media with audit history", async () => {
    const original = await prisma.mediaBinding.findFirstOrThrow({
      where: { container: { kind: "BUSINESS_PROFILE", organizationId: fixture.organization.id }, slot: "BUSINESS_COVER", state: "ACTIVE" },
      include: { asset: true },
    });
    const asset = await createReadyAsset(fixture.actors.manager, "BUSINESS_COVER");
    const before = await getMediaContainer(fixture.actors.owner, { kind: "BUSINESS_PROFILE" });
    const attached = await replaceSingletonMedia(fixture.actors.manager, {
      assetId: asset.id,
      expectedVersion: before.version,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_COVER",
      target: { kind: "BUSINESS_PROFILE" },
    });
    const binding = attached.bindings.find((item) => item.media?.assetId === asset.id)!;
    assert.equal(await prisma.mediaBinding.findUniqueOrThrow({ where: { id: original.id } }).then((row) => row.state), "DETACHED");
    const rejected = await rejectStoredAsset(fixture.actors.admin, {
      assetId: asset.id,
      expectedVersion: asset.version,
      idempotencyKey: randomUUID(),
    });
    assert.equal(rejected.state, "REJECTED");
    const [storedBinding, current, mediaMutation, audit] = await Promise.all([
      prisma.mediaBinding.findUniqueOrThrow({ where: { id: binding.id } }),
      getMediaContainer(fixture.actors.owner, { kind: "BUSINESS_PROFILE" }),
      prisma.mediaMutation.findFirst({ where: { action: "ADMIN_DETACH_REJECTED_MEDIA", actorPersonId: fixture.actors.admin.personId } }),
      prisma.adminAuditLog.findFirst({ where: { action: "storage.asset.reject", targetId: asset.id } }),
    ]);
    assert.equal(storedBinding.state, "DETACHED");
    assert.equal(storedBinding.detachedByPersonId, fixture.actors.admin.personId);
    assert.equal(current.version, attached.version + 1);
    assert.equal(current.bindings.some((item) => item.id === binding.id), false);
    assert.ok(mediaMutation);
    assert.ok(audit);
    assert.equal(JSON.stringify(audit).includes(asset.objectKey), false);
  });

  await t.test("detaching preserves history, blocks stale repeats, and suppresses legacy fallback", async () => {
    const container = await getMediaContainer(fixture.actors.owner, { kind: "BUSINESS_PROFILE" });
    const gallery = container.bindings.find((binding) => binding.slot === "BUSINESS_GALLERY")!;
    const detached = await detachMedia(fixture.actors.owner, {
      bindingId: gallery.id,
      expectedVersion: container.version,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_GALLERY",
      target: { kind: "BUSINESS_PROFILE" },
    });
    assert.equal(detached.bindings.some((binding) => binding.id === gallery.id), false);
    await assert.rejects(detachMedia(fixture.actors.owner, {
      bindingId: gallery.id,
      expectedVersion: container.version,
      idempotencyKey: randomUUID(),
      slot: "BUSINESS_GALLERY",
      target: { kind: "BUSINESS_PROFILE" },
    }), rejectsCode("STALE_VERSION"));
    const batch = await resolvePublicMediaBatch([{
      id: fixture.organization.id,
      kind: "BUSINESS_PROFILE",
      legacyValues: ["https://cdn.example.com/legacy.jpg"],
      slot: "BUSINESS_GALLERY",
    }]);
    const values = batch.get(`BUSINESS_PROFILE:${fixture.organization.id}:BUSINESS_GALLERY`)!;
    assert.equal(values.some((value) => value.stableDeliveryPath === "https://cdn.example.com/legacy.jpg"), false);
    assert.equal(await prisma.mediaBinding.count({ where: { id: gallery.id, state: "DETACHED" } }), 1);
  });
});

async function createReadyAsset(
  actor: StorageActor,
  purpose: StoragePurpose,
  state: "READY" | "PENDING_INSPECTION" | "REJECTED" | "QUARANTINED" = "READY",
  deterministicProvider?: DeterministicStorageProvider,
) {
  const business = actor.kind === "business";
  const visibility: StorageVisibility = purpose === "CUSTOMER_AVATAR" ? "PRIVATE" : "PUBLIC";
  const objectKey = generateStorageObjectKey(purpose, { environment: "test" });
  const provider = deterministicProvider ? "DETERMINISTIC_TEST" : "NOT_CONFIGURED";
  if (deterministicProvider) {
    deterministicProvider.putObject({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp", objectKey });
  }
  const uploadSession = await prisma.uploadSession.create({
    data: {
      actorMembershipId: business ? actor.membershipId : null,
      actorPersonId: actor.personId,
      actorRoleId: business ? actor.roleId : null,
      displayName: "gate5b-test.webp",
      expectedMimeType: "image/webp",
      expectedSizeBytes: BigInt(256),
      expiresAt: new Date(Date.now() + 60_000),
      finalizedAt: new Date(),
      objectKey,
      organizationId: business ? actor.organizationId : null,
      ownerPersonId: business ? null : actor.personId,
      provider,
      purpose,
      state: "FINALIZED",
      visibility,
    },
  });
  return prisma.storedAsset.create({
    data: {
      checksumSha256: "a".repeat(64),
      createdByPersonId: actor.personId,
      displayName: "gate5b-test.webp",
      inspectionMetadata: { width: 640, height: 480 },
      inspectionOutcome: state === "REJECTED" ? "INVALID_STRUCTURE" : "VALID",
      mimeType: "image/webp",
      objectKey: uploadSession.objectKey,
      organizationId: business ? actor.organizationId : null,
      ownerPersonId: business ? null : actor.personId,
      provider,
      purpose,
      readyAt: state === "READY" ? new Date() : null,
      quarantinedAt: state === "QUARANTINED" ? new Date() : null,
      rejectedAt: state === "REJECTED" ? new Date() : null,
      scannerOutcome: "SCANNER_NOT_CONFIGURED",
      sizeBytes: BigInt(256),
      state,
      uploadSessionId: uploadSession.id,
      visibility,
    },
  });
}

function rejectsCode(code: string) {
  return (error: unknown) => (error instanceof MediaDomainError || error instanceof StorageDomainError) && error.code === code;
}
