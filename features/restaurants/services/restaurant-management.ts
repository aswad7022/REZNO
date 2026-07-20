import "server-only";

import { notFound } from "next/navigation";

import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import {
  listOperationalRestaurantMenu,
  listOperationalRestaurantTables,
} from "@/features/business-operations/services/restaurant-catalog";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { requireBusinessIdentity } from "@/features/identity/server";
import { resolvePublicMediaBatch } from "@/features/media/services/media-query";

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
  const items = result.categories.flatMap((category) => category.items);
  const media = await resolvePublicMediaBatch(items.map((item) => ({
    id: item.id,
    kind: "MENU_ITEM" as const,
    legacyValues: [item.imageUrl],
    slot: "MENU_ITEM_PRIMARY" as const,
  })));
  return {
    ...result,
    canEdit: result.canWrite,
    categories: result.categories.map((category) => ({
      ...category,
      items: category.items.map((item) => ({
        ...item,
        imageUrl: media.get(`MENU_ITEM:${item.id}:MENU_ITEM_PRIMARY`)?.[0]?.stableDeliveryPath ?? "",
      })),
    })),
  };
}
