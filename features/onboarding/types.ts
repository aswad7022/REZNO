export interface BusinessOnboardingState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: {
    organizationName?: string;
    branchName?: string;
    slug?: string;
    vertical?: string;
  };
}

export const initialBusinessOnboardingState: BusinessOnboardingState = {
  status: "idle",
};
