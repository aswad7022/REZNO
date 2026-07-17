import type { CommercePermission, Prisma } from "@prisma/client";

import { commerceError } from "@/features/commerce/domain/errors";
import { hashCheckoutRequest } from "@/features/commerce/domain/idempotency";
import {
  assignableCommercePermissions,
  canManageCommerceAccess,
  effectiveCommercePermissions,
  isValidCommercePermissionCombination,
} from "@/features/commerce/domain/merchant-access";
import {
  updateCommerceRolePermissionsSchema,
  type UpdateCommerceRolePermissionsInput,
} from "@/features/commerce/domain/commerce-access-input";
import {
  assertMerchantCommerceContextCurrent,
  assertRenderedMerchantOrganization,
  resolveMerchantCommerceContext,
  type MerchantActorReference,
} from "@/features/commerce/services/authorization";
import {
  assertCommerceExpectedVersion,
  mutationReplayTarget,
  recordMerchantMutation,
  resolveMerchantMutationReplay,
} from "@/features/commerce/services/merchant-mutation";
import {
  lockCommerceRole,
  runCommerceSerializable,
} from "@/features/commerce/services/transaction";
import { prisma } from "@/lib/db/prisma";

const roleSelect = {
  commercePermissions: true,
  id: true,
  name: true,
  organizationId: true,
  systemRole: true,
  updatedAt: true,
  _count: { select: { organizationMembers: true } },
} satisfies Prisma.RoleSelect;

export async function listCommerceAccessRoles(reference: MerchantActorReference) {
  const actor = await resolveMerchantCommerceContext(reference, "STORE_MANAGE");
  if (!canManageCommerceAccess(actor.systemRole)) {
    commerceError("FORBIDDEN", "Only an Organization Owner can manage Commerce access.");
  }
  const roles = await prisma.role.findMany({
    where: { organizationId: actor.organizationId, systemRole: { not: null } },
    select: roleSelect,
    orderBy: [{ systemRole: "asc" }, { name: "asc" }, { id: "asc" }],
    take: 50,
  });
  return {
    actor,
    roles: roles.map(roleDto),
  };
}

export async function updateCommerceRolePermissions(
  reference: MerchantActorReference,
  rawInput: UpdateCommerceRolePermissionsInput,
) {
  const parsed = updateCommerceRolePermissionsSchema.safeParse(rawInput);
  if (!parsed.success) commerceError("VALIDATION_ERROR", "Commerce access input is invalid.");
  const input = parsed.data;
  const requestHash = hashCheckoutRequest({ action: "commerce.access.update", ...input });
  return runCommerceSerializable(async (transaction) => {
    const actor = await resolveMerchantCommerceContext(reference, "STORE_MANAGE", transaction);
    if (!canManageCommerceAccess(actor.systemRole)) {
      commerceError("FORBIDDEN", "Only an Organization Owner can manage Commerce access.");
    }
    assertRenderedMerchantOrganization(actor, input.contextOrganizationId);
    const replay = await resolveMerchantMutationReplay(transaction, {
      actor,
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (replay) {
      mutationReplayTarget(replay, input.roleId);
      if (!replay.result || typeof replay.result !== "object" || Array.isArray(replay.result)) {
        commerceError("CONFLICT", "Commerce role replay result is unavailable.");
      }
      return replay.result as unknown as ReturnType<typeof roleDto>;
    }

    await lockCommerceRole(transaction, input.roleId, actor.organizationId);
    await assertMerchantCommerceContextCurrent(transaction, actor, "STORE_MANAGE");
    const role = await transaction.role.findFirst({
      where: { id: input.roleId, organizationId: actor.organizationId },
      select: roleSelect,
    });
    if (!role?.systemRole) commerceError("NOT_FOUND", "Organization role was not found.");
    if (role.systemRole === "OWNER") {
      commerceError("FORBIDDEN", "Owner Commerce permissions are fixed and cannot be edited.");
    }
    if (role.systemRole === "RECEPTIONIST") {
      commerceError("FORBIDDEN", "Receptionist Commerce access always fails closed.");
    }
    const allowed = new Set(assignableCommercePermissions(role.systemRole));
    if (input.permissions.some((permission) => !allowed.has(permission))) {
      commerceError("FORBIDDEN", "One or more Commerce permissions cannot be assigned to this role.");
    }
    if (!isValidCommercePermissionCombination(role.systemRole, input.permissions)) {
      commerceError(
        "VALIDATION_ERROR",
        "ORDER_MANAGE and ORDER_CANCEL require ORDER_VIEW, and Staff can never receive ORDER_CANCEL.",
      );
    }
    assertCommerceExpectedVersion(role.updatedAt, input.expectedVersion);
    const updated = await transaction.role.update({
      where: { id: role.id },
      data: { commercePermissions: input.permissions },
      select: roleSelect,
    });
    await recordMerchantMutation(transaction, {
      action: "commerce.access.update",
      actor,
      after: auditRole(updated.commercePermissions, updated.updatedAt),
      before: auditRole(role.commercePermissions, role.updatedAt),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      result: roleDto(updated),
      resultVersion: updated.updatedAt,
      targetId: updated.id,
      targetType: "Role",
    });
    return roleDto(updated);
  });
}

function roleDto(role: {
  _count: { organizationMembers: number };
  commercePermissions: CommercePermission[];
  id: string;
  name: string;
  systemRole: "OWNER" | "MANAGER" | "RECEPTIONIST" | "STAFF" | null;
  updatedAt: Date;
}) {
  return {
    assignablePermissions: assignableCommercePermissions(role.systemRole),
    effectivePermissions: effectiveCommercePermissions(role),
    expectedVersion: role.updatedAt.toISOString(),
    id: role.id,
    memberCount: role._count.organizationMembers,
    name: role.name,
    systemRole: role.systemRole,
  };
}

function auditRole(permissions: CommercePermission[], updatedAt: Date) {
  return { permissions, version: updatedAt.toISOString() };
}
