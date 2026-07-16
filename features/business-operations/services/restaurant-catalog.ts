import "server-only";

import { Prisma } from "@prisma/client";

import {
  operationalMenuCategorySchema,
  operationalMenuItemSchema,
  operationalRestaurantTableSchema,
} from "@/features/business-operations/domain/daily-operations";
import { businessOperationsError } from "@/features/business-operations/domain/errors";
import { canPerformBusinessOperation } from "@/features/business-operations/domain/policy";
import { hashBusinessOperation } from "@/features/business-operations/domain/validation";
import { recordBusinessOperation } from "@/features/business-operations/services/audit";
import {
  assertBusinessOperationActorCurrent,
  assertBusinessOperationMutationRate,
  assertRenderedOrganization,
  resolveBusinessOperationActor,
  type BusinessOperationActor,
  type BusinessOperationActorReference,
} from "@/features/business-operations/services/context";
import {
  assertExpectedVersion,
  lockBranch,
  lockMenuCategory,
  lockMenuItem,
  lockOrganization,
  lockRestaurantTable,
  resolveMutationReplay,
  runBusinessOperationTransaction,
} from "@/features/business-operations/services/transaction";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { prisma } from "@/lib/db/prisma";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    businessOperationsError("INVALID_REQUEST", `${label} must be a UUID.`);
  }
}

async function assertRestaurantOrganization(
  database: Pick<Prisma.TransactionClient, "organization">,
  actor: BusinessOperationActor,
) {
  const organization = await database.organization.findFirst({
    where: {
      deletedAt: null,
      id: actor.organizationId,
      isActive: true,
      status: "ACTIVE",
    },
    select: { id: true, vertical: true },
  });
  if (!organization || !isRestaurantVertical(organization.vertical)) {
    businessOperationsError("RESTAURANT_NOT_FOUND", "Restaurant Organization was not found.");
  }
  return organization;
}

async function replayMutable<T extends { id: string; updatedAt: Date }>(
  transaction: Prisma.TransactionClient,
  actor: BusinessOperationActor,
  input: { idempotencyKey: string; requestHash: string },
  load: (targetId: string) => Promise<T | null>,
) {
  const replay = await resolveMutationReplay(transaction, {
    actorMembershipId: actor.membershipId,
    idempotencyKey: input.idempotencyKey,
    organizationId: actor.organizationId,
    requestHash: input.requestHash,
  });
  if (!replay?.targetId) return null;
  const current = await load(replay.targetId);
  if (!current || current.updatedAt.getTime() !== replay.resultVersion.getTime()) {
    businessOperationsError("STALE_VERSION", "A later catalog change superseded this replay.");
  }
  return { id: current.id, replayed: true, version: current.updatedAt.toISOString() };
}

async function replayDeletion(
  transaction: Prisma.TransactionClient,
  actor: BusinessOperationActor,
  input: {
    idempotencyKey: string;
    requestHash: string;
    stillExists: (targetId: string) => Promise<boolean>;
  },
) {
  const replay = await resolveMutationReplay(transaction, {
    actorMembershipId: actor.membershipId,
    idempotencyKey: input.idempotencyKey,
    organizationId: actor.organizationId,
    requestHash: input.requestHash,
  });
  if (!replay?.targetId) return null;
  if (await input.stillExists(replay.targetId)) {
    businessOperationsError("STALE_VERSION", "The removed catalog record exists again.");
  }
  return { id: replay.targetId, replayed: true, version: replay.resultVersion.toISOString() };
}

function tableSnapshot(table: {
  area: string | null;
  branchId: string | null;
  capacity: number;
  code: string | null;
  floor: string | null;
  isActive: boolean;
  name: string;
  positionLabel: string | null;
}) {
  return {
    area: table.area,
    branchId: table.branchId,
    capacity: table.capacity,
    code: table.code,
    floor: table.floor,
    isActive: table.isActive,
    name: table.name,
    positionLabel: table.positionLabel,
  };
}

