"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { BusinessOperationsError } from "@/features/business-operations/domain/errors";
import {
  createOperationalMenuCategory,
  createOperationalMenuItem,
  createOperationalRestaurantTable,
  removeOperationalMenuCategory,
  removeOperationalMenuItem,
  removeOperationalRestaurantTable,
  setOperationalMenuCategoryActive,
  setOperationalMenuItemAvailable,
  setOperationalRestaurantTableActive,
  updateOperationalMenuCategory,
  updateOperationalMenuItem,
  updateOperationalRestaurantTable,
} from "@/features/business-operations/services/restaurant-catalog";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { logServerError } from "@/lib/logging/server";

export interface RestaurantActionState {
  code?: BusinessOperationsError["code"];
  message?: string;
  nextIdempotencyKey?: string;
  replayed?: boolean;
  status: "idle" | "success" | "error";
  version?: string;
}

const operationFields = ["contextOrganizationId", "idempotencyKey"] as const;
const versionFields = [...operationFields, "expectedVersion"] as const;
const tableFields = [
  ...operationFields,
  "area",
  "branchId",
  "capacity",
  "code",
  "floor",
  "name",
  "positionLabel",
] as const;
const tableUpdateFields = [
  ...operationFields,
  "area",
  "capacity",
  "code",
  "expectedVersion",
  "floor",
  "name",
  "positionLabel",
] as const;
const categoryFields = [
  ...operationFields,
  "description",
  "name",
  "sortOrder",
] as const;
const categoryUpdateFields = [...categoryFields, "expectedVersion"] as const;
const itemFields = [
  ...operationFields,
  "currency",
  "description",
  "imageUrl",
  "menuCategoryId",
  "name",
  "preparationMinutes",
  "price",
  "sortOrder",
] as const;
const itemUpdateFields = [...itemFields, "expectedVersion"] as const;

function hasUnknownFields(formData: FormData, allowed: readonly string[]) {
  const fields = new Set(allowed);
  return [...formData.keys()].some(
    (key) => !key.startsWith("$ACTION_") && !fields.has(key),
  );
}

const operationEnvelope = z.object({
  contextOrganizationId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
}).strict();

const versionEnvelope = operationEnvelope.extend({
  expectedVersion: z.string().datetime({ offset: true }),
});

function parseOperation(formData: FormData) {
  return operationEnvelope.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
}

