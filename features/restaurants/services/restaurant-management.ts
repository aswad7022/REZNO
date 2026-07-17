import "server-only";

import { notFound } from "next/navigation";

import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import {
  listOperationalRestaurantMenu,
  listOperationalRestaurantTables,
} from "@/features/business-operations/services/restaurant-catalog";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { requireBusinessIdentity } from "@/features/identity/server";

export async function requireRestaurantBusiness() {
  const identity = await requireBusinessIdentity();
  if (!isRestaurantVertical(identity.membership.organization.vertical)) {
    notFound();
  }
  return identity;
}

export async function getRestaurantTables() {
  await requireRestaurantBusiness();
  const result = await listOperationalRestaurantTables(
    await currentBusinessOperationReference("RESTAURANT_TABLE_READ"),
  );
  return { ...result, canEdit: result.canWrite };
}

export async function getRestaurantMenu() {
  await requireRestaurantBusiness();
  const result = await listOperationalRestaurantMenu(
    await currentBusinessOperationReference("RESTAURANT_MENU_READ"),
  );
  return { ...result, canEdit: result.canWrite };
}
