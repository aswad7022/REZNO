import type {
  PushPermissionStatus,
  PushPlatform,
  PushProvider,
  PushReceiptStatus,
} from "@prisma/client";

export const PUSH_REGISTRATION_MAX_ATTEMPTS = 3;
export const PUSH_PROVIDER_TIMEOUT_MS = 10_000;
export const PUSH_RECEIPT_MAX_AGE_SECONDS = 300;

export type PushInstallationDto = {
  kind: "PUSH_INSTALLATION";
  installationId: string;
  platform: PushPlatform;
  provider: PushProvider;
  permissionStatus: PushPermissionStatus;
  status: "ACTIVE";
  tokenVersion: number;
  registeredAt: string;
  replayed: boolean;
};

export type PushInstallationRevokedDto = {
  kind: "PUSH_INSTALLATION_REVOKED";
  installationId: string;
  revoked: boolean;
  replayed: boolean;
};

export type PushReceiptEvent = {
  eventId: string;
  providerMessageId: string;
  status: PushReceiptStatus;
  safeCode: string;
  occurredAt: Date;
};

export type PushReceiptIngestionResult = {
  kind: "PUSH_RECEIPTS_INGESTED";
  accepted: number;
  replayed: number;
  unknown: number;
};

export type NativePushPayload = {
  title: string;
  body: string;
  data: {
    destinationKind: string;
    targetId: string | null;
  };
};

export type NativePushSendResult = {
  outcome: "ACCEPTED" | "TRANSIENT_FAILURE" | "PERMANENT_FAILURE";
  providerMessageId: string | null;
  retryable: boolean;
  safeCode: string;
  invalidToken: boolean;
  ambiguous?: boolean;
};
