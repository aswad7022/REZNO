import { createHash } from "node:crypto";
import type {
  MediaBindingState,
  MediaSlot,
  Prisma,
  PrismaClient,
  StoragePurpose,
  StoredAssetState,
} from "@prisma/client";

export const MEDIA_GATE5B_MARKER = "rezno-qa-media-gate5b";
const baseTime = new Date("2026-07-19T15:00:00.123Z");
const id = (value: number) => `5b000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

const personIds = Array.from({ length: 11 }, (_, index) => id(index + 1));
const userIds = personIds.map((_, index) => `${MEDIA_GATE5B_MARKER}-user-${index + 1}`);
const organizationIds = [id(101), id(102)];
const organizationSettingsIds = [id(103), id(104)];
const businessProfileIds = [id(111), id(112)];
const roleIds = Array.from({ length: 6 }, (_, index) => id(201 + index));
const memberIds = Array.from({ length: 6 }, (_, index) => id(301 + index));
const adminAccessIds = [id(401), id(402), id(403)];
const categoryIds = [id(501), id(502)];
const serviceIds = [id(601), id(602)];
const storeIds = [id(701), id(702)];
const marketplaceCategoryId = id(801);
const productIds = [id(901), id(902)];
const variantIds = [id(1001), id(1002)];
const menuCategoryIds = [id(1101), id(1102)];
const menuItemIds = [id(1201), id(1202)];
const legacyProductMediaIds = [id(1301), id(1302)];
const containerIds = {
  business: id(2002),
  customer: id(2001),
  menu: id(2006),
  product: id(2005),
  service: id(2003),
  store: id(2004),
} as const;
const bindingIds = Array.from({ length: 15 }, (_, index) => id(3001 + index));
const mutationIds = Array.from({ length: 12 }, (_, index) => id(4001 + index));
const uploadSessionIds = Array.from({ length: 32 }, (_, index) => id(5001 + index));
const assetIds = Array.from({ length: uploadSessionIds.length }, (_, index) => id(6001 + index));

export const mediaGate5bFixtureIds = {
  adminAccessIds,
  assetIds,
  bindingIds,
  businessProfileIds,
  categoryIds,
  containerIds,
  legacyProductMediaIds,
  marketplaceCategoryId,
  memberIds,
  menuCategoryIds,
  menuItemIds,
  mutationIds,
  organizationIds,
  organizationSettingsIds,
  personIds,
  productIds,
  roleIds,
  serviceIds,
  storeIds,
  uploadSessionIds,
  userIds,
  variantIds,
};

export async function cleanupMediaGate5bFixture(prisma: PrismaClient) {
  return {
    adminAuditLogs: (await prisma.adminAuditLog.deleteMany({ where: { adminUserId: { in: userIds } } })).count,
    mediaMutations: (await prisma.mediaMutation.deleteMany({ where: { actorPersonId: { in: personIds } } })).count,
    mediaBindings: (await prisma.mediaBinding.deleteMany({
      where: { containerId: { in: Object.values(containerIds) } },
    })).count,
    mediaContainers: (await prisma.mediaContainer.deleteMany({ where: { id: { in: Object.values(containerIds) } } })).count,
    storageMutations: (await prisma.storageMutation.deleteMany({ where: { actorPersonId: { in: personIds } } })).count,
    storedAssets: (await prisma.storedAsset.deleteMany({ where: { id: { in: assetIds } } })).count,
    uploadSessions: (await prisma.uploadSession.deleteMany({ where: { id: { in: uploadSessionIds } } })).count,
    legacyProductMedia: (await prisma.productMedia.deleteMany({ where: { id: { in: legacyProductMediaIds } } })).count,
    productVariants: (await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } })).count,
    products: (await prisma.product.deleteMany({ where: { id: { in: productIds } } })).count,
    marketplaceCategories: (await prisma.marketplaceCategory.deleteMany({ where: { id: marketplaceCategoryId } })).count,
    stores: (await prisma.store.deleteMany({ where: { id: { in: storeIds } } })).count,
    menuItems: (await prisma.menuItem.deleteMany({ where: { id: { in: menuItemIds } } })).count,
    menuCategories: (await prisma.menuCategory.deleteMany({ where: { id: { in: menuCategoryIds } } })).count,
    services: (await prisma.service.deleteMany({ where: { id: { in: serviceIds } } })).count,
    categories: (await prisma.category.deleteMany({ where: { id: { in: categoryIds } } })).count,
    businessProfiles: (await prisma.businessProfile.deleteMany({ where: { id: { in: businessProfileIds } } })).count,
    adminAccess: (await prisma.adminAccess.deleteMany({ where: { id: { in: adminAccessIds } } })).count,
    members: (await prisma.organizationMember.deleteMany({ where: { id: { in: memberIds } } })).count,
    roles: (await prisma.role.deleteMany({ where: { id: { in: roleIds } } })).count,
    organizationSettings: (await prisma.organizationSettings.deleteMany({
      where: { id: { in: organizationSettingsIds } },
    })).count,
    organizations: (await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } })).count,
    people: (await prisma.person.deleteMany({ where: { id: { in: personIds } } })).count,
    users: (await prisma.user.deleteMany({ where: { id: { in: userIds } } })).count,
  };
}

export async function seedMediaGate5bFixture(prisma: PrismaClient) {
  await cleanupMediaGate5bFixture(prisma);
  await prisma.user.createMany({ data: userIds.map((userId, index) => ({
    createdAt: baseTime,
    email: `${MEDIA_GATE5B_MARKER}-${index + 1}@rezno.invalid`,
    emailVerified: true,
    id: userId,
    image: index < 2 ? `https://legacy.example/customer-${index + 1}.png` : null,
    name: `Gate 5B actor ${index + 1}`,
    updatedAt: baseTime,
  })) });
  await prisma.person.createMany({ data: personIds.map((personId, index) => ({
    authUserId: userIds[index]!,
    avatarUrl: index < 2 ? `https://legacy.example/customer-${index + 1}.png` : null,
    createdAt: baseTime,
    firstName: `Gate5B-${index + 1}`,
    id: personId,
    isOnboarded: true,
    status: "ACTIVE",
    updatedAt: baseTime,
  })) });
  await prisma.organization.createMany({ data: [
    { createdAt: baseTime, id: organizationIds[0]!, isActive: true, name: "Gate 5B media organization", slug: MEDIA_GATE5B_MARKER, status: "ACTIVE", updatedAt: baseTime },
    { createdAt: baseTime, id: organizationIds[1]!, isActive: true, name: "Gate 5B foreign organization", slug: `${MEDIA_GATE5B_MARKER}-foreign`, status: "ACTIVE", updatedAt: baseTime },
  ] });
  await prisma.organizationSettings.createMany({ data: organizationIds.map((organizationId, index) => ({
    bookingEnabled: true,
    createdAt: baseTime,
    id: organizationSettingsIds[index]!,
    marketplaceVisible: true,
    organizationId,
    updatedAt: baseTime,
  })) });
  await prisma.businessProfile.createMany({ data: [
    {
      coverImageUrl: "https://legacy.example/business-cover.png",
      createdAt: baseTime,
      galleryUrls: ["https://legacy.example/gallery-1.png", "https://legacy.example/gallery-2.png"],
      id: businessProfileIds[0]!,
      logoUrl: "https://legacy.example/business-logo.png",
      ogImageUrl: "https://legacy.example/business-og.png",
      organizationId: organizationIds[0]!,
      updatedAt: baseTime,
    },
    {
      coverImageUrl: "https://legacy.example/foreign-cover.png",
      createdAt: baseTime,
      galleryUrls: ["https://legacy.example/foreign-gallery.png"],
      id: businessProfileIds[1]!,
      logoUrl: "https://legacy.example/foreign-logo.png",
      organizationId: organizationIds[1]!,
      updatedAt: baseTime,
    },
  ] });
  const roleKinds = ["OWNER", "MANAGER", "RECEPTIONIST", "STAFF", "MANAGER", "OWNER"] as const;
  await prisma.role.createMany({ data: roleIds.map((roleId, index) => ({
    createdAt: baseTime,
    id: roleId,
    isSystem: true,
    name: `${MEDIA_GATE5B_MARKER}-${roleKinds[index]}-${index + 1}`,
    organizationId: index === 5 ? organizationIds[1]! : organizationIds[0]!,
    systemRole: roleKinds[index]!,
    updatedAt: baseTime,
  })) });
  await prisma.organizationMember.createMany({ data: memberIds.map((memberId, index) => ({
    createdAt: baseTime,
    id: memberId,
    organizationId: index === 5 ? organizationIds[1]! : organizationIds[0]!,
    personId: personIds[index + 2]!,
    roleId: roleIds[index]!,
    status: index === 4 ? "INACTIVE" : "ACTIVE",
    updatedAt: baseTime,
  })) });
  await prisma.adminAccess.createMany({ data: [
    { createdAt: baseTime, id: adminAccessIds[0]!, permissions: ["STORAGE_RECORDS_VIEW", "STORAGE_RECORDS_MANAGE"], status: "ACTIVE", updatedAt: baseTime, userId: userIds[8]! },
    { createdAt: baseTime, id: adminAccessIds[1]!, permissions: ["STORAGE_RECORDS_VIEW"], status: "ACTIVE", updatedAt: baseTime, userId: userIds[9]! },
    { createdAt: baseTime, id: adminAccessIds[2]!, permissions: ["STORAGE_RECORDS_VIEW", "STORAGE_RECORDS_MANAGE"], status: "REVOKED", updatedAt: baseTime, userId: userIds[10]! },
  ] });
  await prisma.category.createMany({ data: [
    { createdAt: baseTime, id: categoryIds[0]!, name: "Gate 5B service", slug: MEDIA_GATE5B_MARKER, updatedAt: baseTime },
    { createdAt: baseTime, id: categoryIds[1]!, name: "Gate 5B foreign service", slug: `${MEDIA_GATE5B_MARKER}-foreign`, updatedAt: baseTime },
  ] });
  await prisma.service.createMany({ data: [
    { categoryId: categoryIds[0]!, createdAt: baseTime, id: serviceIds[0]!, imageUrl: "https://legacy.example/service.png", name: "Gate 5B service", organizationId: organizationIds[0]!, status: "ACTIVE", updatedAt: baseTime },
    { categoryId: categoryIds[1]!, createdAt: baseTime, id: serviceIds[1]!, imageUrl: "https://legacy.example/foreign-service.png", name: "Gate 5B foreign service", organizationId: organizationIds[1]!, status: "ACTIVE", updatedAt: baseTime },
  ] });
  await prisma.store.createMany({ data: [
    { coverImageUrl: "https://legacy.example/store-cover.png", createdAt: baseTime, id: storeIds[0]!, logoUrl: "https://legacy.example/store-logo.png", name: "Gate 5B store", organizationId: organizationIds[0]!, publishedAt: baseTime, slug: MEDIA_GATE5B_MARKER, status: "ACTIVE", updatedAt: baseTime },
    { coverImageUrl: "https://legacy.example/foreign-store-cover.png", createdAt: baseTime, id: storeIds[1]!, logoUrl: "https://legacy.example/foreign-store-logo.png", name: "Gate 5B foreign store", organizationId: organizationIds[1]!, publishedAt: baseTime, slug: `${MEDIA_GATE5B_MARKER}-foreign`, status: "ACTIVE", updatedAt: baseTime },
  ] });
  await prisma.marketplaceCategory.create({ data: {
    createdAt: baseTime,
    id: marketplaceCategoryId,
    name: "Gate 5B products",
    normalizedName: "gate 5b products",
    slug: MEDIA_GATE5B_MARKER,
    status: "ACTIVE",
    updatedAt: baseTime,
  } });
  await prisma.product.createMany({ data: [
    { categoryId: marketplaceCategoryId, createdAt: baseTime, id: productIds[0]!, name: "Gate 5B product", normalizedSearchText: "gate 5b product", publishedAt: baseTime, slug: "product", status: "PUBLISHED", storeId: storeIds[0]!, updatedAt: baseTime },
    { categoryId: marketplaceCategoryId, createdAt: baseTime, id: productIds[1]!, name: "Gate 5B foreign product", normalizedSearchText: "gate 5b foreign product", publishedAt: baseTime, slug: "foreign-product", status: "PUBLISHED", storeId: storeIds[1]!, updatedAt: baseTime },
  ] });
  await prisma.productVariant.createMany({ data: [
    { createdAt: baseTime, currency: "IQD", id: variantIds[0]!, isDefault: true, optionKey: "default", price: "1000", productId: productIds[0]!, sku: `${MEDIA_GATE5B_MARKER}-SKU`, status: "ACTIVE", storeId: storeIds[0]!, title: "Default", updatedAt: baseTime },
    { createdAt: baseTime, currency: "IQD", id: variantIds[1]!, isDefault: true, optionKey: "default", price: "2000", productId: productIds[1]!, sku: `${MEDIA_GATE5B_MARKER}-FOREIGN-SKU`, status: "ACTIVE", storeId: storeIds[1]!, title: "Foreign", updatedAt: baseTime },
  ] });
  await prisma.productMedia.createMany({ data: [
    { altText: "Legacy product", createdAt: baseTime, id: legacyProductMediaIds[0]!, productId: productIds[0]!, sortOrder: 0, updatedAt: baseTime, url: "https://legacy.example/product.png" },
    { altText: "Legacy foreign product", createdAt: baseTime, id: legacyProductMediaIds[1]!, productId: productIds[1]!, sortOrder: 0, updatedAt: baseTime, url: "https://legacy.example/foreign-product.png", variantId: variantIds[1]! },
  ] });
  await prisma.menuCategory.createMany({ data: [
    { businessId: organizationIds[0]!, createdAt: baseTime, id: menuCategoryIds[0]!, name: "Gate 5B menu", updatedAt: baseTime },
    { businessId: organizationIds[1]!, createdAt: baseTime, id: menuCategoryIds[1]!, name: "Gate 5B foreign menu", updatedAt: baseTime },
  ] });
  await prisma.menuItem.createMany({ data: [
    { businessId: organizationIds[0]!, createdAt: baseTime, id: menuItemIds[0]!, imageUrl: "https://legacy.example/menu.png", menuCategoryId: menuCategoryIds[0]!, name: "Gate 5B menu item", price: "5000", updatedAt: baseTime },
    { businessId: organizationIds[1]!, createdAt: baseTime, id: menuItemIds[1]!, imageUrl: "https://legacy.example/foreign-menu.png", menuCategoryId: menuCategoryIds[1]!, name: "Gate 5B foreign menu item", price: "6000", updatedAt: baseTime },
  ] });

  const assetDefinitions = mediaAssetDefinitions();
  await prisma.uploadSession.createMany({ data: assetDefinitions.map((asset, index) => ({
    actorMembershipId: asset.organizationId ? memberIds[asset.actorMemberIndex ?? 0]! : null,
    actorPersonId: asset.createdByPersonId,
    actorRoleId: asset.organizationId ? roleIds[asset.actorMemberIndex ?? 0]! : null,
    createdAt: timestamp(index),
    displayName: `${MEDIA_GATE5B_MARKER}-${index + 1}.webp`,
    expectedChecksumSha256: checksum(index),
    expectedMimeType: "image/webp",
    expectedSizeBytes: BigInt(256),
    expiresAt: new Date("2027-07-19T15:00:00.123Z"),
    finalizedAt: timestamp(index),
    id: uploadSessionIds[index]!,
    objectKey: objectKey(index),
    organizationId: asset.organizationId,
    ownerPersonId: asset.ownerPersonId,
    provider: "DETERMINISTIC_TEST",
    purpose: asset.purpose,
    state: "FINALIZED",
    targetIssuedAt: timestamp(index),
    updatedAt: timestamp(index),
    uploadedAt: timestamp(index),
    version: 2,
    visibility: asset.visibility,
  })) });
  await prisma.storedAsset.createMany({ data: assetDefinitions.map((asset, index) => storedAsset(asset, index)) });

  await prisma.mediaContainer.createMany({ data: [
    { createdAt: baseTime, id: containerIds.customer, kind: "CUSTOMER_PROFILE", personId: personIds[0]!, updatedAt: baseTime, version: 2 },
    { createdAt: baseTime, id: containerIds.business, kind: "BUSINESS_PROFILE", organizationId: organizationIds[0]!, updatedAt: baseTime, version: 8 },
    { createdAt: baseTime, id: containerIds.service, kind: "SERVICE", organizationId: organizationIds[0]!, serviceId: serviceIds[0]!, updatedAt: baseTime, version: 1 },
    { createdAt: baseTime, id: containerIds.store, kind: "STORE", organizationId: organizationIds[0]!, storeId: storeIds[0]!, updatedAt: baseTime, version: 2 },
    { createdAt: baseTime, id: containerIds.product, kind: "PRODUCT", organizationId: organizationIds[0]!, productId: productIds[0]!, updatedAt: baseTime, version: 4 },
    { createdAt: baseTime, id: containerIds.menu, kind: "MENU_ITEM", menuItemId: menuItemIds[0]!, organizationId: organizationIds[0]!, updatedAt: baseTime, version: 1 },
  ] });
  await prisma.mediaBinding.createMany({ data: [
    binding(0, containerIds.customer, 0, "CUSTOMER_AVATAR", null),
    binding(1, containerIds.business, 4, "BUSINESS_LOGO", null),
    binding(2, containerIds.business, 6, "BUSINESS_COVER", null),
    binding(3, containerIds.business, 8, "BUSINESS_GALLERY", 0),
    binding(4, containerIds.business, 9, "BUSINESS_GALLERY", 1),
    binding(5, containerIds.business, 12, "BUSINESS_GALLERY", 2, "DETACHED"),
    binding(6, containerIds.business, 27, "BUSINESS_COVER", null, "DETACHED"),
    binding(7, containerIds.service, 13, "SERVICE_PRIMARY", null),
    binding(8, containerIds.store, 15, "STORE_LOGO", null),
    binding(9, containerIds.store, 16, "STORE_COVER", null),
    binding(10, containerIds.product, 17, "PRODUCT_IMAGE", 0),
    binding(11, containerIds.product, 18, "PRODUCT_IMAGE", 1),
    binding(12, containerIds.product, 19, "PRODUCT_IMAGE", 2, "ACTIVE", variantIds[0]!),
    binding(13, containerIds.product, 25, "PRODUCT_IMAGE", 3, "DETACHED"),
    binding(14, containerIds.menu, 21, "MENU_ITEM_PRIMARY", null),
  ] });
  await prisma.mediaMutation.createMany({ data: mutationIds.map((mutationId, index) => ({
    action: index % 4 === 3 ? "REPLACE_MEDIA" : "ATTACH_MEDIA",
    actorPersonId: index === 0 ? personIds[0]! : index % 2 === 0 ? personIds[2]! : personIds[3]!,
    containerId: index === 0 ? containerIds.customer : [containerIds.business, containerIds.service, containerIds.store, containerIds.product, containerIds.menu][index % 5]!,
    createdAt: timestamp(100 + index),
    expectedVersion: index,
    id: mutationId,
    idempotencyKey: id(8001 + index),
    organizationId: index === 0 ? null : organizationIds[0]!,
    requestHash: checksum(100 + index),
    result: { fixture: MEDIA_GATE5B_MARKER, safe: true },
    resultVersion: index + 1,
    status: "COMPLETED",
    updatedAt: timestamp(100 + index),
  })) });
  return mediaGate5bFingerprint(prisma);
}

