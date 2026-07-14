import type { MobileAuthMode } from "../auth/form";

export type HomeHeaderActionMode = "icon-only" | "labeled";

export const HOME_HEADER_ACTION_MODE: HomeHeaderActionMode = "icon-only";

export const ACCOUNT_GUEST_AUTH_ACTIONS: readonly MobileAuthMode[] = [
  "signin",
  "signup",
];

export function homeHeaderActionLabelsAreVisible(
  mode: HomeHeaderActionMode,
) {
  return mode === "labeled";
}
