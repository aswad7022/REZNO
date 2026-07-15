import type { EntityStatus } from "@prisma/client";

export interface BranchDetails {
  addressLine1: string;
  addressLine2: string;
  archivedAt: string | null;
  city: string;
  country: string;
  email: string;
  id: string;
  archiveIdempotencyKey: string;
  idempotencyKey: string;
  lifecycleIdempotencyKey: string;
  latitude: string;
  locationInstructions: string;
  locationLabel: string;
  longitude: string;
  name: string;
  nearbyLandmark: string;
  openDays: number[];
  phone: string;
  slug: string;
  status: EntityStatus;
  timezone: string;
  upcomingBlockCount: number;
  version: string;
}

export type BranchField =
  | "addressLine1" | "addressLine2" | "city" | "country" | "email"
  | "latitude" | "locationInstructions" | "locationLabel" | "longitude"
  | "name" | "nearbyLandmark" | "phone" | "timezone";

export interface BranchActionState {
  status: "idle" | "success" | "error";
  code?: string;
  details?: { genericBookings?: number; restaurantReservations?: number; total?: number };
  fieldErrors?: Partial<Record<BranchField, string>>;
  message?: string;
  nextIdempotencyKey?: string;
  replayed?: boolean;
  version?: string;
}

export const initialBranchActionState: BranchActionState = { status: "idle" };