export async function listOperationalRestaurantTables(
  reference: BusinessOperationActorReference,
) {
  const actor = await resolveBusinessOperationActor(reference, "RESTAURANT_TABLE_READ");
  await assertRestaurantOrganization(prisma, actor);
  const management = canPerformBusinessOperation(actor.role, "RESTAURANT_TABLE_WRITE");
  const [tables, branches] = await Promise.all([
    prisma.restaurantTable.findMany({
      where: {
        businessId: actor.organizationId,
        ...(management
          ? {}
          : {
              branch: { deletedAt: null, status: "ACTIVE" },
              isActive: true,
            }),
      },
      include: { branch: { select: { id: true, name: true, status: true } } },
      orderBy: [{ branch: { name: "asc" } }, { isActive: "desc" }, { name: "asc" }, { id: "asc" }],
    }),
    prisma.branch.findMany({
      where: {
        deletedAt: null,
        organizationId: actor.organizationId,
        status: "ACTIVE",
      },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
  ]);
  return {
    branches,
    canWrite: management,
    organizationId: actor.organizationId,
    organizationName: actor.organizationName,
    role: actor.role,
    scope: management ? "MANAGEMENT" as const : "RECEPTIONIST" as const,
    tables: tables.map((table) => ({
      ...tableSnapshot(table),
      branch: table.branch,
      id: table.id,
      version: management ? table.updatedAt.toISOString() : undefined,
    })),
  };
}

export async function createOperationalRestaurantTable(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  idempotencyKey: string;
  table: unknown;
}) {
  assertUuid(input.idempotencyKey, "idempotencyKey");
  const parsed = operationalRestaurantTableSchema.safeParse(input.table);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Restaurant table input is invalid.");
  const actor = await resolveBusinessOperationActor(input.actor, "RESTAURANT_TABLE_WRITE");
  assertBusinessOperationMutationRate(actor, "restaurant-table-create");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({ action: "RESTAURANT_TABLE_CREATE", table: parsed.data });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockBranch(transaction, parsed.data.branchId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "RESTAURANT_TABLE_WRITE");
    await assertRestaurantOrganization(transaction, actor);
    const replay = await replayMutable(transaction, actor, { idempotencyKey: input.idempotencyKey, requestHash }, (targetId) =>
      transaction.restaurantTable.findFirst({ where: { businessId: actor.organizationId, id: targetId } }),
    );
    if (replay) return { ...replay, tableId: replay.id };
    const branch = await transaction.branch.findFirst({
      where: {
        deletedAt: null,
        id: parsed.data.branchId,
        organizationId: actor.organizationId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!branch) businessOperationsError("BRANCH_NOT_FOUND", "Active Restaurant Branch was not found.");
    const table = await transaction.restaurantTable.create({
      data: { ...parsed.data, businessId: actor.organizationId, isActive: true },
    });
    await recordBusinessOperation(transaction, {
      action: "RESTAURANT_TABLE_CREATE",
      actor,
      after: tableSnapshot(table),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      resultVersion: table.updatedAt,
      targetId: table.id,
      targetType: "RestaurantTable",
    });
    return { replayed: false, tableId: table.id, version: table.updatedAt.toISOString() };
  });
}

export async function updateOperationalRestaurantTable(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  table: unknown;
  tableId: string;
}) {
  assertUuid(input.tableId, "tableId");
  assertUuid(input.idempotencyKey, "idempotencyKey");
  const parsed = operationalRestaurantTableSchema.safeParse(input.table);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Restaurant table input is invalid.");
  const actor = await resolveBusinessOperationActor(input.actor, "RESTAURANT_TABLE_WRITE");
  assertBusinessOperationMutationRate(actor, "restaurant-table-update");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "RESTAURANT_TABLE_UPDATE",
    expectedVersion: input.expectedVersion,
    table: parsed.data,
    tableId: input.tableId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockRestaurantTable(transaction, input.tableId, actor.organizationId);
    await lockBranch(transaction, parsed.data.branchId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "RESTAURANT_TABLE_WRITE");
    await assertRestaurantOrganization(transaction, actor);
    const replay = await replayMutable(transaction, actor, { idempotencyKey: input.idempotencyKey, requestHash }, (targetId) =>
      transaction.restaurantTable.findFirst({ where: { businessId: actor.organizationId, id: targetId } }),
    );
    if (replay) return { ...replay, tableId: replay.id };
    const table = await transaction.restaurantTable.findFirst({
      where: { businessId: actor.organizationId, id: input.tableId },
    });
    const branch = await transaction.branch.findFirst({
      where: { deletedAt: null, id: parsed.data.branchId, organizationId: actor.organizationId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!table) businessOperationsError("TABLE_NOT_FOUND", "Restaurant table was not found.");
    if (!branch) businessOperationsError("BRANCH_NOT_FOUND", "Active Restaurant Branch was not found.");
    assertExpectedVersion(table.updatedAt, input.expectedVersion);
    const changedAt = new Date();
    const changed = await transaction.restaurantTable.updateMany({
      where: { businessId: actor.organizationId, id: table.id, updatedAt: table.updatedAt },
      data: { ...parsed.data, updatedAt: changedAt },
    });
    if (changed.count !== 1) businessOperationsError("STALE_VERSION", "Restaurant table changed concurrently.");
    await recordBusinessOperation(transaction, {
      action: "RESTAURANT_TABLE_UPDATE",
      actor,
      after: { ...parsed.data, isActive: table.isActive },
      before: tableSnapshot(table),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      resultVersion: changedAt,
      targetId: table.id,
      targetType: "RestaurantTable",
    });
    return { replayed: false, tableId: table.id, version: changedAt.toISOString() };
  });
}

