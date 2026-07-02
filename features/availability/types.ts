import type { WorkingDay } from "@/features/working-hours/types";

export interface MemberAvailabilityBranch {
  id: string;
  name: string;
  timezone: string;
  days: WorkingDay[];
}

export interface MemberBlockedTime {
  id: string;
  branchName: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
}

export interface MemberAvailabilityData {
  memberId: string;
  memberName: string;
  branches: MemberAvailabilityBranch[];
  blockedTimes: MemberBlockedTime[];
  canEdit: boolean;
}

export interface AvailabilityActionState {
  status: "idle" | "success" | "error";
  message?: string;
  dayErrors?: Partial<Record<number, string>>;
}

export interface BlockedTimeActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: {
    branchId?: string;
    startsAt?: string;
    endsAt?: string;
    reason?: string;
  };
}

export const initialAvailabilityActionState: AvailabilityActionState = {
  status: "idle",
};

export const initialBlockedTimeActionState: BlockedTimeActionState = {
  status: "idle",
};
