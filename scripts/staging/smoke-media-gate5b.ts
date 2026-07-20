import assert from "node:assert/strict";
import type { SystemRole } from "@prisma/client";

import { MediaDomainError } from "../../features/media/domain/errors";
import {
  attachMedia,
  detachMedia,
  reorderMedia,
  replaceSingletonMedia,
  updateMediaAltText,
} from "../../features/media/services/media-lifecycle";
import { storageMediaCapabilities } from "../../features/media/services/capabilities";
import {
  createPrivateAvatarDownloadTarget,
  createPublicMediaDownloadTarget,
} from "../../features/media/services/delivery";
import { getMediaContainer, resolvePublicMediaBatch } from "../../features/media/services/media-query";
import { StorageDomainError } from "../../features/storage/domain/errors";
import { DeterministicStorageProvider } from "../../features/storage/providers/deterministic";
import { setStorageProviderForTests } from "../../features/storage/providers/registry";
import { rejectStoredAsset } from "../../features/storage/services/storage-admin";
import { deleteStoredAsset } from "../../features/storage/services/storage-assets";
import type {
  StorageAdminActor,
  StorageBusinessActor,
  StorageCustomerActor,
} from "../../features/storage/services/actor";
import { prisma } from "../../lib/db/prisma";
import {
  MEDIA_GATE5B_MARKER,
  mediaGate5bFingerprint,
  mediaGate5bFixtureIds as ids,
  seedMediaGate5bFixture,
} from "./media-gate5b-fixture";
import { assertMediaGate5bStaging } from "./media-gate5b-safety";

const evidence = new Set<string>();
let keyIndex = 0;

async function main() {
  const safety = await assertMediaGate5bStaging(prisma);
  const startingFingerprint = await mediaGate5bFingerprint(prisma);
  assert.equal((await prisma.mediaContainer.count({ where: { id: { in: Object.values(ids.containerIds) } } })), 6);
  const provider = new DeterministicStorageProvider();
  const actors = stagingActors();
  let restoredFingerprint: string | undefined;
  try {
    setStorageProviderForTests(undefined);
    assert.equal(storageMediaCapabilities().providerConfigured, false);
    prove("provider-not-configured truth");
    setStorageProviderForTests(provider);
    assert.equal(storageMediaCapabilities().providerConfigured, true);
    const fixtureAssets = await prisma.storedAsset.findMany({
      where: { id: { in: ids.assetIds } },
      select: { mimeType: true, objectKey: true },
    });
    for (const asset of fixtureAssets) {
      provider.putObject({ bytes: new Uint8Array([1, 2, 3, 4]), contentType: asset.mimeType, objectKey: asset.objectKey });
    }

    await customerLifecycle(actors);
    await businessLifecycle(actors);
    await domainLifecycle(actors);
    await deliveryAndRejection(actors, provider);
    await fallbackAndLeakage(actors);
    assert.ok(evidence.size >= 42, `Expected at least 42 focused Gate 5B checks, received ${evidence.size}.`);
  } finally {
    setStorageProviderForTests(undefined);
    restoredFingerprint = await seedMediaGate5bFixture(prisma);
    await prisma.$disconnect();
  }
  assert.equal(restoredFingerprint, startingFingerprint);
  console.log(JSON.stringify({
    ...safety,
    checks: evidence.size,
    fingerprint: startingFingerprint,
    fixture: MEDIA_GATE5B_MARKER,
    restoredFingerprint,
    status: "passed",
  }));
}

