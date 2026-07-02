import type { EntityStatus } from "@prisma/client";

export interface BranchDetails {
  id: string;
  name: string;
  slug: string;
  phone: string;
  email: string;
  timezone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  country: string;
  latitude: string;
  longitude: string;
  locationLabel: string;
  nearbyLandmark: string;
  locationInstructions: string;
  status: EntityStatus;
  hasWorkingHours: boolean;
  nextWorkingDay: number | null;
}

export type BranchField =
  | "name"
  | "phone"
  | "email"
  | "timezone"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "country"
  | "latitude"
  | "longitude"
  | "locationLabel"
  | "nearbyLandmark"
  | "locationInstructions"
  | "status";

export interface BranchActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<BranchField, string>>;
}

export const initialBranchActionState: BranchActionState = {
  status: "idle",
};