export async function setOperationalRestaurantTableActive(input: {
  active: boolean;
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  tableId: string;
}) {
  assertUuid(input.tableId, "tableId");
  assertUuid(input.idempotencyKey, "idempotencyKey");
  const actor = await resolveBusinessOperationActor(input.actor, "RESTAURANT_TABLE_WRITE");
  assertBusinessOperationMutationRate(actor, "restaurant-table-lifecycle");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "RESTAURANT_TABLE_LIFECYCLE",
    active: input.active,
    expectedVersion: input.expectedVersion,
    tableId: input.tableId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockRestaurantTable(transaction, input.tableId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "RESTAURANT_TABLE_WRITE");
    await assertRestaurantOrganization(transaction, actor);
    const replay = await replayMutable(transaction, actor, { idempotencyKey: input.idempotencyKey, requestHash }, (targetId) =>
      transaction.restaurantTable.findFirst({ where: { businessId: actor.organizationId, id: targetId } }),
    );
    if (replay) return { ...replay, tableId: replay.id };
    const table = await transaction.restaurantTable.findFirst({
      where: { businessId: actor.organizationId, id: input.tableId },
      include: { branch: true },
    });
    if (!table) businessOperationsError("TABLE_NOT_FOUND", "Restaurant table was not found.");
    assertExpectedVersion(table.updatedAt, input.expectedVersion);
    if (input.active && (!table.branch || table.branch.deletedAt || table.branch.status !== "ACTIVE")) {
      businessOperationsError("BRANCH_NOT_FOUND", "Table requires an active Restaurant Branch.");
    }
    if (!input.active) {
      const futureReservations = await transaction.restaurantReservationDetails.count({
        where: {
          tableId: table.id,
          booking: {
            startsAt: { gt: new Date() },
            status: { in: ["PENDING", "CONFIRMED"] },
          },
        },
      });
      if (futureReservations > 0) {
        businessOperationsError(
          "TABLE_RESERVATION_CONFLICT",
          "Reassign future active reservations before deactivating this table.",
          { futureReservations },
        );
      }
    }
    const changedAt = new Date();
    const changed = await transaction.restaurantTable.updateMany({
      where: { id: table.id, updatedAt: table.updatedAt },
      data: { isActive: input.active, updatedAt: changedAt },
    });
    if (changed.count !== 1) businessOperationsError("STALE_VERSION", "Restaurant table changed concurrently.");
    await recordBusinessOperation(transaction, {
      action: "RESTAURANT_TABLE_LIFECYCLE",
      actor,
      after: { isActive: input.active },
      before: { isActive: table.isActive },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      resultVersion: changedAt,
      targetId: table.id,
      targetType: "RestaurantTable",
    });
    return { replayed: false, tableId: table.id, version: changedAt.toISOString() };
  });
}

