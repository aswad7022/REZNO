import "server-only";

import { notFound } from "next/navigation";

import { BusinessOperationsError } from "@/features/business-operations/domain/errors";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { listOperationalMemberBlocks } from "@/features/business-operations/services/member-blocks";
import { readOperationalStaffSchedule } from "@/features/business-operations/services/staff-schedules";
import type { MemberAvailabilityData } from "@/features/availability/types";

export async function getMemberAvailability(memberId: string): Promise<MemberAvailabilityData> {
  try {
    const reference = await currentBusinessOperationReference("MEMBER_BLOCK_READ");
    const blocks = await listOperationalMemberBlocks(reference, memberId);
    const schedules = await Promise.all(
      blocks.branches.map((branch) => readOperationalStaffSchedule(reference, memberId, branch.id)),
    );
    return {
      blockedTimes: blocks.blocks.map((block) => ({
        branchId: block.branchId,
        branchName: block.branchName,
        endsAt: new Date(block.endsAt),
        id: block.id,
        reason: block.reason ?? "",
        startsAt: new Date(block.startsAt),
        version: block.version,
      })),
      branches: schedules.map((schedule) => ({
        canEditSchedule: schedule.canWrite,
        days: schedule.days,
        id: schedule.branchId,
        name: schedule.branchName,
        timezone: schedule.timezone,
        version: schedule.version,
      })),
      canEdit: blocks.canWrite,
      memberId,
      memberName: blocks.memberName,
      organizationId: blocks.organizationId,
    };
  } catch (error) {
    if (error instanceof BusinessOperationsError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}
