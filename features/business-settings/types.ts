export interface BusinessSettingsDetails {
  bookingEnabled: boolean;
  cancellationWindowHours: number;
  idempotencyKey: string;
  marketplaceVisible: boolean;
  organizationId: string;
  organizationName: string;
  version: string;
}

export interface BusinessSettingsActionState {
  status: "idle" | "success" | "error";
  code?: string;
  message?: string;
  nextIdempotencyKey?: string;
  replayed?: boolean;
  version?: string;
  fieldErrors?: { cancellationWindowHours?: string };
}

export const initialBusinessSettingsActionState: BusinessSettingsActionState = { status: "idle" };
