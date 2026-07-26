export type MobilePushPermission =
  | "DENIED"
  | "GRANTED"
  | "PROVISIONAL"
  | "UNDETERMINED";
export type MobilePushProvider = "APNS" | "FCM";
export type MobilePushPlatform = "IOS" | "ANDROID";

export type MobilePushInstallationIdentity = {
  installationId: string;
  installationSecret: string;
};

export type MobilePushOperationIdentity = MobilePushInstallationIdentity & {
  operationGeneration: number;
};

export type MobilePushRegistrationInput = MobilePushInstallationIdentity & {
  appVersion: string;
  operationGeneration: number;
  permissionStatus: "GRANTED" | "PROVISIONAL";
  platform: MobilePushPlatform;
  provider: MobilePushProvider;
  token: string;
};

export type MobilePushRevocationInput = MobilePushOperationIdentity;

export type MobilePushInstallation = {
  installationId: string;
  kind: "PUSH_INSTALLATION";
  permissionStatus: "GRANTED" | "PROVISIONAL";
  platform: MobilePushPlatform;
  provider: MobilePushProvider;
  registeredAt: string;
  replayed: boolean;
  status: "ACTIVE";
  tokenVersion: number;
};

export type MobilePushRegistrationState =
  | { kind: "IDLE" }
  | { kind: "PERMISSION_REQUIRED" }
  | { kind: "PERMISSION_DENIED"; revocationPending: boolean }
  | { kind: "REGISTERING"; attempt: number }
  | { kind: "REGISTERED"; permission: "GRANTED" | "PROVISIONAL" }
  | { kind: "RETRYING"; attempt: number }
  | { kind: "UNAVAILABLE"; retryable: boolean };

type CapturedPushApi = {
  register(
    input: MobilePushRegistrationInput,
    idempotencyKey: string,
  ): Promise<MobilePushInstallation>;
  revoke(
    input: MobilePushRevocationInput,
    idempotencyKey: string,
  ): Promise<unknown>;
};

export type MobilePushRegistrationDependencies = {
  captureApi(): CapturedPushApi;
  createIdempotencyKey(): string;
  identity: {
    nextOperation(): Promise<MobilePushOperationIdentity>;
  };
  native: {
    readPermission(): Promise<MobilePushPermission>;
    requestPermission(): Promise<MobilePushPermission>;
    readToken(): Promise<{
      appVersion: string;
      platform: MobilePushPlatform;
      provider: MobilePushProvider;
      token: string;
    }>;
  };
  sleep(milliseconds: number): Promise<void>;
};

const RETRY_DELAYS_MS = [1_000, 4_000] as const;
const OPERATION_TIMEOUT_MS = 10_000;

export class MobilePushRegistrationCoordinator {
  private generation = 0;
  private ownerId: string | null = null;
  private state: MobilePushRegistrationState = { kind: "IDLE" };
  private listeners = new Set<(state: MobilePushRegistrationState) => void>();
  private running: Promise<void> | null = null;

  constructor(private readonly dependencies: MobilePushRegistrationDependencies) {}

  subscribe(listener: (state: MobilePushRegistrationState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  activate(ownerId: string) {
    if (this.ownerId === ownerId && this.running) return this.running;
    const generation = ++this.generation;
    this.ownerId = ownerId;
    const run = this.bootstrap(ownerId, generation, false);
    this.running = run.finally(() => {
      if (this.generation === generation) this.running = null;
    });
    return this.running;
  }

  requestPermission(ownerId: string) {
    if (this.ownerId !== ownerId) return Promise.resolve();
    const generation = ++this.generation;
    const run = this.bootstrap(ownerId, generation, true);
    this.running = run.finally(() => {
      if (this.generation === generation) this.running = null;
    });
    return this.running;
  }

  refreshToken(ownerId: string) {
    if (this.ownerId !== ownerId) return Promise.resolve();
    const generation = ++this.generation;
    const run = this.bootstrap(ownerId, generation, false);
    this.running = run.finally(() => {
      if (this.generation === generation) this.running = null;
    });
    return this.running;
  }

  async deactivate(ownerId: string) {
    if (this.ownerId !== ownerId) return;
    const generation = ++this.generation;
    const api = this.dependencies.captureApi();
    this.ownerId = null;
    this.running = null;
    this.publish({ kind: "IDLE" });
    const identity = await this.dependencies.identity.nextOperation();
    const idempotencyKey = this.dependencies.createIdempotencyKey();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await withTimeout(
          api.revoke(identity, idempotencyKey),
          OPERATION_TIMEOUT_MS,
        );
        return;
      } catch (error) {
        if (this.generation !== generation) return;
        if (attempt === 1) {
          throw new Error(
            "The device push binding could not be revoked before logout.",
            { cause: error },
          );
        }
        await this.dependencies.sleep(250);
      }
    }
  }

