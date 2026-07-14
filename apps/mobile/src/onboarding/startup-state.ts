export type MobileStartupUser = {
  email: string;
  id: string;
  image?: string | null;
  name: string;
};

export type MobileStartupState =
  | { kind: "BOOTSTRAPPING" }
  | {
      kind: "GUEST_WELCOME_NOT_COMPLETED";
      welcomeCompleted: false;
    }
  | {
      kind: "GUEST_WELCOME_COMPLETED";
      welcomeCompleted: true;
    }
  | {
      kind: "AUTHENTICATED_PROFILE_INCOMPLETE";
      user: MobileStartupUser;
      welcomeCompleted: boolean;
    }
  | {
      kind: "AUTHENTICATED_PROFILE_COMPLETE";
      user: MobileStartupUser;
      welcomeCompleted: boolean;
    }
  | {
      kind: "AUTH_ERROR_RETRYABLE";
      user?: MobileStartupUser;
      welcomeCompleted: boolean;
    };

export type MobileStartupAuthSession =
  | { status: "authenticated"; user: MobileStartupUser }
  | { status: "error" }
  | { status: "loading" }
  | { status: "unauthenticated" };

export function resolveGuestStartup(
  welcomeCompleted: boolean,
): MobileStartupState {
  return welcomeCompleted
    ? { kind: "GUEST_WELCOME_COMPLETED", welcomeCompleted: true }
    : { kind: "GUEST_WELCOME_NOT_COMPLETED", welcomeCompleted: false };
}

export function resolveAuthenticatedStartup(
  user: MobileStartupUser,
  profileComplete: boolean,
  welcomeCompleted: boolean,
): MobileStartupState {
  return {
    kind: profileComplete
      ? "AUTHENTICATED_PROFILE_COMPLETE"
      : "AUTHENTICATED_PROFILE_INCOMPLETE",
    user,
    welcomeCompleted,
  };
}

export function resolveStartupError(
  welcomeCompleted: boolean,
  user?: MobileStartupUser,
): MobileStartupState {
  return {
    kind: "AUTH_ERROR_RETRYABLE",
    ...(user ? { user } : {}),
    welcomeCompleted,
  };
}

export function completeInformationalWelcome(
  state: MobileStartupState,
): MobileStartupState {
  if (state.kind !== "GUEST_WELCOME_NOT_COMPLETED") return state;
  return { kind: "GUEST_WELCOME_COMPLETED", welcomeCompleted: true };
}

export function startupWelcomeCompleted(state: MobileStartupState): boolean {
  return state.kind === "BOOTSTRAPPING" ? false : state.welcomeCompleted;
}

export function signedOutStartup(state: MobileStartupState): MobileStartupState {
  return resolveGuestStartup(startupWelcomeCompleted(state));
}

export function toMobileAuthSession(
  state: MobileStartupState,
): MobileStartupAuthSession {
  if (state.kind === "BOOTSTRAPPING") return { status: "loading" };
  if (state.kind === "AUTH_ERROR_RETRYABLE") return { status: "error" };
  if (
    state.kind === "AUTHENTICATED_PROFILE_COMPLETE" ||
    state.kind === "AUTHENTICATED_PROFILE_INCOMPLETE"
  ) {
    return { status: "authenticated", user: state.user };
  }
  return { status: "unauthenticated" };
}
