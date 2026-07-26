import type {
  MobileHostedPaymentHandoff,
  MobilePaymentIntent,
} from "../types/payments";
import {
  authoritativeHostedPaymentOutcome,
  createHostedPaymentRecoveryManifest,
  parseHostedPaymentReturnUrl,
  type HostedPaymentRecoveryManifest,
  validateHostedPaymentHandoff,
} from "./hosted-payment-policy";

export type HostedPaymentStatus =
  | "BROWSER_CANCELLED"
  | "CONFIRMED"
  | "DECLINED"
  | "DUPLICATE_LINK"
  | "EXPIRED"
  | "IDLE"
  | "INVALID_LINK"
  | "OPENING_BROWSER"
  | "PENDING_CONFIRMATION"
  | "PREPARING"
  | "RETRYABLE"
  | "UNAVAILABLE"
  | "VERIFYING"
  | "WAITING_RETURN";

export type HostedPaymentSnapshot = {
  intentId: string | null;
  manifest: HostedPaymentRecoveryManifest | null;
  ownerId: string | null;
  payment: MobilePaymentIntent | null;
  pending: boolean;
  runnerId: string | null;
  status: HostedPaymentStatus;
};

export type HostedPaymentCoordinatorDependencies = {
  approvedOrigins: readonly string[];
  captureApiSession(): HostedPaymentApiSession;
  cleanup(manifest: HostedPaymentRecoveryManifest): Promise<void>;
  createAbortController(): AbortController;
  load(ownerId: string): Promise<HostedPaymentRecoveryManifest | null>;
  now(): number;
  openBrowser(
    checkoutUrl: string,
    returnUrl: string,
    signal: AbortSignal,
  ): Promise<{ type: string; url?: string }>;
  persist(manifest: HostedPaymentRecoveryManifest): Promise<void>;
  uuid(): string;
  wait(milliseconds: number): Promise<void>;
};

export type HostedPaymentApiSession = {
  consumeReturn(
    intentId: string,
    state: string,
    signal: AbortSignal,
  ): Promise<MobilePaymentIntent>;
  createHandoff(
    intentId: string,
    idempotencyKey: string,
    signal: AbortSignal,
  ): Promise<MobileHostedPaymentHandoff>;
  getIntent(
    intentId: string,
    signal: AbortSignal,
  ): Promise<MobilePaymentIntent>;
};

export function shouldHandleInitialHostedPaymentUrl(
  snapshot: HostedPaymentSnapshot,
) {
  return (
    snapshot.manifest?.checkpoint === "WAITING_RETURN"
    || (snapshot.manifest === null && snapshot.status === "IDLE")
  );
}

type Runner = {
  api: HostedPaymentApiSession;
  controller: AbortController;
  done: Promise<void>;
  finish(): void;
  intentId: string;
  ownerId: string;
  returnPromise: Promise<void> | null;
  token: string;
};

const EMPTY: HostedPaymentSnapshot = {
  intentId: null,
  manifest: null,
  ownerId: null,
  payment: null,
  pending: false,
  runnerId: null,
  status: "IDLE",
};
const MAXIMUM_AUTOMATIC_VERIFICATIONS = 3;
const MAXIMUM_TOTAL_VERIFICATIONS = 5;

export class HostedPaymentCoordinator {
  private readonly dependencies: HostedPaymentCoordinatorDependencies;
  private activeOwnerId: string | null = null;
  private runner: Runner | null = null;
  private snapshot: HostedPaymentSnapshot = EMPTY;
  private readonly subscribers = new Set<{
    listener(snapshot: HostedPaymentSnapshot): void;
    ownerId: string;
  }>();

  constructor(dependencies: HostedPaymentCoordinatorDependencies) {
    this.dependencies = dependencies;
  }

  getSnapshot = (ownerId: string): HostedPaymentSnapshot =>
    this.snapshot.ownerId === ownerId
      ? this.snapshot
      : { ...EMPTY, ownerId };

  subscribe = (
    ownerId: string,
    listener: (snapshot: HostedPaymentSnapshot) => void,
  ) => {
    const subscriber = { listener, ownerId };
    this.subscribers.add(subscriber);
    listener(this.getSnapshot(ownerId));
    return () => this.subscribers.delete(subscriber);
  };