export async function mediaGate5bFingerprint(prisma: PrismaClient) {
  const [users, people, organizations, organizationSettings, members, admins, targets, sessions, assets, containers, bindings, mutations] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, orderBy: { id: "asc" }, select: { id: true } }),
    prisma.person.findMany({ where: { id: { in: personIds } }, orderBy: { id: "asc" }, select: { id: true, status: true } }),
    prisma.organization.findMany({ where: { id: { in: organizationIds } }, orderBy: { id: "asc" }, select: { id: true, status: true } }),
    prisma.organizationSettings.findMany({ where: { id: { in: organizationSettingsIds } }, orderBy: { id: "asc" }, select: { bookingEnabled: true, id: true, marketplaceVisible: true, organizationId: true } }),
    prisma.organizationMember.findMany({ where: { id: { in: memberIds } }, orderBy: { id: "asc" }, select: { id: true, roleId: true, status: true } }),
    prisma.adminAccess.findMany({ where: { id: { in: adminAccessIds } }, orderBy: { id: "asc" }, select: { id: true, permissions: true, status: true } }),
    Promise.all([
      prisma.service.findMany({ where: { id: { in: serviceIds } }, orderBy: { id: "asc" }, select: { id: true, organizationId: true } }),
      prisma.store.findMany({ where: { id: { in: storeIds } }, orderBy: { id: "asc" }, select: { id: true, organizationId: true } }),
      prisma.product.findMany({ where: { id: { in: productIds } }, orderBy: { id: "asc" }, select: { id: true, storeId: true } }),
      prisma.productVariant.findMany({ where: { id: { in: variantIds } }, orderBy: { id: "asc" }, select: { id: true, productId: true } }),
      prisma.menuItem.findMany({ where: { id: { in: menuItemIds } }, orderBy: { id: "asc" }, select: { businessId: true, id: true } }),
    ]),
    prisma.uploadSession.findMany({ where: { id: { in: uploadSessionIds } }, orderBy: { id: "asc" }, select: { id: true, purpose: true, state: true, visibility: true } }),
    prisma.storedAsset.findMany({ where: { id: { in: assetIds } }, orderBy: { id: "asc" }, select: { id: true, purpose: true, state: true, version: true, visibility: true } }),
    prisma.mediaContainer.findMany({ where: { id: { in: Object.values(containerIds) } }, orderBy: { id: "asc" }, select: { id: true, kind: true, version: true } }),
    prisma.mediaBinding.findMany({ where: { id: { in: bindingIds } }, orderBy: { id: "asc" }, select: { assetId: true, containerId: true, id: true, productVariantId: true, slot: true, sortOrder: true, state: true, version: true } }),
    prisma.mediaMutation.findMany({ where: { id: { in: mutationIds } }, orderBy: { id: "asc" }, select: { action: true, actorPersonId: true, containerId: true, id: true, status: true } }),
  ]);
  return createHash("sha256").update(JSON.stringify({ admins, assets, bindings, containers, members, mutations, organizations, organizationSettings, people, sessions, targets, users })).digest("hex");
}

