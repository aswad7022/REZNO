import Constants from "expo-constants";
import { getRandomBytesAsync, randomUUID } from "expo-crypto";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { captureMobileApiSession } from "../api/client";
import { capturePushNotificationApi } from "../api/notifications";
import {
  MobilePushRegistrationCoordinator,
  type MobilePushOperationIdentity,
  type MobilePushPermission,
} from "./device-registration";

const IDENTITY_KEY = "rezno.push.installation.v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
let identityOperationQueue: Promise<void> = Promise.resolve();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const mobilePushRegistrationCoordinator =
  new MobilePushRegistrationCoordinator({
    captureApi() {
      return capturePushNotificationApi(captureMobileApiSession());
    },
    createIdempotencyKey: randomUUID,
    identity: {
      nextOperation() {
        const next = identityOperationQueue.then(issueNextOperationIdentity);
        identityOperationQueue = next.then(
          () => undefined,
          () => undefined,
        );
        return next;
      },
    },
    native: {
      async readPermission() {
        return mapPermission(await Notifications.getPermissionsAsync());
      },
      async requestPermission() {
        return mapPermission(await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
            allowProvisional: true,
          },
        }));
      },
      async readToken() {
        if (Platform.OS !== "ios" && Platform.OS !== "android") {
          throw new Error("Push notifications require a native device.");
        }
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("rezno-account", {
            importance: Notifications.AndroidImportance.HIGH,
            name: "REZNO account notifications",
            sound: null,
            vibrationPattern: [0, 250, 250, 250],
          });
        }
        const token = await Notifications.getDevicePushTokenAsync();
        if (typeof token.data !== "string") {
          throw new Error("The native push token is unavailable.");
        }
        return {
          appVersion: Constants.expoConfig?.version ?? "1.0.0",
          platform: Platform.OS === "ios" ? "IOS" as const : "ANDROID" as const,
          provider: Platform.OS === "ios" ? "APNS" as const : "FCM" as const,
          token: token.data,
        };
      },
    },
    sleep(milliseconds) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds));
    },
  });

export function subscribeToNativePushTokenChanges(ownerId: string) {
  const subscription = Notifications.addPushTokenListener(() => {
    void mobilePushRegistrationCoordinator.refreshToken(ownerId);
  });
  return () => subscription.remove();
}

function mapPermission(
  permissions: Notifications.NotificationPermissionsStatus,
): MobilePushPermission {
  if (
    permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return "PROVISIONAL";
  }
  if (permissions.granted || permissions.status === "granted") return "GRANTED";
  if (permissions.status === "undetermined") return "UNDETERMINED";
  return "DENIED";
}

async function issueNextOperationIdentity(): Promise<MobilePushOperationIdentity> {
  const stored = parseIdentity(await SecureStore.getItemAsync(IDENTITY_KEY));
  const next: MobilePushOperationIdentity = stored
    ? { ...stored, operationGeneration: stored.operationGeneration + 1 }
    : {
      installationId: randomUUID(),
      installationSecret: bytesToBase64Url(await getRandomBytesAsync(32)),
      operationGeneration: 1,
    };
  if (next.operationGeneration > 2_147_483_647) {
    throw new Error("The installation operation generation is exhausted.");
  }
  await SecureStore.setItemAsync(IDENTITY_KEY, JSON.stringify(next), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return next;
}

function parseIdentity(value: string | null): MobilePushOperationIdentity | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed
      && typeof parsed === "object"
      && !Array.isArray(parsed)
      && typeof parsed.installationId === "string"
      && UUID_PATTERN.test(parsed.installationId)
      && typeof parsed.installationSecret === "string"
      && SECRET_PATTERN.test(parsed.installationSecret)
      && (
        parsed.operationGeneration === undefined
        || (
          typeof parsed.operationGeneration === "number"
          && Number.isSafeInteger(parsed.operationGeneration)
          && parsed.operationGeneration >= 0
          && parsed.operationGeneration <= 2_147_483_646
        )
      )
      ? {
        installationId: parsed.installationId.toLowerCase(),
        installationSecret: parsed.installationSecret,
        operationGeneration: parsed.operationGeneration ?? 0,
      }
      : null;
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes: Uint8Array) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += alphabet[first >> 2];
    result += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) {
      result += alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)];
    }
    if (third !== undefined) result += alphabet[third & 63];
  }
  return result;
}
