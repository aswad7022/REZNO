import type { SystemRole } from "@prisma/client";

export type AssignableSystemRole = Exclude<SystemRole, "OWNER">;

export interface TeamBranchOption {
  id: string;
  name: string;
}

export interface TeamMemberDetails {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  roleName: string;
  systemRole: SystemRole | null;
  branchIds: string[];
  branchNames: string[];
  joinedAt: Date;
  photoUrl: string;
  bio: string;
  specialties: string[];
  publicSlug: string;
  isPublicProfessional: boolean;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  version: string;
  canManage: boolean;
  assignments: Array<{ id: string; branchId: string; version: string }>;
  serviceAssignments: Array<{ id: string; serviceId: string; serviceName: string; version: string }>;
}

export interface TeamInvitationDetails {
  id: string;
  email: string;
  roleName: string;
  systemRole: SystemRole | null;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
  createdAt: Date;
  expiresAt: Date | null;
  version: string;
}

export interface TeamManagementData {
  members: TeamMemberDetails[];
  invitations: TeamInvitationDetails[];
  branches: TeamBranchOption[];
  canEdit: boolean;
  organizationId: string;
  organizationName: string;
  services: Array<{ id: string; name: string }>;
  actorRole: SystemRole;
}

export type TeamMemberField =
  | "email"
  | "systemRole"
  | "branchIds"
  | "photoUrl"
  | "bio"
  | "specialties"
  | "publicSlug"
  | "isPublicProfessional";

export interface TeamMemberActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<TeamMemberField, string>>;
  code?: string;
  replayed?: boolean;
  version?: string;
  nextIdempotencyKey?: string;
}

export const initialTeamMemberActionState: TeamMemberActionState = {
  status: "idle",
};
