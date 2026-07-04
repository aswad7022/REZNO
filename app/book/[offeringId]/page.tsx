import { forbidden, redirect } from "next/navigation";

import { getCurrentIdentity } from "@/features/identity/server";
import { getSignInPath } from "@/lib/navigation/safe-redirect";

function bookingPath(offeringId: string): string {
  return `/customer/bookings/new?offeringId=${encodeURIComponent(offeringId)}`;
}

export default async function ContinueToBookingPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const { offeringId } = await params;
  const identity = await getCurrentIdentity();
  const next = bookingPath(offeringId);

  if (!identity) {
    redirect(getSignInPath(next));
  }
  if (identity.person.deletedAt || identity.person.status !== "ACTIVE") {
    forbidden();
  }
  if (!identity.person.isOnboarded) {
    redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}