export async function removeOperationalRestaurantTable(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  tableId: string;
}) {
  assertUuid(input.tableId, "tableId");
  assertUuid(input.idempotencyKey, "idempotencyKey");
  const actor = await resolveBusinessOperationActor(input.actor, "RESTAURANT_TABLE_WRITE");
  assertBusinessOperationMutationRate(actor, "restaurant-table-remove");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "RESTAURANT_TABLE_REMOVE",
    expectedVersion: input.expectedVersion,
    tableId: input.tableId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockRestaurantTable(transaction, input.tableId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "RESTAURANT_TABLE_WRITE");
    await assertRestaurantOrganization(transaction, actor);
    const replay = await replayDeletion(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
      stillExists: async (targetId) =>
        Boolean(await transaction.restaurantTable.findFirst({ where: { businessId: actor.organizationId, id: targetId }, select: { id: true } })),
    });
    if (replay) return { ...replay, tableId: replay.id };
    const table = await transaction.restaurantTable.findFirst({
      where: { businessId: actor.organizationId, id: input.tableId },
      include: { _count: { select: { reservations: true } } },
    });
    if (!table) businessOperationsError("TABLE_NOT_FOUND", "Restaurant table was not found.");
    assertExpectedVersion(table.updatedAt, input.expectedVersion);
    if (table._count.reservations > 0) {
      businessOperationsError(
        "HISTORICAL_RELATIONSHIP_CONFLICT",
        "A table with reservation history must be deactivated instead of removed.",
      );
    }
    const removedAt = new Date();
    await transaction.restaurantTable.delete({ where: { id: table.id } });
    await recordBusinessOperation(transaction, {
      action: "RESTAURANT_TABLE_REMOVE",
      actor,
      before: tableSnapshot(table),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      resultVersion: removedAt,
      targetId: table.id,
      targetType: "RestaurantTable",
    });
    return { replayed: false, tableId: table.id, version: removedAt.toISOString() };
  });
}

function categorySnapshot(category: {
  description: string | null;
  isActive: boolean;
  name: string;
  sortOrder: number;
}) {
  return {
    description: category.description,
    isActive: category.isActive,
    name: category.name,
    sortOrder: category.sortOrder,
  };
}

function itemSnapshot(item: {
  currency: string;
  description: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  menuCategoryId: string;
  name: string;
  preparationMinutes: number | null;
  price: { toString(): string };
  sortOrder: number;
}) {
  return {
    currency: item.currency,
    description: item.description,
    imageUrl: item.imageUrl,
    isAvailable: item.isAvailable,
    menuCategoryId: item.menuCategoryId,
    name: item.name,
    preparationMinutes: item.preparationMinutes,
    price: item.price.toString(),
    sortOrder: item.sortOrder,
  };
}

