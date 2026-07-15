import type { EntityStatus, Prisma } from "@prisma/client";

export const activeServiceStaffAssignmentWhere = {
  member: {
    deletedAt: null,
    status: "ACTIVE",
    person: { deletedAt: null, status: "ACTIVE" },
  },
} as const satisfies Prisma.ServiceStaffAssignmentWhereInput;

export const serviceStaffAssignmentPolicySelect = {
  memberId: true,
  serviceId: true,
  member: {
    select: {
      deletedAt: true,
      organizationId: true,
      status: true,
      person: { select: { deletedAt: true, status: true } },
    },
  },
} as const satisfies Prisma.ServiceStaffAssignmentSelect;

export interface ServiceStaffAssignmentPolicyRecord {
  memberId: string;
  serviceId: string;
  member: {
    deletedAt: Date | null;
    organizationId: string;
    status: EntityStatus;
    person: { deletedAt: Date | null; status: EntityStatus };
  };
}

export function activeServiceStaffAssignmentMemberIds(input: {
  assignments: readonly ServiceStaffAssignmentPolicyRecord[];
  organizationId: string;
  serviceId: string;
}) {
  const memberIds = new Set<string>();
  for (const assignment of input.assignments) {
    if (
      assignment.serviceId === input.serviceId &&
      assignment.member.organizationId === input.organizationId &&
      assignment.member.status === "ACTIVE" &&
      assignment.member.deletedAt === null &&
      assignment.member.person.status === "ACTIVE" &&
      assignment.member.person.deletedAt === null
    ) {
      memberIds.add(assignment.memberId);
    }
  }
  return memberIds;
}

export function serviceStaffPolicyAllowsMember(
  activeAssignmentMemberIds: ReadonlySet<string>,
  memberId: string,
) {
  return activeAssignmentMemberIds.has(memberId);
}
