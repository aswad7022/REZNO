import { redirect } from "next/navigation";

import { getCurrentIdentity } from "@/features/identity/server";

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
    redirect(
      `/register?mode=signin&next=${encodeURIComponent(next)}`,
    );
  }
  if (!identity.person.isOnboarded) {
    redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}