  async bootstrap(ownerId: string) {
    this.activeOwnerId = ownerId;
    const activeRunner = this.runner;
    if (activeRunner) {
      if (activeRunner.ownerId === ownerId) return;
      activeRunner.controller.abort();
      await activeRunner.done;
      if (this.activeOwnerId !== ownerId) return;
    }
    let manifest: HostedPaymentRecoveryManifest | null;
    try {
      manifest = await this.dependencies.load(ownerId);
    } catch {
      this.publish(ownerId, {
        manifest: null,
        pending: false,
        status: "UNAVAILABLE",
      });
      return;
    }
    if (this.activeOwnerId !== ownerId) return;
    if (!manifest) {
      this.publish(ownerId, {
        intentId: null,
        manifest: null,
        payment: null,
        pending: false,
        runnerId: null,
        status: "IDLE",
      });
      return;
    }
    if (manifest.expiresAt <= this.dependencies.now()) {
      await this.cleanupExpired(ownerId, manifest);
      return;
    }
    this.publish(ownerId, {
      intentId: manifest.intentId,
      manifest,
      pending: false,
      status:
        manifest.checkpoint === "VERIFYING_STATUS"
          ? "RETRYABLE"
          : "WAITING_RETURN",
    });
    if (
      manifest.checkpoint === "VERIFYING_STATUS"
      && manifest.verificationAttempts < MAXIMUM_AUTOMATIC_VERIFICATIONS
    ) {
      await this.resumeVerification(ownerId, manifest, false);
    }
  }

  async start(ownerId: string, intentId: string) {
    if (this.activeOwnerId !== ownerId || this.runner) return "ACTIVE" as const;
    const existing = this.getSnapshot(ownerId).manifest;
    if (existing) {
      if (existing.intentId !== intentId) return "ACTIVE" as const;
      return this.reopen(ownerId);
    }
    const runner = this.claim(ownerId, intentId, "PREPARING");
    if (!runner) return "ACTIVE" as const;
    const idempotencyKey = this.dependencies.uuid();
    try {
      const handoff = validateHostedPaymentHandoff(
        await runner.api.createHandoff(
          intentId,
          idempotencyKey,
          runner.controller.signal,
        ),
        {
          approvedOrigins: this.dependencies.approvedOrigins,
          intentId,
          now: this.dependencies.now(),
        },
      );
      if (!this.isOwner(runner)) return "STALE" as const;
      const manifest = createHostedPaymentRecoveryManifest({
        handoff,
        idempotencyKey,
        now: this.dependencies.now(),
        operationId: this.dependencies.uuid(),
        ownerId,
      });
      await this.dependencies.persist(manifest);
      if (!this.isOwner(runner)) return "STALE" as const;
      this.publish(ownerId, {
        intentId,
        manifest,
        pending: true,
        status: "OPENING_BROWSER",
      });
      const result = await this.dependencies.openBrowser(
        manifest.checkoutUrl,
        manifest.returnUrl,
        runner.controller.signal,
      );
      if (!this.isOwner(runner)) return "STALE" as const;
      if (result.type === "success" && result.url) {
        runner.returnPromise ??= this.processReturn(
          runner,
          result.url,
          manifest,
        );
        await runner.returnPromise;
      } else {
        this.publish(ownerId, {
          pending: false,
          status: "BROWSER_CANCELLED",
        });
      }
      return "COMPLETED" as const;
    } catch (error) {
      if (this.isOwner(runner)) {
        this.publish(ownerId, {
          pending: false,
          status: statusForError(error),
        });
      }
      return "FAILED" as const;
    } finally {
      this.release(runner);
    }
  }

  async handleUrl(ownerId: string, value: string) {
    if (this.activeOwnerId !== ownerId) return;
    let parsed: ReturnType<typeof parseHostedPaymentReturnUrl>;
    try {
      parsed = parseHostedPaymentReturnUrl(value);
    } catch {
      this.publish(ownerId, {
        pending: false,
        status: "INVALID_LINK",
      });
      return;
    }
    const active = this.runner;
    if (active) {
      if (
        active.ownerId !== ownerId
        || active.intentId !== parsed.intentId
      ) {
        this.publish(ownerId, { status: "INVALID_LINK" });
        return;
      }
      const manifest = this.getSnapshot(ownerId).manifest;
      if (!manifest) return;
      if (
        parsed.intentId !== manifest.intentId
        || parsed.state !== manifest.state
      ) {
        this.publish(ownerId, {
          pending: false,
          status: "INVALID_LINK",
        });
        return;
      }
      if (!active.returnPromise) {
        active.returnPromise = this.processReturn(active, value, manifest);
      }
      await active.returnPromise;
      return;
    }
    const manifest = await this.dependencies.load(ownerId).catch(() => null);
    if (!manifest) {
      const snapshot = this.getSnapshot(ownerId);
      if (
        snapshot.intentId === parsed.intentId
        && snapshot.manifest === null
        && (
          snapshot.status === "CONFIRMED"
          || snapshot.status === "DECLINED"
          || snapshot.status === "EXPIRED"
        )
      ) {
        return;
      }
      this.publish(ownerId, {
        pending: false,
        status: "INVALID_LINK",
      });
      return;
    }
    const runner = this.claim(ownerId, manifest.intentId, "VERIFYING");
    if (!runner) return;
    try {
      runner.returnPromise = this.processReturn(runner, value, manifest);
      await runner.returnPromise;
    } finally {
      this.release(runner);
    }
  }