export async function listOperationalRestaurantMenu(
  reference: BusinessOperationActorReference,
) {
  const actor = await resolveBusinessOperationActor(reference, "RESTAURANT_MENU_READ");
  await assertRestaurantOrganization(prisma, actor);
  const management = canPerformBusinessOperation(actor.role, "RESTAURANT_MENU_WRITE");
  const categories = await prisma.menuCategory.findMany({
    where: {
      businessId: actor.organizationId,
      ...(management ? {} : { isActive: true }),
    },
    include: {
      items: {
        where: management ? {} : { isAvailable: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
  });
  return {
    canWrite: management,
    categories: categories.map((category) => ({
      ...categorySnapshot(category),
      id: category.id,
      items: category.items.map((item) => ({
        ...itemSnapshot(item),
        id: item.id,
        version: management ? item.updatedAt.toISOString() : undefined,
      })),
      version: management ? category.updatedAt.toISOString() : undefined,
    })),
    organizationId: actor.organizationId,
    organizationName: actor.organizationName,
    role: actor.role,
    scope: management ? "MANAGEMENT" as const : "RECEPTIONIST" as const,
  };
}

export async function createOperationalMenuCategory(input: {
  actor: BusinessOperationActorReference;
  category: unknown;
  contextOrganizationId: string;
  idempotencyKey: string;
}) {
  assertUuid(input.idempotencyKey, "idempotencyKey");
  const parsed = operationalMenuCategorySchema.safeParse(input.category);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Menu category input is invalid.");
  const actor = await resolveBusinessOperationActor(input.actor, "RESTAURANT_MENU_WRITE");
  assertBusinessOperationMutationRate(actor, "menu-category-create");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({ action: "MENU_CATEGORY_CREATE", category: parsed.data });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "RESTAURANT_MENU_WRITE");
    await assertRestaurantOrganization(transaction, actor);
    const replay = await replayMutable(transaction, actor, { idempotencyKey: input.idempotencyKey, requestHash }, (targetId) =>
      transaction.menuCategory.findFirst({ where: { businessId: actor.organizationId, id: targetId } }),
    );
    if (replay) return { ...replay, categoryId: replay.id };
    const category = await transaction.menuCategory.create({
      data: { ...parsed.data, businessId: actor.organizationId, isActive: true },
    });
    await recordBusinessOperation(transaction, {
      action: "MENU_CATEGORY_CREATE",
      actor,
      after: categorySnapshot(category),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      resultVersion: category.updatedAt,
      targetId: category.id,
      targetType: "MenuCategory",
    });
    return { categoryId: category.id, replayed: false, version: category.updatedAt.toISOString() };
  });
}

export async function updateOperationalMenuCategory(input: {
  actor: BusinessOperationActorReference;
  category: unknown;
  categoryId: string;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
}) {
  assertUuid(input.categoryId, "categoryId");
  assertUuid(input.idempotencyKey, "idempotencyKey");
  const parsed = operationalMenuCategorySchema.safeParse(input.category);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Menu category input is invalid.");
  const actor = await resolveBusinessOperationActor(input.actor, "RESTAURANT_MENU_WRITE");
  assertBusinessOperationMutationRate(actor, "menu-category-update");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "MENU_CATEGORY_UPDATE",
    category: parsed.data,
    categoryId: input.categoryId,
    expectedVersion: input.expectedVersion,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockMenuCategory(transaction, input.categoryId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "RESTAURANT_MENU_WRITE");
    await assertRestaurantOrganization(transaction, actor);
    const replay = await replayMutable(transaction, actor, { idempotencyKey: input.idempotencyKey, requestHash }, (targetId) =>
      transaction.menuCategory.findFirst({ where: { businessId: actor.organizationId, id: targetId } }),
    );
    if (replay) return { ...replay, categoryId: replay.id };
    const category = await transaction.menuCategory.findFirst({
      where: { businessId: actor.organizationId, id: input.categoryId },
    });
    if (!category) businessOperationsError("MENU_CATEGORY_NOT_FOUND", "Menu category was not found.");
    assertExpectedVersion(category.updatedAt, input.expectedVersion);
    const changedAt = new Date();
    const changed = await transaction.menuCategory.updateMany({
      where: { id: category.id, updatedAt: category.updatedAt },
      data: { ...parsed.data, updatedAt: changedAt },
    });
    if (changed.count !== 1) businessOperationsError("STALE_VERSION", "Menu category changed concurrently.");
    await recordBusinessOperation(transaction, {
      action: "MENU_CATEGORY_UPDATE",
      actor,
      after: { ...parsed.data, isActive: category.isActive },
      before: categorySnapshot(category),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      resultVersion: changedAt,
      targetId: category.id,
      targetType: "MenuCategory",
    });
    return { categoryId: category.id, replayed: false, version: changedAt.toISOString() };
  });
}