function parseVersionedOperation(formData: FormData) {
  return versionEnvelope.safeParse({
    contextOrganizationId: formData.get("contextOrganizationId"),
    expectedVersion: formData.get("expectedVersion"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
}

function tableCreateInput(formData: FormData) {
  return {
    area: formData.get("area"),
    branchId: formData.get("branchId"),
    capacity: Number(formData.get("capacity")),
    code: formData.get("code"),
    floor: formData.get("floor"),
    name: formData.get("name"),
    positionLabel: formData.get("positionLabel"),
  };
}

function tableUpdateInput(formData: FormData) {
  return {
    area: formData.get("area"),
    capacity: Number(formData.get("capacity")),
    code: formData.get("code"),
    floor: formData.get("floor"),
    name: formData.get("name"),
    positionLabel: formData.get("positionLabel"),
  };
}

function categoryInput(formData: FormData) {
  return {
    description: formData.get("description"),
    name: formData.get("name"),
    sortOrder: Number(formData.get("sortOrder")),
  };
}

function itemInput(formData: FormData) {
  const preparation = formData.get("preparationMinutes");
  return {
    currency: formData.get("currency"),
    description: formData.get("description"),
    imageUrl: formData.get("imageUrl"),
    menuCategoryId: formData.get("menuCategoryId"),
    name: formData.get("name"),
    preparationMinutes: preparation === "" ? null : Number(preparation),
    price: formData.get("price"),
    sortOrder: Number(formData.get("sortOrder")),
  };
}

function actionError(error: unknown, operation: string): RestaurantActionState {
  if (error instanceof BusinessOperationsError) {
    return { code: error.code, message: error.message, status: "error" };
  }
  logServerError(`businessOperations.restaurantCatalog.${operation}`, error);
  return {
    message: "تعذر حفظ العملية. حدّث الصفحة وحاول مرة أخرى.",
    status: "error",
  };
}

function success(result: { replayed: boolean; version: string }): RestaurantActionState {
  return {
    message: result.replayed ? "تم تأكيد النتيجة المحفوظة." : "تم حفظ التغيير.",
    nextIdempotencyKey: randomUUID(),
    replayed: result.replayed,
    status: "success",
    version: result.version,
  };
}

function refreshTables() {
  revalidatePath("/business/tables");
  revalidatePath("/business/reservations");
}

function refreshMenu() {
  revalidatePath("/business/menu");
}

export async function createRestaurantTable(
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const envelope = parseOperation(formData);
  if (!envelope.success || hasUnknownFields(formData, tableFields)) {
    return { code: "INVALID_REQUEST", message: "بيانات الطاولة غير صالحة.", status: "error" };
  }
  try {
    const result = await createOperationalRestaurantTable({
      actor: await currentBusinessOperationReference(),
      ...envelope.data,
      table: tableCreateInput(formData),
    });
    refreshTables();
    return success(result);
  } catch (error) {
    return actionError(error, "table-create");
  }
}

export async function updateRestaurantTable(
  tableId: string,
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const envelope = parseVersionedOperation(formData);
  if (!envelope.success || hasUnknownFields(formData, tableUpdateFields)) {
    return { code: "INVALID_REQUEST", message: "بيانات الطاولة غير صالحة.", status: "error" };
  }
  try {
    const result = await updateOperationalRestaurantTable({
      actor: await currentBusinessOperationReference(),
      ...envelope.data,
      table: tableUpdateInput(formData),
      tableId,
    });
    refreshTables();
    return success(result);
  } catch (error) {
    return actionError(error, "table-update");
  }
}

export async function setRestaurantTableActive(
  tableId: string,
  active: boolean,
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const envelope = parseVersionedOperation(formData);
  if (!envelope.success || hasUnknownFields(formData, versionFields)) {
    return { code: "INVALID_REQUEST", message: "بيانات حالة الطاولة غير صالحة.", status: "error" };
  }
  try {
    const result = await setOperationalRestaurantTableActive({
      active,
      actor: await currentBusinessOperationReference(),
      ...envelope.data,
      tableId,
    });
    refreshTables();
    return success(result);
  } catch (error) {
    return actionError(error, "table-lifecycle");
  }
}

export async function removeRestaurantTable(
  tableId: string,
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const envelope = parseVersionedOperation(formData);
  if (!envelope.success || hasUnknownFields(formData, versionFields)) {
    return { code: "INVALID_REQUEST", message: "بيانات حذف الطاولة غير صالحة.", status: "error" };
  }
  try {
    const result = await removeOperationalRestaurantTable({
      actor: await currentBusinessOperationReference(),
      ...envelope.data,
      tableId,
    });
    refreshTables();
    return success(result);
  } catch (error) {
    return actionError(error, "table-remove");
  }
}

export async function createMenuCategory(
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const envelope = parseOperation(formData);
  if (!envelope.success || hasUnknownFields(formData, categoryFields)) {
    return { code: "INVALID_REQUEST", message: "بيانات القسم غير صالحة.", status: "error" };
  }
  try {
    const result = await createOperationalMenuCategory({
      actor: await currentBusinessOperationReference(),
      ...envelope.data,
      category: categoryInput(formData),
    });
    refreshMenu();
    return success(result);
  } catch (error) {
    return actionError(error, "category-create");
  }
}

export async function updateMenuCategory(
  categoryId: string,
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const envelope = parseVersionedOperation(formData);
  if (!envelope.success || hasUnknownFields(formData, categoryUpdateFields)) {
    return { code: "INVALID_REQUEST", message: "بيانات القسم غير صالحة.", status: "error" };
  }
  try {
    const result = await updateOperationalMenuCategory({
      actor: await currentBusinessOperationReference(),
      ...envelope.data,
      category: categoryInput(formData),
      categoryId,
    });
    refreshMenu();
    return success(result);
  } catch (error) {
    return actionError(error, "category-update");
  }
}

export async function setMenuCategoryActive(
  categoryId: string,
  active: boolean,
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const envelope = parseVersionedOperation(formData);
  if (!envelope.success || hasUnknownFields(formData, versionFields)) {
    return { code: "INVALID_REQUEST", message: "بيانات حالة القسم غير صالحة.", status: "error" };
  }
  try {
    const result = await setOperationalMenuCategoryActive({
      active,
      actor: await currentBusinessOperationReference(),
      ...envelope.data,
      categoryId,
    });
    refreshMenu();
    return success(result);
  } catch (error) {
    return actionError(error, "category-lifecycle");
  }
}

export async function removeMenuCategory(
  categoryId: string,
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const envelope = parseVersionedOperation(formData);
  if (!envelope.success || hasUnknownFields(formData, versionFields)) {
    return { code: "INVALID_REQUEST", message: "بيانات حذف القسم غير صالحة.", status: "error" };
  }
  try {
    const result = await removeOperationalMenuCategory({
      actor: await currentBusinessOperationReference(),
      ...envelope.data,
      categoryId,
    });
    refreshMenu();
    return success(result);
  } catch (error) {
    return actionError(error, "category-remove");
  }
}

export async function createMenuItem(
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const envelope = parseOperation(formData);
  if (!envelope.success || hasUnknownFields(formData, itemFields)) {
    return { code: "INVALID_REQUEST", message: "بيانات الصنف غير صالحة.", status: "error" };
  }
  try {
    const result = await createOperationalMenuItem({
      actor: await currentBusinessOperationReference(),
      ...envelope.data,
      item: itemInput(formData),
    });
    refreshMenu();
    return success(result);
  } catch (error) {
    return actionError(error, "item-create");
  }
}

export async function updateMenuItem(
  itemId: string,
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const envelope = parseVersionedOperation(formData);
  if (!envelope.success || hasUnknownFields(formData, itemUpdateFields)) {
    return { code: "INVALID_REQUEST", message: "بيانات الصنف غير صالحة.", status: "error" };
  }
  try {
    const result = await updateOperationalMenuItem({
      actor: await currentBusinessOperationReference(),
      ...envelope.data,
      item: itemInput(formData),
      itemId,
    });
    refreshMenu();
    return success(result);
  } catch (error) {
    return actionError(error, "item-update");
  }
}

export async function setMenuItemAvailable(
  itemId: string,
  available: boolean,
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const envelope = parseVersionedOperation(formData);
  if (!envelope.success || hasUnknownFields(formData, versionFields)) {
    return { code: "INVALID_REQUEST", message: "بيانات توفر الصنف غير صالحة.", status: "error" };
  }
  try {
    const result = await setOperationalMenuItemAvailable({
      actor: await currentBusinessOperationReference(),
      available,
      ...envelope.data,
      itemId,
    });
    refreshMenu();
    return success(result);
  } catch (error) {
    return actionError(error, "item-lifecycle");
  }
}

export async function removeMenuItem(
  itemId: string,
  _state: RestaurantActionState,
  formData: FormData,
): Promise<RestaurantActionState> {
  const envelope = parseVersionedOperation(formData);
  if (!envelope.success || hasUnknownFields(formData, versionFields)) {
    return { code: "INVALID_REQUEST", message: "بيانات حذف الصنف غير صالحة.", status: "error" };
  }
  try {
    const result = await removeOperationalMenuItem({
      actor: await currentBusinessOperationReference(),
      ...envelope.data,
      itemId,
    });
    refreshMenu();
    return success(result);
  } catch (error) {
    return actionError(error, "item-remove");
  }
}
