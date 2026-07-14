import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import type { BusinessVertical } from "@prisma/client";

import { provisionPerson } from "@/features/identity/services/provision-person";
import { getSafeBusinessReturnPath } from "@/features/business-context/utils/return-path";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getSignInPath } from "@/lib/navigation/safe-redirect";

export const ACTIVE_BUSINESS_COOKIE = "rezno-active-business-id";

export const getCurrentSession = cache(async () =>
  auth.api.getSession({
    headers: await headers(),
  }),
);

async function getCurrentRequestPath() {
  return (await headers()).get("x-rezno-current-path");
}

export async function requireSession() {
  const session = await getCurrentSession();

  if (!session) {
    redirect(getSignInPath(await getCurrentRequestPath()));
  }

  return session;
}

export const getCurrentIdentity = cache(async () => {
  const session = await getCurrentSession();

  if (!session) {
    return null;
  }

  const person = await provisionPerson({
    authUserId: session.user.id,
    name: session.user.name,
    image: session.user.image,
  });

  return { person, session };
});

export async function requireIdentity() {
  const identity = await getCurrentIdentity();

  if (!identity) {
    redirect(getSignInPath(await getCurrentRequestPath()));
  }

  return identity;
}

export async function requireActiveIdentity() {
  const identity = await requireIdentity();

  if (identity.person.deletedAt || identity.person.status !== "ACTIVE") {
    forbidden();
  }

  return identity;
}

export async function getOptionalActiveIdentity() {
  const identity = await getCurrentIdentity();

  if (
    !identity ||
    identity.person.deletedAt ||
    identity.person.status !== "ACTIVE"
  ) {
    return null;
  }

  return identity;
}

export async function requireOnboardedIdentity() {
  const identity = await requireActiveIdentity();

  if (!identity.person.isOnboarded) {
    redirect("/onboarding");
  }

  return identity;
}

export async function requireCustomerIdentity() {
  return requireOnboardedIdentity();
}

export interface AccessibleBusiness {
  id: string;
  name: string;
  slug: string;
  vertical: BusinessVertical;
  roleName: string;
}

async function getActiveBusinessMemberships(personId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: {
      personId,
      deletedAt: null,
      status: "ACTIVE",
      organization: {
        deletedAt: null,
        isActive: true,
        status: "ACTIVE",
      },
    },
    include: {
      organization: true,
      role: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return memberships.filter(
    (membership) => membership.role.organizationId === membership.organizationId,
  );
}

export async function getAnyBusinessMembership(personId: string) {
  return (await getActiveBusinessMemberships(personId))[0] ?? null;
}

function toAccessibleBusiness(
  membership: Awaited<ReturnType<typeof getActiveBusinessMemberships>>[number],
): AccessibleBusiness {
  return {
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
    vertical: membership.organization.vertical,
    roleName: membership.role.name,
  };
}

export async function getBusinessContextState() {
  const identity = await requireOnboardedIdentity();
  const memberships = await getActiveBusinessMemberships(identity.person.id);
  const accessibleBusinesses = memberships.map(toAccessibleBusiness);

  if (memberships.length === 0) {
    return {
      status: "none" as const,
      ...identity,
      memberships,
      accessibleBusinesses,
    };
  }

  if (memberships.length === 1) {
    return {
      status: "ready" as const,
      ...identity,
      membership: memberships[0],
      memberships,
      accessibleBusinesses,
      activeBusinessId: memberships[0].organizationId,
    };
  }

  const selectedBusinessId = (await cookies()).get(ACTIVE_BUSINESS_COOKIE)?.value;
  const membership = memberships.find(
    (item) => item.organizationId === selectedBusinessId,
  );

  if (!membership) {
    return {
      status: "needsSelection" as const,
      ...identity,
      memberships,
      accessibleBusinesses,
      selectedBusinessId: selectedBusinessId ?? null,
    };
  }

  return {
    status: "ready" as const,
    ...identity,
    membership,
    memberships,
    accessibleBusinesses,
    activeBusinessId: membership.organizationId,
  };
}

export async function requireBusinessIdentity() {
  const context = await getBusinessContextState();

  if (context.status === "none") {
    redirect("/onboarding?intent=business");
  }

  if (context.status === "needsSelection") {
    const currentPath = (await headers()).get("x-rezno-current-path");
    const next = getSafeBusinessReturnPath(currentPath);
    redirect(`/select-business?next=${encodeURIComponent(next)}`);
  }

  return context;
}