async function customerLifecycle(actors: ReturnType<typeof stagingActors>) {
  let customer = await getMediaContainer(actors.customerA, { kind: "CUSTOMER_PROFILE" });
  await assert.rejects(attachMedia(actors.customerA, {
    assetId: ids.assetIds[3]!, expectedVersion: customer.version, idempotencyKey: key(), slot: "CUSTOMER_AVATAR", target: { kind: "CUSTOMER_PROFILE" },
  }), rejectsCode("NOT_FOUND"));
  prove("foreign Customer denial");

  customer = await detachMedia(actors.customerA, {
    bindingId: activeBinding(customer, "CUSTOMER_AVATAR"),
    expectedVersion: customer.version,
    idempotencyKey: key(),
    slot: "CUSTOMER_AVATAR",
    target: { kind: "CUSTOMER_PROFILE" },
  });
  prove("Customer avatar detach");
  const replayKey = key();
  const attachInput = {
    altText: "Gate 5B customer avatar",
    assetId: ids.assetIds[1]!,
    expectedVersion: customer.version,
    idempotencyKey: replayKey,
    slot: "CUSTOMER_AVATAR" as const,
    target: { kind: "CUSTOMER_PROFILE" as const },
  };
  customer = await attachMedia(actors.customerA, attachInput);
  assert.deepEqual(await attachMedia(actors.customerA, attachInput), customer);
  prove("Customer avatar attach");
  prove("exact replay");
  await assert.rejects(attachMedia(actors.customerA, { ...attachInput, altText: "changed replay" }), rejectsCode("IDEMPOTENCY_CONFLICT"));
  prove("changed replay conflict");
  customer = await replaceSingletonMedia(actors.customerA, {
    assetId: ids.assetIds[2]!, expectedVersion: customer.version, idempotencyKey: key(), slot: "CUSTOMER_AVATAR", target: { kind: "CUSTOMER_PROFILE" },
  });
  prove("Customer avatar replace");

  const concurrentVersion = customer.version;
  const concurrent = await Promise.allSettled([
    replaceSingletonMedia(actors.customerA, {
      assetId: ids.assetIds[0]!, expectedVersion: concurrentVersion, idempotencyKey: key(), slot: "CUSTOMER_AVATAR", target: { kind: "CUSTOMER_PROFILE" },
    }),
    replaceSingletonMedia(actors.customerA, {
      assetId: ids.assetIds[1]!, expectedVersion: concurrentVersion, idempotencyKey: key(), slot: "CUSTOMER_AVATAR", target: { kind: "CUSTOMER_PROFILE" },
    }),
  ]);
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);
  prove("concurrent singleton replace");
  customer = await getMediaContainer(actors.customerA, { kind: "CUSTOMER_PROFILE" });
  const avatarId = customer.bindings[0]?.media?.assetId;
  assert.ok(avatarId);
  const privateTarget = await createPrivateAvatarDownloadTarget(actors.customerA, avatarId);
  assert.match(privateTarget.url, /^https:\/\/deterministic-storage\.invalid\/download\//u);
  await assert.rejects(createPrivateAvatarDownloadTarget(actors.customerB, avatarId), rejectsCode("NOT_FOUND"));
  await assert.rejects(createPublicMediaDownloadTarget(avatarId), rejectsCode("NOT_FOUND"));
  prove("private avatar delivery");
  prove("private avatar IDOR denial");
  prove("private avatar public denial");
}