  async retry(ownerId: string) {
    if (this.activeOwnerId !== ownerId || this.runner) return;
    const manifest = await this.dependencies.load(ownerId).catch(() => null);
    if (!manifest) return;
    if (manifest.expiresAt <= this.dependencies.now()) {
      await this.cleanupExpired(ownerId, manifest);
      return;
    }
    if (manifest.checkpoint === "WAITING_RETURN") {
      return this.reopen(ownerId);
    }
    if (manifest.verificationAttempts >= MAXIMUM_TOTAL_VERIFICATIONS) {
      this.publish(ownerId, {
        manifest,
        pending: false,
        status: "PENDING_CONFIRMATION",
      });
      return;
    }
    await this.resumeVerification(ownerId, manifest, true);
  }

  private async reopen(ownerId: string) {
    const manifest = await this.dependencies.load(ownerId).catch(() => null);
    if (!manifest || this.runner) return "ACTIVE" as const;
    if (manifest.expiresAt <= this.dependencies.now()) {
      await this.cleanupExpired(ownerId, manifest);
      return "EXPIRED" as const;
    }
    const runner = this.claim(ownerId, manifest.intentId, "OPENING_BROWSER");
    if (!runner) return "ACTIVE" as const;
    try {
      this.publish(ownerId, {
        manifest,
        pending: true,
        status: "OPENING_BROWSER",
      });
      const result = await this.dependencies.openBrowser(
        manifest.checkoutUrl,
        manifest.returnUrl,
        runner.controller.signal,
      );
      if (
        this.isOwner(runner)
        && result.type === "success"
        && result.url
      ) {
        runner.returnPromise ??= this.processReturn(
          runner,
          result.url,
          manifest,
        );
        await runner.returnPromise;
      } else if (this.isOwner(runner)) {
        this.publish(ownerId, {
          pending: false,
          status: "BROWSER_CANCELLED",
        });
      }
      return "COMPLETED" as const;
    } finally {
      this.release(runner);
    }
  }

  private async resumeVerification(
    ownerId: string,
    manifest: HostedPaymentRecoveryManifest,
    manual: boolean,
  ) {
    const runner = this.claim(ownerId, manifest.intentId, "VERIFYING");
    if (!runner) return;
    try {
      await this.verifyAuthoritativeStatus(runner, manifest, {
        consumeState: true,
        maximumAttempts: manual
          ? MAXIMUM_TOTAL_VERIFICATIONS
          : MAXIMUM_AUTOMATIC_VERIFICATIONS,
      });
    } finally {
      this.release(runner);
    }
  }

  private async processReturn(
    runner: Runner,
    value: string,
    manifest: HostedPaymentRecoveryManifest,
  ) {
    let parsed: ReturnType<typeof parseHostedPaymentReturnUrl>;
    try {
      parsed = parseHostedPaymentReturnUrl(value);
    } catch {
      if (this.isOwner(runner)) {
        this.publish(runner.ownerId, {
          pending: false,
          status: "INVALID_LINK",
        });
      }
      return;
    }
    if (
      parsed.intentId !== manifest.intentId
      || parsed.state !== manifest.state
    ) {
      if (this.isOwner(runner)) {
        this.publish(runner.ownerId, {
          pending: false,
          status: "INVALID_LINK",
        });
      }
      return;
    }
    if (manifest.returnReceivedAt !== null) {
      if (this.isOwner(runner)) {
        this.publish(runner.ownerId, {
          pending: false,
          status: "DUPLICATE_LINK",
        });
      }
      return;
    }
    const verifying: HostedPaymentRecoveryManifest = {
      ...manifest,
      checkpoint: "VERIFYING_STATUS",
      outcome: parsed.outcome,
      returnReceivedAt: this.dependencies.now(),
    };
    await this.dependencies.persist(verifying);
    if (!this.isOwner(runner)) return;
    this.publish(runner.ownerId, {
      manifest: verifying,
      pending: true,
      status: "VERIFYING",
    });
    await this.verifyAuthoritativeStatus(runner, verifying, {
      consumeState: true,
      maximumAttempts: MAXIMUM_AUTOMATIC_VERIFICATIONS,
    });
  }