  suspend(ownerId: string) {
    if (this.ownerId !== ownerId) return;
    this.generation += 1;
    this.ownerId = null;
    this.running = null;
    this.publish({ kind: "IDLE" });
  }

  private async bootstrap(
    ownerId: string,
    generation: number,
    requestPermission: boolean,
  ) {
    const permission = requestPermission
      ? await this.dependencies.native.requestPermission()
      : await this.dependencies.native.readPermission();
    if (!this.isCurrent(ownerId, generation)) return;
    if (permission === "UNDETERMINED") {
      this.publish({ kind: "PERMISSION_REQUIRED" });
      return;
    }
    if (permission === "DENIED") {
      const revoked = await this.revokeDisabledPermission(ownerId, generation);
      if (!this.isCurrent(ownerId, generation)) return;
      this.publish({ kind: "PERMISSION_DENIED", revocationPending: !revoked });
      return;
    }
    await this.register(ownerId, generation, permission);
  }

  private async register(
    ownerId: string,
    generation: number,
    permission: "GRANTED" | "PROVISIONAL",
  ) {
    const api = this.dependencies.captureApi();
    const identity = await this.dependencies.identity.nextOperation();
    const idempotencyKey = this.dependencies.createIdempotencyKey();
    if (!this.isCurrent(ownerId, generation)) return;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      this.publish(
        attempt === 0
          ? { attempt: attempt + 1, kind: "REGISTERING" }
          : { attempt: attempt + 1, kind: "RETRYING" },
      );
      try {
        const token = await withTimeout(
          this.dependencies.native.readToken(),
          OPERATION_TIMEOUT_MS,
        );
        if (!this.isCurrent(ownerId, generation)) return;
        await withTimeout(
          api.register(
            {
              ...identity,
              ...token,
              permissionStatus: permission,
            },
            idempotencyKey,
          ),
          OPERATION_TIMEOUT_MS,
        );
        if (!this.isCurrent(ownerId, generation)) return;
        this.publish({ kind: "REGISTERED", permission });
        return;
      } catch {
        if (!this.isCurrent(ownerId, generation)) return;
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined) {
          this.publish({ kind: "UNAVAILABLE", retryable: true });
          return;
        }
        await this.dependencies.sleep(delay);
        if (!this.isCurrent(ownerId, generation)) return;
      }
    }
  }

  private isCurrent(ownerId: string, generation: number) {
    return this.ownerId === ownerId && this.generation === generation;
  }

  private async revokeDisabledPermission(ownerId: string, generation: number) {
    const api = this.dependencies.captureApi();
    const identity = await this.dependencies.identity.nextOperation();
    const idempotencyKey = this.dependencies.createIdempotencyKey();
    if (!this.isCurrent(ownerId, generation)) return false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await withTimeout(
          api.revoke(identity, idempotencyKey),
          OPERATION_TIMEOUT_MS,
        );
        return true;
      } catch {
        if (attempt === 1 || !this.isCurrent(ownerId, generation)) return false;
        await this.dependencies.sleep(250);
      }
    }
    return false;
  }

  private publish(state: MobilePushRegistrationState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

async function withTimeout<T>(operation: Promise<T>, milliseconds: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("operation timed out")), milliseconds);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
