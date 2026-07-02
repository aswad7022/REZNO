export interface ProfileDetails {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  email: string;
  avatarUrl: string;
}

export interface ProfileActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<keyof Omit<ProfileDetails, "email">, string>>;
}

export const initialProfileActionState: ProfileActionState = {
  status: "idle",
};
