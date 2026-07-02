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
}

export interface TeamManagementData {
  members: TeamMemberDetails[];
  branches: TeamBranchOption[];
  canEdit: boolean;
}

export type TeamMemberField =
  | "email"
  | "systemRole"
  | "branchIds"
  | "photoUrl"
  | "bio"
  | "specialties";

export interface TeamMemberActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<TeamMemberField, string>>;
}

export const initialTeamMemberActionState: TeamMemberActionState = {
  status: "idle",
};
