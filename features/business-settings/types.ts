import type { BusinessVertical, StaffSelectionMode } from "@prisma/client";

export interface BusinessSettingsDetails {
  vertical: BusinessVertical;
  bookingEnabled: boolean;
  marketplaceVisible: boolean;
  staffSelectionMode: StaffSelectionMode;
  cancellationWindowHours: number;
  canEdit: boolean;
}

export interface BusinessSettingsActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: {
    cancellationWindowHours?: string;
    vertical?: string;
    staffSelectionMode?: string;
  };
}

export const initialBusinessSettingsActionState: BusinessSettingsActionState = {
  status: "idle",
};
