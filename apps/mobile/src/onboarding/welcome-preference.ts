import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  persistWelcomeCompletedTo,
  readWelcomeCompletedFrom,
  type WelcomePreferenceStorage,
} from "./welcome-preference-core";

export type { WelcomePreferenceStorage } from "./welcome-preference-core";

export async function readWelcomeCompleted(
  storage: WelcomePreferenceStorage = AsyncStorage,
) {
  return readWelcomeCompletedFrom(storage);
}

export function persistWelcomeCompleted(
  storage: WelcomePreferenceStorage = AsyncStorage,
) {
  return persistWelcomeCompletedTo(storage);
}