async function businessLifecycle(actors: ReturnType<typeof stagingActors>) {
  let business = await getMediaContainer(actors.owner, { kind: "BUSINESS_PROFILE" });
  await assert.rejects(attachMedia(actors.receptionist, {
    assetId: ids.assetIds[10]!, expectedVersion: business.version, idempotencyKey: key(), slot: "BUSINESS_GALLERY", target: { kind: "BUSINESS_PROFILE" },
  }), rejectsCode("FORBIDDEN"));
  await assert.rejects(attachMedia(actors.staff, {
    assetId: ids.assetIds[10]!, expectedVersion: business.version, idempotencyKey: key(), slot: "BUSINESS_GALLERY", target: { kind: "BUSINESS_PROFILE" },
  }), rejectsCode("FORBIDDEN"));
  await assert.rejects(attachMedia(actors.revoked, {
    assetId: ids.assetIds[10]!, expectedVersion: business.version, idempotencyKey: key(), slot: "BUSINESS_GALLERY", target: { kind: "BUSINESS_PROFILE" },
  }), rejectsCode("FORBIDDEN"));
  prove("Receptionist denial");
  prove("Staff denial");
  prove("revoked member denial");

  await prisma.organizationMember.update({ where: { id: ids.memberIds[0]! }, data: { roleId: ids.roleIds[1]! } });
  await assert.rejects(getMediaContainer(actors.owner, { kind: "BUSINESS_PROFILE" }), rejectsCode("FORBIDDEN"));
  await prisma.organizationMember.update({ where: { id: ids.memberIds[0]! }, data: { roleId: ids.roleIds[0]! } });
  prove("Role ID replacement denial");
  await assert.rejects(getMediaContainer(actors.foreignOwner, { kind: "SERVICE", serviceId: ids.serviceIds[0]! }), rejectsCode("NOT_FOUND"));
  prove("foreign Organization denial");

  business = await replaceSingletonMedia(actors.owner, {
    assetId: ids.assetIds[5]!, expectedVersion: business.version, idempotencyKey: key(), slot: "BUSINESS_LOGO", target: { kind: "BUSINESS_PROFILE" },
  });
  prove("Owner Business logo replace");
  business = await replaceSingletonMedia(actors.manager, {
    assetId: ids.assetIds[7]!, expectedVersion: business.version, idempotencyKey: key(), slot: "BUSINESS_COVER", target: { kind: "BUSINESS_PROFILE" },
  });
  prove("Manager Business cover replace");
  await assert.rejects(replaceSingletonMedia(actors.owner, {
    assetId: ids.assetIds[26]!, expectedVersion: business.version, idempotencyKey: key(), slot: "BUSINESS_LOGO", target: { kind: "BUSINESS_PROFILE" },
  }), rejectsCode("MEDIA_PURPOSE_MISMATCH"));
  prove("wrong purpose denial");
  await assert.rejects(replaceSingletonMedia(actors.owner, {
    assetId: ids.assetIds[23]!, expectedVersion: business.version, idempotencyKey: key(), slot: "BUSINESS_LOGO", target: { kind: "BUSINESS_PROFILE" },
  }), rejectsCode("ASSET_NOT_READY"));
  prove("non-READY denial");

  const collectionVersion = business.version;
  const collection = await Promise.allSettled([
    attachMedia(actors.owner, {
      assetId: ids.assetIds[10]!, expectedVersion: collectionVersion, idempotencyKey: key(), slot: "BUSINESS_GALLERY", target: { kind: "BUSINESS_PROFILE" },
    }),
    attachMedia(actors.manager, {
      assetId: ids.assetIds[11]!, expectedVersion: collectionVersion, idempotencyKey: key(), slot: "BUSINESS_GALLERY", target: { kind: "BUSINESS_PROFILE" },
    }),
  ]);
  assert.equal(collection.filter((result) => result.status === "fulfilled").length, 1);
  prove("concurrent collection add");
  business = await getMediaContainer(actors.owner, { kind: "BUSINESS_PROFILE" });
  const activeAssetIds = new Set(business.bindings.filter((binding) => binding.slot === "BUSINESS_GALLERY").map((binding) => binding.media?.assetId));
  const missingAssetId = [ids.assetIds[10]!, ids.assetIds[11]!].find((assetId) => !activeAssetIds.has(assetId));
  assert.ok(missingAssetId);
  business = await attachMedia(actors.owner, {
    assetId: missingAssetId, expectedVersion: business.version, idempotencyKey: key(), slot: "BUSINESS_GALLERY", target: { kind: "BUSINESS_PROFILE" },
  });
  prove("gallery attach");
  const galleryIds = business.bindings.filter((binding) => binding.slot === "BUSINESS_GALLERY").map((binding) => binding.id);
  await assert.rejects(reorderMedia(actors.owner, {
    bindingIds: galleryIds.slice(1), expectedVersion: business.version, idempotencyKey: key(), slot: "BUSINESS_GALLERY", target: { kind: "BUSINESS_PROFILE" },
  }), rejectsCode("VALIDATION_ERROR"));
  prove("partial reorder denial");
  business = await reorderMedia(actors.owner, {
    bindingIds: [...galleryIds].reverse(), expectedVersion: business.version, idempotencyKey: key(), slot: "BUSINESS_GALLERY", target: { kind: "BUSINESS_PROFILE" },
  });
  assert.deepEqual(business.bindings.filter((binding) => binding.slot === "BUSINESS_GALLERY").map((binding) => binding.id), [...galleryIds].reverse());
  prove("gallery deterministic reorder");
  await assert.rejects(updateMediaAltText(actors.manager, {
    altText: "stale", bindingId: galleryIds[0]!, expectedVersion: business.version - 1, idempotencyKey: key(), slot: "BUSINESS_GALLERY", target: { kind: "BUSINESS_PROFILE" },
  }), rejectsCode("STALE_VERSION"));
  prove("stale version denial");
  business = await updateMediaAltText(actors.manager, {
    altText: "  Safe gallery text \u0000 ", bindingId: galleryIds[0]!, expectedVersion: business.version, idempotencyKey: key(), slot: "BUSINESS_GALLERY", target: { kind: "BUSINESS_PROFILE" },
  });
  assert.equal(business.bindings.find((binding) => binding.id === galleryIds[0])?.altText, "Safe gallery text");
  prove("alt text normalization");
  business = await detachMedia(actors.owner, {
    bindingId: galleryIds[0]!, expectedVersion: business.version, idempotencyKey: key(), slot: "BUSINESS_GALLERY", target: { kind: "BUSINESS_PROFILE" },
  });
  assert.equal(business.bindings.some((binding) => binding.id === galleryIds[0]), false);
  prove("gallery detach");

  const activeLogo = business.bindings.find((binding) => binding.slot === "BUSINESS_LOGO")?.media?.assetId;
  assert.equal(activeLogo, ids.assetIds[5]);
  await assert.rejects(deleteStoredAsset(actors.owner, {
    assetId: activeLogo!, expectedVersion: 1, idempotencyKey: key(),
  }), rejectsCode("ASSET_IN_USE"));
  prove("asset-in-use deletion denial");
  const oldLogo = await prisma.storedAsset.findUniqueOrThrow({ where: { id: ids.assetIds[4]! } });
  assert.equal((await deleteStoredAsset(actors.owner, {
    assetId: oldLogo.id, expectedVersion: oldLogo.version, idempotencyKey: key(),
  })).state, "DELETED");
  prove("detach then delete");
}

