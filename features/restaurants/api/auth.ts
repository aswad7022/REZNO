import "server-only";

import type { NextRequest } from "next/server";

import { restaurantReservationApiError } from "@/features/restaurants/api/errors";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

export async function resolveRestaurantReservationCustomer(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    restaurantReservationApiError("UNAUTHENTICATED", 401, "Authentication is required.");
  }
  const person = await prisma.person.findUnique({
    where: { authUserId: session.user.id },
    select: {
      id: true,
      deletedAt: true,
      isOnboarded: true,
      phone: true,
      status: true,
    },
  });
  if (
    !person ||
    person.deletedAt ||
    person.status !== "ACTIVE" ||
    !person.isOnboarded ||
    !person.phone?.trim()
  ) {
    restaurantReservationApiError(
      "CUSTOMER_UNAVAILABLE",
      403,
      "An active, onboarded customer with a completed phone number is required.",
    );
  }
  return { personId: person.id, userId: session.user.id };
}
