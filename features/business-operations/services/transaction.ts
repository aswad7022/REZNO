import "server-only";

import { Prisma, type BusinessOperationMutation } from "@prisma/client";

import { BusinessOperationsError, businessOperationsError } from "@/features/business-operations/domain/errors";
import { prisma } from "@/lib/db/prisma";

const MAX_ATTEMPTS = 4;

function retryable(error: unknown) {
  if (error instanceof BusinessOperationsError) return false;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return /40001|40P01|serialization|deadlock|TransactionWriteConflict/i.test(message);
}

export async function runBusinessOperationTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      if (!retryable(error)) throw error;
    }
  }
  throw lastError;
}

export async function lockOrganization(
  transaction: Prisma.TransactionClient,
  organizationId: string,
) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Organization" WHERE "id" = CAST(${organizationId} AS uuid) FOR UPDATE`,
  );
}

export async function lockBranch(
  transaction: Prisma.TransactionClient,
  branchId: string,
  organizationId: string,
) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Branch" WHERE "id" = CAST(${branchId} AS uuid) AND "organizationId" = CAST(${organizationId} AS uuid) FOR UPDATE`,
  );
}

export async function lockService(
  transaction: Prisma.TransactionClient,
  serviceId: string,
  organizationId: string,
) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Service" WHERE "id" = CAST(${serviceId} AS uuid) AND "organizationId" = CAST(${organizationId} AS uuid) FOR UPDATE`,
  );
}

export async function lockMembership(
  transaction: Prisma.TransactionClient,
  membershipId: string,
  organizationId: string,
) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "OrganizationMember" WHERE "id" = CAST(${membershipId} AS uuid) AND "organizationId" = CAST(${organizationId} AS uuid) FOR UPDATE`,
  );
}

export async function resolveMutationReplay(
  transaction: Prisma.TransactionClient,
  input: {
    actorMembershipId: string;
    idempotencyKey: string;
    organizationId: string;
    requestHash: string;
  },
): Promise<BusinessOperationMutation | null> {
  const existing = await transaction.businessOperationMutation.findUnique({
    where: {
      organizationId_idempotencyKey: {
        idempotencyKey: input.idempotencyKey,
        organizationId: input.organizationId,
      },
    },
  });
  if (!existing) return null;
  if (
    existing.actorMembershipId !== input.actorMembershipId ||
    existing.requestHash !== input.requestHash
  ) {
    businessOperationsError(
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used for another operation.",
    );
  }
  return existing;
}

export function assertExpectedVersion(actual: Date, expected: string) {
  if (actual.toISOString() !== expected) {
    businessOperationsError("STALE_VERSION", "The operational record changed. Refresh and retry.");
  }
}
