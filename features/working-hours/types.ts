export interface WorkingDay {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export interface BranchWorkingHours {
  branchId: string;
  branchName: string;
  days: WorkingDay[];
  canEdit: boolean;
}

export interface WorkingHoursActionState {
  status: "idle" | "success" | "error";
  message?: string;
  dayErrors?: Partial<Record<number, string>>;
}

export const initialWorkingHoursActionState: WorkingHoursActionState = {
  status: "idle",
};
