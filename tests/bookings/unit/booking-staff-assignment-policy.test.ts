import assert from "node:assert/strict";
import test from "node:test";

import {
  activeServiceStaffAssignmentMemberIds,
  activeServiceStaffAssignmentWhere,
  serviceStaffPolicyAllowsMember,
  type ServiceStaffAssignmentPolicyRecord,
} from "../../../features/bookings/domain/staff-assignment-policy";

const validAssignment: ServiceStaffAssignmentPolicyRecord = {
  memberId: "member-active",
  serviceId: "service-a",
  member: {
    deletedAt: null,
    organizationId: "organization-a",
    status: "ACTIVE",
    person: { deletedAt: null, status: "ACTIVE" },
  },
};

test("canonical Service staff policy accepts only active same-service same-tenant assignments", () => {
  const deletedAt = new Date("2026-07-14T00:00:00.000Z");
  const assignments: ServiceStaffAssignmentPolicyRecord[] = [
    validAssignment,
    { ...validAssignment, memberId: "wrong-service", serviceId: "service-b" },
    {
      ...validAssignment,
      memberId: "wrong-tenant",
      member: { ...validAssignment.member, organizationId: "organization-b" },
    },
    {
      ...validAssignment,
      memberId: "inactive-member",
      member: { ...validAssignment.member, status: "INACTIVE" },
    },
    {
      ...validAssignment,
      memberId: "deleted-member",
      member: { ...validAssignment.member, deletedAt },
    },
    {
      ...validAssignment,
      memberId: "inactive-person",
      member: {
        ...validAssignment.member,
        person: { deletedAt: null, status: "INACTIVE" },
      },
    },
    {
      ...validAssignment,
      memberId: "deleted-person",
      member: {
        ...validAssignment.member,
        person: { deletedAt, status: "ACTIVE" },
      },
    },
  ];

  assert.deepEqual(
    [...activeServiceStaffAssignmentMemberIds({
      assignments,
      organizationId: "organization-a",
      serviceId: "service-a",
    })],
    ["member-active"],
  );
});

test("canonical policy preserves fallback only when no valid explicit assignment remains", () => {
  const noAssignments = new Set<string>();
  const explicitlyAssigned = new Set(["member-active"]);
  assert.equal(serviceStaffPolicyAllowsMember(noAssignments, "fallback"), true);
  assert.equal(
    serviceStaffPolicyAllowsMember(explicitlyAssigned, "member-active"),
    true,
  );
  assert.equal(
    serviceStaffPolicyAllowsMember(explicitlyAssigned, "fallback"),
    false,
  );
});

test("Prisma predicate prefilters the same active membership and Person states", () => {
  assert.deepEqual(activeServiceStaffAssignmentWhere, {
    member: {
      deletedAt: null,
      status: "ACTIVE",
      person: { deletedAt: null, status: "ACTIVE" },
    },
  });
});