type AssetDefinition = Readonly<{
  actorMemberIndex?: number;
  createdByPersonId: string;
  organizationId: string | null;
  ownerPersonId: string | null;
  purpose: StoragePurpose;
  state: StoredAssetState;
  visibility: "PRIVATE" | "PUBLIC";
}>;

function mediaAssetDefinitions(): AssetDefinition[] {
  const customer = (personIndex: number): AssetDefinition => ({
    createdByPersonId: personIds[personIndex]!, organizationId: null, ownerPersonId: personIds[personIndex]!, purpose: "CUSTOMER_AVATAR", state: "READY", visibility: "PRIVATE",
  });
  const business = (purpose: StoragePurpose, state: StoredAssetState = "READY", actorMemberIndex = 0): AssetDefinition => ({
    actorMemberIndex,
    createdByPersonId: personIds[actorMemberIndex + 2]!,
    organizationId: organizationIds[0]!,
    ownerPersonId: null,
    purpose,
    state,
    visibility: "PUBLIC",
  });
  return [
    customer(0), customer(0), customer(0), customer(1),
    business("BUSINESS_LOGO"), business("BUSINESS_LOGO"),
    business("BUSINESS_COVER"), business("BUSINESS_COVER", "READY", 1),
    business("BUSINESS_GALLERY_IMAGE"), business("BUSINESS_GALLERY_IMAGE", "READY", 1),
    business("BUSINESS_GALLERY_IMAGE"), business("BUSINESS_GALLERY_IMAGE", "READY", 1), business("BUSINESS_GALLERY_IMAGE"),
    business("SERVICE_IMAGE"), business("SERVICE_IMAGE", "READY", 1),
    business("STORE_LOGO"), business("STORE_COVER"),
    business("PRODUCT_IMAGE"), business("PRODUCT_IMAGE"), business("PRODUCT_IMAGE", "READY", 1), business("PRODUCT_IMAGE"),
    business("RESTAURANT_MENU_IMAGE"), business("RESTAURANT_MENU_IMAGE", "READY", 1),
    business("BUSINESS_LOGO", "REJECTED"), business("BUSINESS_LOGO", "QUARANTINED"),
    business("PRODUCT_IMAGE", "DELETE_PENDING"), business("SERVICE_IMAGE"), business("BUSINESS_COVER"),
    business("PRODUCT_IMAGE"), business("STORE_LOGO"), business("STORE_COVER"), business("PRODUCT_IMAGE"),
  ];
}

