import type {
  PricingType,
  ServiceStatus,
  StaffSelectionMode,
} from "@prisma/client";

export interface ServiceOfferingDetails {
  id: string;
  branchId: string;
  branchName: string;
  price: string;
  durationMinutes: number;
  pricingType: PricingType;
  isAvailable: boolean;
  readinessIssue: "HOURS" | "STAFF" | null;
  version: string;
}

export interface ServiceDetails {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  categoryId: string;
  categorySlug: string;
  status: ServiceStatus;
  staffSelectionMode: StaffSelectionMode;
  assignedMemberIds: string[];
  staffAssignments: Array<{ id: string; memberId: string; version: string }>;
  offerings: ServiceOfferingDetails[];
  version: string;
}

export interface ServiceCatalogData {
  services: ServiceDetails[];
  branches: Array<{
    id: string;
    name: string;
    hasWorkingHours: boolean;
  }>;
  categories: Array<{ id: string; slug: string; name: string }>;
  members: Array<{ id: string; name: string }>;
  canEdit: boolean;
  organizationId: string;
  organizationName: string;
}

export type ServiceField =
  | "name"
  | "description"
  | "imageUrl"
  | "categoryId"
  | "status"
  | "staffSelectionMode"
  | "price"
  | "durationMinutes"
  | "pricingType"
  | "branchIds"
  | "memberIds";

export interface ServiceActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<ServiceField, string>>;
  code?: string;
  replayed?: boolean;
  version?: string;
  nextIdempotencyKey?: string;
}

export const initialServiceActionState: ServiceActionState = {
  status: "idle",
};
