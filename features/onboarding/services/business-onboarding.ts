import { randomUUID } from "node:crypto";
import { Prisma, type BusinessVertical } from "@prisma/client";

import { OWNER_DEFAULT_COMMERCE_PERMISSIONS } from "@/features/identity/policies/authorization";
import { prisma } from "@/lib/db/prisma";

export type BusinessOnboardingInput = {
  branchName: string;
  branchSlug: string;
  organizationName: string;
  organizationSlug: string;
  personId: string;
  vertical: BusinessVertical;
};

export class BusinessOnboardingProvisioningError extends Error {
  constructor(
    public readonly code: "IDENTITY_INACTIVE" | "SLUG_TAKEN",
    message: string,
  ) {
    super(message);
    this.name = "BusinessOnboardingProvisioningError";
  }
}

async function findExistingOwnedOrganization(
  organizationSlug: string,
  personId: string,
) {
  const organization = await prisma.organization.findFirst({
    where: {
      slug: organizationSlug,
      deletedAt: null,
      isActive: true,
      status: "ACTIVE",
      organizationMembers: {
        some: {
          personId,
          deletedAt: null,
          status: "ACTIVE",
          person: { deletedAt: null, status: "ACTIVE" },
          role: { systemRole: "OWNER" },
        },
      },
    },
    select: {
      id: true,
      organizationMembers: {
        where: {
          personId,
          deletedAt: null,
          status: "ACTIVE",
          person: { deletedAt: null, status: "ACTIVE" },
          role: { systemRole: "OWNER" },
        },
        select: { organizationId: true, role: { select: { organizationId: true } } },
      },
    },
  });

  return organization?.organizationMembers.some(
    (membership) =>
      membership.organizationId === organization.id &&
      membership.role.organizationId === organization.id,
  )
    ? organization
    : null;
}

/**
 * Provisions a business from an already authenticated Person id. The caller
 * must derive personId from the server session; it is never accepted from form
 * data. The transaction intentionally creates no Store, so Commerce remains
 * private until an owner explicitly creates and activates it later.
 */
export async function provisionBusinessOnboarding(
  input: BusinessOnboardingInput,
): Promise<{ created: boolean; organizationId: string }> {
  const existing = await findExistingOwnedOrganization(
    input.organizationSlug,
    input.personId,
  );
  if (existing) {
    return { created: false, organizationId: existing.id };
  }

  const organizationId = randomUUID();
  const ownerRoleId = randomUUID();

  try {
    return await prisma.$transaction(
      async (transaction) => {
        const activePerson = await transaction.person.findFirst({
          where: {
            id: input.personId,
            deletedAt: null,
            status: "ACTIVE",
          },
          select: { id: true },
        });
        if (!activePerson) {
          throw new BusinessOnboardingProvisioningError(
            "IDENTITY_INACTIVE",
            "An active authenticated Person is required.",
          );
        }

        const slugOwner = await transaction.organization.findUnique({
          where: { slug: input.organizationSlug },
          select: { id: true },
        });
        if (slugOwner) {
          throw new BusinessOnboardingProvisioningError(
            "SLUG_TAKEN",
            "The organization slug is already in use.",
          );
        }

        await transaction.organization.create({
          data: {
            id: organizationId,
            name: input.organizationName,
            slug: input.organizationSlug,
            vertical: input.vertical,
            branches: {
              create: {
                name: input.branchName,
                slug: input.branchSlug,
              },
            },
            profile: { create: {} },
            roles: {
              create: {
                id: ownerRoleId,
                name: "Owner",
                description: "Full access to the organization.",
                isSystem: true,
                systemRole: "OWNER",
                commercePermissions: [...OWNER_DEFAULT_COMMERCE_PERMISSIONS],
              },
            },
            settings: { create: {} },
          },
        });

        await transaction.organizationMember.create({
          data: {
            organizationId,
            personId: activePerson.id,
            roleId: ownerRoleId,
            status: "ACTIVE",
          },
        });

        await transaction.person.update({
          where: { id: activePerson.id },
          data: { isOnboarded: true },
        });

        return { created: true, organizationId };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (error instanceof BusinessOnboardingProvisioningError) throw error;

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrentRetry = await findExistingOwnedOrganization(
        input.organizationSlug,
        input.personId,
      );
      if (concurrentRetry) {
        return { created: false, organizationId: concurrentRetry.id };
      }
      throw new BusinessOnboardingProvisioningError(
        "SLUG_TAKEN",
        "The organization slug is already in use.",
      );
    }

    throw error;
  }
}