export async function setOperationalMenuCategoryActive(input: {
  active: boolean;
  actor: BusinessOperationActorReference;
  categoryId: string;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
}) {
  assertUuid(input.categoryId, "categoryId");
  assertUuid(input.idempotencyKey, "idempotencyKey");
  const actor = await resolveBusinessOperationActor(input.actor, "RESTAURANT_MENU_WRITE");
  assertBusinessOperationMutationRate(actor, "menu-category-lifecycle");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "MENU_CATEGORY_LIFECYCLE",
    active: input.active,
    categoryId: input.categoryId,
    expectedVersion: input.expectedVersion,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockMenuCategory(transaction, input.categoryId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "RESTAURANT_MENU_WRITE");
    await assertRestaurantOrganization(transaction, actor);
    const replay = await replayMutable(transaction, actor, { idempotencyKey: input.idempotencyKey, requestHash }, (targetId) =>
      transaction.menuCategory.findFirst({ where: { businessId: actor.organizationId, id: targetId } }),
    );
    if (replay) return { ...replay, categoryId: replay.id };
    const category = await transaction.menuCategory.findFirst({
      where: { businessId: actor.organizationId, id: input.categoryId },
    });
    if (!category) businessOperationsError("MENU_CATEGORY_NOT_FOUND", "Menu category was not found.");
    assertExpectedVersion(category.updatedAt, input.expectedVersion);
    const changedAt = new Date();
    await transaction.menuCategory.update({
      where: { id: category.id },
      data: { isActive: input.active, updatedAt: changedAt },
    });
    await recordBusinessOperation(transaction, {
      action: "MENU_CATEGORY_LIFECYCLE",
      actor,
      after: { isActive: input.active },
      before: { isActive: category.isActive },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      resultVersion: changedAt,
      targetId: category.id,
      targetType: "MenuCategory",
    });
    return { categoryId: category.id, replayed: false, version: changedAt.toISOString() };
  });
}

export async function removeOperationalMenuCategory(input: {
  actor: BusinessOperationActorReference;
  categoryId: string;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
}) {
  assertUuid(input.categoryId, "categoryId");
  assertUuid(input.idempotencyKey, "idempotencyKey");
  const actor = await resolveBusinessOperationActor(input.actor, "RESTAURANT_MENU_WRITE");
  assertBusinessOperationMutationRate(actor, "menu-category-remove");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "MENU_CATEGORY_REMOVE",
    categoryId: input.categoryId,
    expectedVersion: input.expectedVersion,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockMenuCategory(transaction, input.categoryId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "RESTAURANT_MENU_WRITE");
    await assertRestaurantOrganization(transaction, actor);
    const replay = await replayDeletion(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
      stillExists: async (targetId) => Boolean(await transaction.menuCategory.findFirst({ where: { businessId: actor.organizationId, id: targetId }, select: { id: true } })),
    });
    if (replay) return { ...replay, categoryId: replay.id };
    const category = await transaction.menuCategory.findFirst({
      where: { businessId: actor.organizationId, id: input.categoryId },
      include: { _count: { select: { items: true } } },
    });
    if (!category) businessOperationsError("MENU_CATEGORY_NOT_FOUND", "Menu category was not found.");
    assertExpectedVersion(category.updatedAt, input.expectedVersion);
    if (category._count.items > 0) {
      businessOperationsError(
        "HISTORICAL_RELATIONSHIP_CONFLICT",
        "Remove or move every item before removing this category.",
      );
    }
    const removedAt = new Date();
    await transaction.menuCategory.delete({ where: { id: category.id } });
    await recordBusinessOperation(transaction, {
      action: "MENU_CATEGORY_REMOVE",
      actor,
      before: categorySnapshot(category),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      resultVersion: removedAt,
      targetId: category.id,
      targetType: "MenuCategory",
    });
    return { categoryId: category.id, replayed: false, version: removedAt.toISOString() };
  });
}

async function activeSameTenantCategory(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  categoryId: string,
) {
  const category = await transaction.menuCategory.findFirst({
    where: { businessId: organizationId, id: categoryId },
    select: { id: true },
  });
  if (!category) businessOperationsError("MENU_CATEGORY_NOT_FOUND", "Menu category was not found.");
}

