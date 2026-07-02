import "server-only";

import { cache } from "react";

import { requireIdentity } from "@/features/identity/server";
import type { DashboardUser } from "@/types/dashboard";

interface AuthenticatedDashboardUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export function toDashboardUser(
  user: AuthenticatedDashboardUser,
): DashboardUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };
}

export const getDashboardUser = cache(async (): Promise<DashboardUser> => {
  const { session } = await requireIdentity();

  return toDashboardUser(session.user);
});
