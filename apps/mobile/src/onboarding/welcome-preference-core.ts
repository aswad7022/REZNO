export const WELCOME_COMPLETED_KEY =
  "rezno.presentation.welcome-completed.v1";
const WELCOME_COMPLETED_VALUE = "completed";

export interface WelcomePreferenceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export async function readWelcomeCompletedFrom(
  storage: WelcomePreferenceStorage,
) {
  return (await storage.getItem(WELCOME_COMPLETED_KEY)) === WELCOME_COMPLETED_VALUE;
}

export function persistWelcomeCompletedTo(storage: WelcomePreferenceStorage) {
  return storage.setItem(WELCOME_COMPLETED_KEY, WELCOME_COMPLETED_VALUE);
}