export async function createOperationalMenuItem(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  idempotencyKey: string;
  item: unknown;
}) {
  assertUuid(input.idempotencyKey, "idempotencyKey");
  const parsed = operationalMenuItemSchema.safeParse(input.item);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Menu item input is invalid.");
  const actor = await resolveBusinessOperationActor(input.actor, "RESTAURANT_MENU_WRITE");
  assertBusinessOperationMutationRate(actor, "menu-item-create");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({ action: "MENU_ITEM_CREATE", item: parsed.data });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockOrganization(transaction, actor.organizationId);
    await lockMenuCategory(transaction, parsed.data.menuCategoryId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "RESTAURANT_MENU_WRITE");
    await assertRestaurantOrganization(transaction, actor);
    const replay = await replayMutable(transaction, actor, { idempotencyKey: input.idempotencyKey, requestHash }, (targetId) =>
      transaction.menuItem.findFirst({ where: { businessId: actor.organizationId, id: targetId } }),
    );
    if (replay) return { ...replay, itemId: replay.id };
    await activeSameTenantCategory(transaction, actor.organizationId, parsed.data.menuCategoryId);
    const item = await transaction.menuItem.create({
      data: {
        ...parsed.data,
        businessId: actor.organizationId,
        isAvailable: true,
        price: new Prisma.Decimal(parsed.data.price),
      },
    });
    await recordBusinessOperation(transaction, {
      action: "MENU_ITEM_CREATE",
      actor,
      after: itemSnapshot(item),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      resultVersion: item.updatedAt,
      targetId: item.id,
      targetType: "MenuItem",
    });
    return { itemId: item.id, replayed: false, version: item.updatedAt.toISOString() };
  });
}

export async function updateOperationalMenuItem(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  item: unknown;
  itemId: string;
}) {
  assertUuid(input.itemId, "itemId");
  assertUuid(input.idempotencyKey, "idempotencyKey");
  const parsed = operationalMenuItemSchema.safeParse(input.item);
  if (!parsed.success) businessOperationsError("INVALID_REQUEST", "Menu item input is invalid.");
  const actor = await resolveBusinessOperationActor(input.actor, "RESTAURANT_MENU_WRITE");
  assertBusinessOperationMutationRate(actor, "menu-item-update");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "MENU_ITEM_UPDATE",
    expectedVersion: input.expectedVersion,
    item: parsed.data,
    itemId: input.itemId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockMenuItem(transaction, input.itemId, actor.organizationId);
    await lockMenuCategory(transaction, parsed.data.menuCategoryId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "RESTAURANT_MENU_WRITE");
    await assertRestaurantOrganization(transaction, actor);
    const replay = await replayMutable(transaction, actor, { idempotencyKey: input.idempotencyKey, requestHash }, (targetId) =>
      transaction.menuItem.findFirst({ where: { businessId: actor.organizationId, id: targetId } }),
    );
    if (replay) return { ...replay, itemId: replay.id };
    const item = await transaction.menuItem.findFirst({
      where: { businessId: actor.organizationId, id: input.itemId },
    });
    if (!item) businessOperationsError("MENU_ITEM_NOT_FOUND", "Menu item was not found.");
    assertExpectedVersion(item.updatedAt, input.expectedVersion);
    await activeSameTenantCategory(transaction, actor.organizationId, parsed.data.menuCategoryId);
    const changedAt = new Date();
    const changed = await transaction.menuItem.updateMany({
      where: { id: item.id, updatedAt: item.updatedAt },
      data: {
        ...parsed.data,
        price: new Prisma.Decimal(parsed.data.price),
        updatedAt: changedAt,
      },
    });
    if (changed.count !== 1) businessOperationsError("STALE_VERSION", "Menu item changed concurrently.");
    await recordBusinessOperation(transaction, {
      action: "MENU_ITEM_UPDATE",
      actor,
      after: { ...parsed.data, isAvailable: item.isAvailable },
      before: itemSnapshot(item),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      resultVersion: changedAt,
      targetId: item.id,
      targetType: "MenuItem",
    });
    return { itemId: item.id, replayed: false, version: changedAt.toISOString() };
  });
}