function storedAsset(asset: AssetDefinition, index: number): Prisma.StoredAssetCreateManyInput {
  const at = timestamp(index);
  return {
    checksumSha256: checksum(index),
    createdAt: at,
    createdByPersonId: asset.createdByPersonId,
    deleteRequestedAt: asset.state === "DELETE_PENDING" ? at : null,
    displayName: `${MEDIA_GATE5B_MARKER}-${index + 1}.webp`,
    id: assetIds[index]!,
    inspectionMetadata: { format: "webp", height: 480, pages: 1, width: 640 },
    inspectionOutcome: asset.state === "REJECTED" ? "INVALID_STRUCTURE" : asset.state === "QUARANTINED" ? "INSPECTION_FAILED" : "VALID",
    mimeType: "image/webp",
    objectKey: objectKey(index),
    organizationId: asset.organizationId,
    ownerPersonId: asset.ownerPersonId,
    provider: "DETERMINISTIC_TEST",
    purpose: asset.purpose,
    quarantinedAt: asset.state === "QUARANTINED" ? at : null,
    readyAt: asset.state === "READY" ? at : null,
    rejectedAt: asset.state === "REJECTED" ? at : null,
    scannerOutcome: "SCANNER_NOT_CONFIGURED",
    sizeBytes: BigInt(256),
    state: asset.state,
    updatedAt: at,
    uploadSessionId: uploadSessionIds[index]!,
    visibility: asset.visibility,
  };
}