async function domainLifecycle(actors: ReturnType<typeof stagingActors>) {
  let service = await getMediaContainer(actors.owner, { kind: "SERVICE", serviceId: ids.serviceIds[0]! });
  service = await replaceSingletonMedia(actors.manager, {
    assetId: ids.assetIds[14]!, expectedVersion: service.version, idempotencyKey: key(), slot: "SERVICE_PRIMARY", target: { kind: "SERVICE", serviceId: ids.serviceIds[0]! },
  });
  prove("Service image replace");
  assert.equal(service.bindings[0]?.media?.assetId, ids.assetIds[14]);

  let store = await getMediaContainer(actors.owner, { kind: "STORE", storeId: ids.storeIds[0]! });
  store = await replaceSingletonMedia(actors.owner, {
    assetId: ids.assetIds[29]!, expectedVersion: store.version, idempotencyKey: key(), slot: "STORE_LOGO", target: { kind: "STORE", storeId: ids.storeIds[0]! },
  });
  prove("Store logo replace");
  await replaceSingletonMedia(actors.manager, {
    assetId: ids.assetIds[30]!, expectedVersion: store.version, idempotencyKey: key(), slot: "STORE_COVER", target: { kind: "STORE", storeId: ids.storeIds[0]! },
  });
  prove("Store cover replace");

  let product = await getMediaContainer(actors.owner, { kind: "PRODUCT", productId: ids.productIds[0]! });
  product = await attachMedia(actors.owner, {
    assetId: ids.assetIds[20]!, expectedVersion: product.version, idempotencyKey: key(), slot: "PRODUCT_IMAGE", target: { kind: "PRODUCT", productId: ids.productIds[0]! },
  });
  prove("Product media attach");
  product = await attachMedia(actors.manager, {
    assetId: ids.assetIds[28]!, expectedVersion: product.version, idempotencyKey: key(), productVariantId: ids.variantIds[0]!, slot: "PRODUCT_IMAGE", target: { kind: "PRODUCT", productId: ids.productIds[0]! },
  });
  assert.equal(product.bindings.some((binding) => binding.variantId === ids.variantIds[0] && binding.media?.assetId === ids.assetIds[28]), true);
  prove("ProductVariant media attach");
  await assert.rejects(attachMedia(actors.owner, {
    assetId: ids.assetIds[31]!, expectedVersion: product.version, idempotencyKey: key(), productVariantId: ids.variantIds[1]!, slot: "PRODUCT_IMAGE", target: { kind: "PRODUCT", productId: ids.productIds[0]! },
  }), rejectsCode("NOT_FOUND"));
  prove("foreign ProductVariant denial");

  let menu = await getMediaContainer(actors.owner, { kind: "MENU_ITEM", menuItemId: ids.menuItemIds[0]! });
  menu = await replaceSingletonMedia(actors.manager, {
    assetId: ids.assetIds[22]!, expectedVersion: menu.version, idempotencyKey: key(), slot: "MENU_ITEM_PRIMARY", target: { kind: "MENU_ITEM", menuItemId: ids.menuItemIds[0]! },
  });
  assert.equal(menu.bindings[0]?.media?.assetId, ids.assetIds[22]);
  prove("Menu-item image replace");
}