  private async verifyAuthoritativeStatus(
    runner: Runner,
    startingManifest: HostedPaymentRecoveryManifest,
    input: {
      consumeState: boolean;
      maximumAttempts: number;
    },
  ) {
    let manifest = startingManifest;
    let payment: MobilePaymentIntent | null = null;
    try {
      if (input.consumeState) {
        try {
          payment = await runner.api.consumeReturn(
            manifest.intentId,
            manifest.state,
            runner.controller.signal,
          );
        } catch (error) {
          if (!hasApiErrorCode(error, "PAYMENT_STATE_CONFLICT")) {
            throw error;
          }
          // A lost first response can make the durable one-use state appear
          // replayed. Read-only status remains safe and authoritative.
        }
      }
      while (
        this.isOwner(runner)
        && manifest.verificationAttempts < input.maximumAttempts
      ) {
        if (!payment) {
          payment = await runner.api.getIntent(
            manifest.intentId,
            runner.controller.signal,
          );
        }
        const outcome = authoritativeHostedPaymentOutcome(payment);
        if (outcome !== "PENDING") {
          await this.dependencies.cleanup(manifest);
          if (!this.isOwner(runner)) return;
          this.publish(runner.ownerId, {
            manifest: null,
            payment,
            pending: false,
            status: outcome,
          });
          return;
        }
        manifest = {
          ...manifest,
          verificationAttempts: manifest.verificationAttempts + 1,
        };
        await this.dependencies.persist(manifest);
        if (!this.isOwner(runner)) return;
        this.publish(runner.ownerId, {
          manifest,
          payment,
          pending: true,
          status: "VERIFYING",
        });
        if (manifest.verificationAttempts >= input.maximumAttempts) break;
        await this.dependencies.wait(
          manifest.verificationAttempts === 1 ? 500 : 1_500,
        );
        payment = null;
      }
      if (this.isOwner(runner)) {
        this.publish(runner.ownerId, {
          manifest,
          payment,
          pending: false,
          status: "PENDING_CONFIRMATION",
        });
      }
    } catch {
      if (this.isOwner(runner)) {
        this.publish(runner.ownerId, {
          manifest,
          payment,
          pending: false,
          status: "RETRYABLE",
        });
      }
    }
  }

  private claim(
    ownerId: string,
    intentId: string,
    status: HostedPaymentStatus,
  ) {
    if (this.runner || this.activeOwnerId !== ownerId) return null;
    let finish!: () => void;
    const runner: Runner = {
      api: this.dependencies.captureApiSession(),
      controller: this.dependencies.createAbortController(),
      done: new Promise((resolve) => {
        finish = resolve;
      }),
      finish,
      intentId,
      ownerId,
      returnPromise: null,
      token: this.dependencies.uuid(),
    };
    this.runner = runner;
    this.publish(ownerId, {
      intentId,
      pending: true,
      runnerId: runner.token,
      status,
    });
    return runner;
  }

  private isOwner(runner: Runner) {
    return (
      this.runner?.token === runner.token
      && this.runner.ownerId === runner.ownerId
      && this.activeOwnerId === runner.ownerId
    );
  }

  private release(runner: Runner) {
    if (this.runner?.token === runner.token) {
      this.runner = null;
      this.publish(runner.ownerId, {
        pending: false,
        runnerId: null,
      });
    }
    runner.finish();
  }

  private async cleanupExpired(
    ownerId: string,
    manifest: HostedPaymentRecoveryManifest,
  ) {
    try {
      await this.dependencies.cleanup(manifest);
      this.publish(ownerId, {
        intentId: manifest.intentId,
        manifest: null,
        pending: false,
        status: "EXPIRED",
      });
    } catch {
      this.publish(ownerId, {
        intentId: manifest.intentId,
        manifest,
        pending: false,
        status: "UNAVAILABLE",
      });
    }
  }

  private publish(
    ownerId: string,
    patch: Partial<HostedPaymentSnapshot>,
  ) {
    if (this.activeOwnerId !== ownerId) return;
    this.snapshot = {
      ...(this.snapshot.ownerId === ownerId
        ? this.snapshot
        : { ...EMPTY, ownerId }),
      ...patch,
      ownerId,
    };
    for (const subscriber of this.subscribers) {
      if (subscriber.ownerId === ownerId) {
        subscriber.listener(this.snapshot);
      }
    }
  }
}

function statusForError(error: unknown): HostedPaymentStatus {
  if (
    hasApiErrorCode(error, "PAYMENT_PROVIDER_NOT_CONFIGURED")
    || hasApiStatus(error, 503)
  ) {
    return "UNAVAILABLE";
  }
  return "RETRYABLE";
}

function hasApiErrorCode(error: unknown, code: string) {
  return (
    error instanceof Error
    && "code" in error
    && (error as Error & { code?: unknown }).code === code
  );
}

function hasApiStatus(error: unknown, status: number) {
  return (
    error instanceof Error
    && "status" in error
    && (error as Error & { status?: unknown }).status === status
  );
}