function binding(
  bindingIndex: number,
  containerId: string,
  assetIndex: number,
  slot: MediaSlot,
  sortOrder: number | null,
  state: MediaBindingState = "ACTIVE",
  productVariantId: string | null = null,
): Prisma.MediaBindingCreateManyInput {
  const at = timestamp(200 + bindingIndex);
  return {
    altText: `Gate 5B ${slot.toLowerCase().replaceAll("_", " ")}`,
    assetId: assetIds[assetIndex]!,
    attachedAt: at,
    containerId,
    createdAt: at,
    createdByPersonId: slot === "CUSTOMER_AVATAR" ? personIds[0]! : personIds[2]!,
    detachedAt: state === "DETACHED" ? timestamp(300 + bindingIndex) : null,
    detachedByPersonId: state === "DETACHED" ? personIds[3]! : null,
    id: bindingIds[bindingIndex]!,
    productVariantId,
    slot,
    sortOrder,
    state,
    updatedAt: state === "DETACHED" ? timestamp(300 + bindingIndex) : at,
    version: state === "DETACHED" ? 2 : 1,
  };
}

function timestamp(offset: number) {
  return new Date(baseTime.getTime() + offset * 1_000);
}

function checksum(index: number) {
  return createHash("sha256").update(`${MEDIA_GATE5B_MARKER}:${index}`).digest("hex");
}

function objectKey(index: number) {
  return `staging/media/${id(9001 + index)}/${id(10001 + index)}`;
}
