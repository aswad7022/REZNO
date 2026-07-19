import "server-only";

import { createHash } from "node:crypto";

import type { OutboundAttemptOutcome } from "@prisma/client";

import type {
  CommunicationLocale,
  OutboundChannel,
} from "@/features/communications/domain/contracts";

export type SafeProviderMessage = {
  channel: OutboundChannel;
  deliveryId: string;
  providerIdempotencyKey: string;
  endpoint: string;
  locale: CommunicationLocale;
  subject?: string;
  plainText: string;
  safeHtml?: string;
  safePlatformHref: string;
};

export type ProviderSendResult = {
  outcome: OutboundAttemptOutcome;
  providerName: string;
  providerMessageId: string | null;
  retryable: boolean;
  safeCode: string;
};

export interface OutboundProvider {
  readonly channel: OutboundChannel;
  send(message: SafeProviderMessage): Promise<ProviderSendResult>;
}
type TestProviderFactory = (channel: OutboundChannel) => OutboundProvider;
let testProviderFactory: TestProviderFactory | undefined;

export function setCommunicationTestProviderFactory(
  factory: TestProviderFactory | undefined,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Communication provider test injection is unavailable in production.");
  }
  testProviderFactory = factory;
}

export function resolveOutboundProvider(channel: OutboundChannel): OutboundProvider {
  if (testProviderFactory) return testProviderFactory(channel);
  if (deterministicSinkEnabled(process.env)) return new DeterministicSinkProvider(channel);
  return new NotConfiguredProvider(channel);
}

export function deterministicSinkEnabled(
  environment: NodeJS.ProcessEnv,
): boolean {
  if (environment.NODE_ENV === "production") return false;
  if (environment.REZNO_OUTBOUND_SINK !== "enabled") return false;
  if (environment.REZNO_OUTBOUND_SINK_CONFIRM !== "rezno-stage4c-sink") return false;
  if (/prod(?:uction)?|live/i.test(environment.REZNO_ENV ?? "")) return false;
  const raw = environment.DATABASE_URL;
  if (!raw) return false;
  try {
    const databaseName = new URL(raw).pathname.replace(/^\//, "").toLowerCase();
    return databaseName === "rezno_staging"
      || databaseName.includes("test")
      || databaseName.includes("stage4c");
  } catch {
    return false;
  }
}

export class DeterministicSinkProvider implements OutboundProvider {
  constructor(
    public readonly channel: OutboundChannel,
    private readonly outcome: Exclude<OutboundAttemptOutcome, "NOT_CONFIGURED"> = "ACCEPTED",
  ) {}

  async send(message: SafeProviderMessage): Promise<ProviderSendResult> {
    const providerMessageId = `sink_${createHash("sha256")
      .update(`${message.channel}:${message.providerIdempotencyKey}`)
      .digest("hex")
      .slice(0, 32)}`;
    if (this.outcome === "TRANSIENT_FAILURE") {
      return {
        outcome: this.outcome,
        providerName: "rezno-deterministic-sink",
        providerMessageId: null,
        retryable: true,
        safeCode: "SINK_TRANSIENT",
      };
    }
    if (this.outcome === "PERMANENT_FAILURE") {
      return {
        outcome: this.outcome,
        providerName: "rezno-deterministic-sink",
        providerMessageId: null,
        retryable: false,
        safeCode: "SINK_PERMANENT",
      };
    }
    return {
      outcome: "ACCEPTED",
      providerName: "rezno-deterministic-sink",
      providerMessageId,
      retryable: false,
      safeCode: "SINK_ACCEPTED",
    };
  }
}

class NotConfiguredProvider implements OutboundProvider {
  constructor(public readonly channel: OutboundChannel) {}

  async send(): Promise<ProviderSendResult> {
    return {
      outcome: "NOT_CONFIGURED",
      providerName: "not-configured",
      providerMessageId: null,
      retryable: false,
      safeCode: "PROVIDER_NOT_CONFIGURED",
    };
  }
}
