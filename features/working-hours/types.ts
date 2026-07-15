export interface WorkingDay { closeTime: string; dayOfWeek: number; isOpen: boolean; openTime: string }

export interface BranchWorkingHours {
  branchId: string;
  branchName: string;
  canEdit: boolean;
  days: WorkingDay[];
  idempotencyKey: string;
  organizationId: string;
  organizationName: string;
  timezone: string;
  version: string;
}

export interface WorkingHoursActionState {
  status: "idle" | "success" | "error";
  code?: string;
  details?: Record<string, boolean | number | string | null>;
  message?: string;
  dayErrors?: Partial<Record<number, string>>;
  nextIdempotencyKey?: string;
  replayed?: boolean;
  version?: string;
}

export const initialWorkingHoursActionState: WorkingHoursActionState = { status: "idle" };
