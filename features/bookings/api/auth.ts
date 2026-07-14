import "server-only";

import type { NextRequest } from "next/server";

import { bookingApiError } from "@/features/bookings/api/errors";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

export interface BookingCustomerApiContext {
  personId: string;
  userId: string;
}

export async function resolveBookingCustomerApiContext(
  request: NextRequest,
): Promise<BookingCustomerApiContext> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    bookingApiError("UNAUTHENTICATED", 401, "Authentication is required.");
  }

  const person = await prisma.person.findUnique({
    where: { authUserId: session.user.id },
    select: { id: true, deletedAt: true, isOnboarded: true, status: true },
  });
  if (!person || person.deletedAt || person.status !== "ACTIVE") {
    bookingApiError(
      "PROFILE_UNAVAILABLE",
      403,
      "An active customer profile is required.",
    );
  }
  if (!person.isOnboarded) {
    bookingApiError(
      "PROFILE_INCOMPLETE",
      403,
      "Customer onboarding must be completed.",
    );
  }
  return { personId: person.id, userId: session.user.id };
}