export async function setOperationalMenuItemAvailable(input: {
  actor: BusinessOperationActorReference;
  available: boolean;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  itemId: string;
}) {
  assertUuid(input.itemId, "itemId");
  assertUuid(input.idempotencyKey, "idempotencyKey");
  const actor = await resolveBusinessOperationActor(input.actor, "RESTAURANT_MENU_WRITE");
  assertBusinessOperationMutationRate(actor, "menu-item-lifecycle");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "MENU_ITEM_LIFECYCLE",
    available: input.available,
    expectedVersion: input.expectedVersion,
    itemId: input.itemId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockMenuItem(transaction, input.itemId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "RESTAURANT_MENU_WRITE");
    await assertRestaurantOrganization(transaction, actor);
    const replay = await replayMutable(transaction, actor, { idempotencyKey: input.idempotencyKey, requestHash }, (targetId) =>
      transaction.menuItem.findFirst({ where: { businessId: actor.organizationId, id: targetId } }),
    );
    if (replay) return { ...replay, itemId: replay.id };
    const item = await transaction.menuItem.findFirst({ where: { businessId: actor.organizationId, id: input.itemId } });
    if (!item) businessOperationsError("MENU_ITEM_NOT_FOUND", "Menu item was not found.");
    assertExpectedVersion(item.updatedAt, input.expectedVersion);
    const changedAt = new Date();
    await transaction.menuItem.update({
      where: { id: item.id },
      data: { isAvailable: input.available, updatedAt: changedAt },
    });
    await recordBusinessOperation(transaction, {
      action: "MENU_ITEM_LIFECYCLE",
      actor,
      after: { isAvailable: input.available },
      before: { isAvailable: item.isAvailable },
      idempotencyKey: input.idempotencyKey,
      requestHash,
      resultVersion: changedAt,
      targetId: item.id,
      targetType: "MenuItem",
    });
    return { itemId: item.id, replayed: false, version: changedAt.toISOString() };
  });
}

export async function removeOperationalMenuItem(input: {
  actor: BusinessOperationActorReference;
  contextOrganizationId: string;
  expectedVersion: string;
  idempotencyKey: string;
  itemId: string;
}) {
  assertUuid(input.itemId, "itemId");
  assertUuid(input.idempotencyKey, "idempotencyKey");
  const actor = await resolveBusinessOperationActor(input.actor, "RESTAURANT_MENU_WRITE");
  assertBusinessOperationMutationRate(actor, "menu-item-remove");
  assertRenderedOrganization(actor, input.contextOrganizationId);
  const requestHash = hashBusinessOperation({
    action: "MENU_ITEM_REMOVE",
    expectedVersion: input.expectedVersion,
    itemId: input.itemId,
  });
  return runBusinessOperationTransaction(async (transaction) => {
    await lockMenuItem(transaction, input.itemId, actor.organizationId);
    await assertBusinessOperationActorCurrent(transaction, actor, "RESTAURANT_MENU_WRITE");
    await assertRestaurantOrganization(transaction, actor);
    const replay = await replayDeletion(transaction, actor, {
      idempotencyKey: input.idempotencyKey,
      requestHash,
      stillExists: async (targetId) => Boolean(await transaction.menuItem.findFirst({ where: { businessId: actor.organizationId, id: targetId }, select: { id: true } })),
    });
    if (replay) return { ...replay, itemId: replay.id };
    const item = await transaction.menuItem.findFirst({
      where: { businessId: actor.organizationId, id: input.itemId },
      include: { _count: { select: { reservationItems: true } } },
    });
    if (!item) businessOperationsError("MENU_ITEM_NOT_FOUND", "Menu item was not found.");
    assertExpectedVersion(item.updatedAt, input.expectedVersion);
    if (item._count.reservationItems > 0) {
      businessOperationsError(
        "HISTORICAL_RELATIONSHIP_CONFLICT",
        "A menu item with preorder history must be made unavailable instead of removed.",
      );
    }
    const removedAt = new Date();
    await transaction.menuItem.delete({ where: { id: item.id } });
    await recordBusinessOperation(transaction, {
      action: "MENU_ITEM_REMOVE",
      actor,
      before: itemSnapshot(item),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      resultVersion: removedAt,
      targetId: item.id,
      targetType: "MenuItem",
    });
    return { itemId: item.id, replayed: false, version: removedAt.toISOString() };
  });
}