async function deliveryAndRejection(
  actors: ReturnType<typeof stagingActors>,
  provider: DeterministicStorageProvider,
) {
  const logoTarget = await createPublicMediaDownloadTarget(ids.assetIds[5]!);
  assert.match(logoTarget.url, /^https:\/\/deterministic-storage\.invalid\/download\//u);
  prove("public media delivery");
  setStorageProviderForTests(undefined);
  await assert.rejects(createPublicMediaDownloadTarget(ids.assetIds[5]!), rejectsCode("STORAGE_PROVIDER_FAILURE"));
  prove("safe unavailable-provider delivery error");
  setStorageProviderForTests(provider);

  const serviceAsset = await prisma.storedAsset.findUniqueOrThrow({ where: { id: ids.assetIds[14]! } });
  await assert.rejects(rejectStoredAsset(actors.viewAdmin, {
    assetId: serviceAsset.id, expectedVersion: serviceAsset.version, idempotencyKey: key(),
  }), rejectsCode("FORBIDDEN"));
  await assert.rejects(rejectStoredAsset(actors.revokedAdmin, {
    assetId: serviceAsset.id, expectedVersion: serviceAsset.version, idempotencyKey: key(),
  }), rejectsCode("FORBIDDEN"));
  prove("view-only Admin rejection denial");
  prove("revoked Admin rejection denial");
  const rejectKey = key();
  const rejected = await rejectStoredAsset(actors.fullAdmin, {
    assetId: serviceAsset.id, expectedVersion: serviceAsset.version, idempotencyKey: rejectKey,
  });
  assert.equal(rejected.state, "REJECTED");
  assert.deepEqual(await rejectStoredAsset(actors.fullAdmin, {
    assetId: serviceAsset.id, expectedVersion: serviceAsset.version, idempotencyKey: rejectKey,
  }), rejected);
  assert.equal(await prisma.mediaBinding.count({ where: { assetId: serviceAsset.id, state: "ACTIVE" } }), 0);
  assert.equal(await prisma.mediaMutation.count({ where: { action: "ADMIN_DETACH_REJECTED_MEDIA", actorPersonId: actors.fullAdmin.personId } }), 1);
  prove("Admin rejection detach");
  prove("Admin rejection replay");
  prove("rejected asset retained");
}

async function fallbackAndLeakage(actors: ReturnType<typeof stagingActors>) {
  const publicBatch = await resolvePublicMediaBatch([
    { id: ids.organizationIds[0]!, kind: "BUSINESS_PROFILE", legacyValues: ["https://legacy.example/business-logo.png"], slot: "BUSINESS_LOGO" },
    { id: ids.organizationIds[1]!, kind: "BUSINESS_PROFILE", legacyValues: ["https://legacy.example/foreign-logo.png"], slot: "BUSINESS_LOGO" },
    { id: ids.serviceIds[0]!, kind: "SERVICE", legacyValues: ["https://legacy.example/service.png"], slot: "SERVICE_PRIMARY" },
  ]);
  const canonical = publicBatch.get(`BUSINESS_PROFILE:${ids.organizationIds[0]}:BUSINESS_LOGO`)!;
  const legacy = publicBatch.get(`BUSINESS_PROFILE:${ids.organizationIds[1]}:BUSINESS_LOGO`)!;
  const detached = publicBatch.get(`SERVICE:${ids.serviceIds[0]}:SERVICE_PRIMARY`)!;
  assert.equal(canonical[0]?.source, "MANAGED_ASSET");
  assert.equal(canonical.some((item) => item.stableDeliveryPath.includes("legacy.example")), false);
  assert.equal(legacy[0]?.source, "LEGACY_URL");
  assert.deepEqual(detached, []);
  prove("canonical precedence");
  prove("legal legacy fallback");
  prove("detached-history suppression");

  const [mediaMutations, storageMutations, audits, containers] = await Promise.all([
    prisma.mediaMutation.findMany({ where: { actorPersonId: { in: ids.personIds } } }),
    prisma.storageMutation.findMany({ where: { actorPersonId: { in: ids.personIds } } }),
    prisma.adminAuditLog.findMany({ where: { adminUserId: { in: ids.userIds } } }),
    Promise.all([
      getMediaContainer(actors.owner, { kind: "BUSINESS_PROFILE" }),
      getMediaContainer(actors.owner, { kind: "PRODUCT", productId: ids.productIds[0]! }),
    ]),
  ]);
  const persisted = JSON.stringify({ audits, containers, mediaMutations, storageMutations });
  assert.doesNotMatch(persisted, /deterministic-storage\.invalid|signature=|objectKey|checksumSha256|providerObjectVersion|bucket|credential|token/iu);
  assert.doesNotMatch(persisted, /legacy\.example\/service\.png/u);
  prove("no signed URL persistence");
  prove("no object-key leakage");
  prove("redacted audit and mutation results");
  prove("no raw provider error persistence");
}

function activeBinding(
  container: Awaited<ReturnType<typeof getMediaContainer>>,
  slot: (typeof container.bindings)[number]["slot"],
) {
  const binding = container.bindings.find((item) => item.slot === slot);
  assert.ok(binding);
  return binding.id;
}

function stagingActors() {
  const customer = (personIndex: number): StorageCustomerActor => ({
    kind: "customer",
    personId: ids.personIds[personIndex]!,
    userId: ids.userIds[personIndex]!,
  });
  const business = (
    personIndex: number,
    memberIndex: number,
    systemRole: SystemRole,
  ): StorageBusinessActor => ({
    kind: "business",
    membershipId: ids.memberIds[memberIndex]!,
    organizationId: memberIndex === 5 ? ids.organizationIds[1]! : ids.organizationIds[0]!,
    personId: ids.personIds[personIndex]!,
    roleId: ids.roleIds[memberIndex]!,
    systemRole,
    userId: ids.userIds[personIndex]!,
  });
  const admin = (personIndex: number, accessIndex: number): StorageAdminActor => ({
    adminAccessId: ids.adminAccessIds[accessIndex]!,
    kind: "admin",
    personId: ids.personIds[personIndex]!,
    source: "database",
    userId: ids.userIds[personIndex]!,
  });
  return {
    customerA: customer(0),
    customerB: customer(1),
    foreignOwner: business(7, 5, "OWNER"),
    fullAdmin: admin(8, 0),
    manager: business(3, 1, "MANAGER"),
    owner: business(2, 0, "OWNER"),
    receptionist: business(4, 2, "RECEPTIONIST"),
    revoked: business(6, 4, "MANAGER"),
    revokedAdmin: admin(10, 2),
    staff: business(5, 3, "STAFF"),
    viewAdmin: admin(9, 1),
  };
}

function key() {
  keyIndex += 1;
  return `5b000000-0000-4000-8000-${String(12000 + keyIndex).padStart(12, "0")}`;
}

function rejectsCode(code: string) {
  return (error: unknown) => (error instanceof MediaDomainError || error instanceof StorageDomainError) && error.code === code;
}

function prove(label: string) {
  evidence.add(label);
}

main().catch((error) => {
  console.error(`Gate 5B staging smoke failed: ${error instanceof Error ? error.message : "unknown failure"}`);
  process.exitCode = 1;
});
