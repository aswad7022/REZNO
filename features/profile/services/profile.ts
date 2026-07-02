import "server-only";

import { getCurrentIdentity } from "@/features/identity/server";
import type { ProfileDetails } from "@/features/profile/types";

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export async function getCurrentProfile(): Promise<ProfileDetails | null> {
  const identity = await getCurrentIdentity();

  if (!identity) {
    return null;
  }

  const { person, session } = identity;
  const fallbackName = splitName(session.user.name);

  return {
    firstName: person.firstName || fallbackName.firstName,
    lastName: person.lastName ?? fallbackName.lastName,
    displayName: person.displayName ?? "",
    phone: person.phone ?? "",
    email: session.user.email,
    avatarUrl: person.avatarUrl ?? session.user.image ?? "",
  };
}
