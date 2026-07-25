import {
  MEDIA_UPLOAD_MAX_ATTEMPTS,
  MediaUploadPolicyError,
  canAttemptUpload,
  isTargetFresh,
  rotateUploadTargetGeneration,
  type CustomerAvatarUploadManifest,
  type SafeUploadTarget,
} from "./upload-policy";

export type CustomerMediaContainer = {
  bindings: Array<{
    id: string;
    media: { assetId: string | null } | null;
    slot: string;
  }>;
  version: number;
};

export type CustomerAvatarCommitPhase =
  | "CANCELLABLE"
  | "COMMITTING"
  | "COMMITTED";

export type CustomerAvatarUploadEngineDependencies = {
  attach(input: {
    assetId: string;
    containerVersion: number;
    idempotencyKey: string;
    replace: boolean;
    signal: AbortSignal;
  }): Promise<CustomerMediaContainer>;
  cleanupLocal(manifest: CustomerAvatarUploadManifest): Promise<void>;
  createSession(input: {
    checksumSha256: string;
    idempotencyKey: string;
    mimeType: "image/jpeg";
    signal: AbortSignal;
    sizeBytes: number;
  }): Promise<{ id: string; version: number }>;
  finalize(input: {
    idempotencyKey: string;
    sessionId: string;
    signal: AbortSignal;
    version: number;
  }): Promise<{
    asset: { id: string; state: string };
  }>;
  getContainer(signal: AbortSignal): Promise<CustomerMediaContainer>;
  isOnline(): Promise<boolean>;
  issueTarget(input: {
    idempotencyKey: string;
    mimeType: "image/jpeg";
    sessionId: string;
    signal: AbortSignal;
    sizeBytes: number;
    version: number;
  }): Promise<SafeUploadTarget>;
  now(): number;
  onCommitPhaseChange?(phase: CustomerAvatarCommitPhase): void;
  onProgress(fraction: number): void;
  persist(manifest: CustomerAvatarUploadManifest): Promise<void>;
  signal: AbortSignal;
  upload(input: {
    fileUri: string;
    signal: AbortSignal;
    target: SafeUploadTarget;
  }): Promise<{ status: number }>;
  uuid(): string;
};

export class MediaUploadEngineError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(code, options);
    this.name = "MediaUploadEngineError";
  }
}

const runningOperations = new Set<string>();

export function customerAvatarCancellationDisposition(
  phase: CustomerAvatarCommitPhase,
) {
  return phase === "CANCELLABLE" ? "CANCEL" : "VERIFY";
}

export async function resolveCommittedAvatarPreview<T>(
  loadPreview: () => Promise<T>,
) {
  try {
    return { status: "READY", value: await loadPreview() } as const;
  } catch {
    return { status: "UNAVAILABLE" } as const;
  }
}

export async function resolveAssetBoundAvatarPreview<T>(input: {
  assetId: string;
  currentAssetId(): string | null;
  loadPreview(): Promise<T>;
}) {
  const preview = await resolveCommittedAvatarPreview(input.loadPreview);
  if (input.currentAssetId() !== input.assetId) {
    return { status: "STALE" } as const;
  }
  return preview;
}

export async function runCustomerAvatarUpload(
  initial: CustomerAvatarUploadManifest,
  dependencies: CustomerAvatarUploadEngineDependencies,
) {
  if (runningOperations.has(initial.operationId)) {
    throw new MediaUploadEngineError("ALREADY_RUNNING", true);
  }
  runningOperations.add(initial.operationId);
  try {
    return await execute(initial, dependencies);
  } finally {
    runningOperations.delete(initial.operationId);
  }
}

async function execute(
  initial: CustomerAvatarUploadManifest,
  dependencies: CustomerAvatarUploadEngineDependencies,
) {
  let manifest = initial;
  let liveTarget: SafeUploadTarget | null = null;

  for (let transition = 0; transition < 12; transition += 1) {
    assertNotCancelled(dependencies.signal);
    if (dependencies.now() >= manifest.expiresAt) {
      try {
        await dependencies.cleanupLocal(manifest);
      } catch (error) {
        throw new MediaUploadEngineError("RECOVERY_CLEANUP_FAILED", false, {
          cause: error,
        });
      }
      throw new MediaUploadEngineError("RECOVERY_EXPIRED", false);
    }
    if (manifest.checkpoint === "VERIFY_ATTACH") {
      dependencies.onCommitPhaseChange?.("COMMITTING");
    }

    if (manifest.checkpoint === "CREATE_SESSION") {
      const session = await callRemote(
        () =>
          dependencies.createSession({
            checksumSha256: manifest.file.checksumSha256,
            idempotencyKey: manifest.idempotency.create,
            mimeType: manifest.file.mimeType,
            signal: dependencies.signal,
            sizeBytes: manifest.file.sizeBytes,
          }),
        "SESSION_CREATE_FAILED",
      );
      manifest = {
        ...manifest,
        checkpoint: "ISSUE_TARGET",
        session: {
          id: session.id,
          targetExpiresAt: null,
          targetRequestVersion: session.version,
          version: session.version,
        },
      };
      await dependencies.persist(manifest);
      continue;
    }

    if (!manifest.session) {
      throw new MediaUploadEngineError("RECOVERY_INVALID", false);
    }

    if (manifest.checkpoint === "ISSUE_TARGET") {
      liveTarget = await callRemote(
        () =>
          dependencies.issueTarget({
            idempotencyKey: manifest.idempotency.target,
            mimeType: manifest.file.mimeType,
            sessionId: manifest.session!.id,
            signal: dependencies.signal,
            sizeBytes: manifest.file.sizeBytes,
            version: manifest.session!.targetRequestVersion,
          }),
        "TARGET_ISSUE_FAILED",
      );
      if (liveTarget.expiresAt <= dependencies.now()) {
        throw new MediaUploadEngineError("UNSAFE_UPLOAD_TARGET", false);
      }
      manifest = {
        ...manifest,
        checkpoint: "UPLOAD",
        session: {
          ...manifest.session,
          targetExpiresAt: liveTarget.expiresAt,
          version: liveTarget.sessionVersion,
        },
      };
      await dependencies.persist(manifest);
      continue;
    }

    if (manifest.checkpoint === "UPLOAD") {
      if (!canAttemptUpload(manifest)) {
        throw new MediaUploadEngineError("MAX_RETRIES_REACHED", false);
      }
      if (!isTargetFresh(manifest, dependencies.now())) {
        manifest = rotateUploadTargetGeneration(manifest, dependencies.uuid);
        await dependencies.persist(manifest);
        continue;
      }
      if (!liveTarget) {
        liveTarget = await callRemote(
          () =>
            dependencies.issueTarget({
              idempotencyKey: manifest.idempotency.target,
              mimeType: manifest.file.mimeType,
              sessionId: manifest.session!.id,
              signal: dependencies.signal,
              sizeBytes: manifest.file.sizeBytes,
              version: manifest.session!.targetRequestVersion,
            }),
          "TARGET_RECOVERY_FAILED",
        );
        if (
          liveTarget.sessionVersion !== manifest.session.version
          || liveTarget.expiresAt !== manifest.session.targetExpiresAt
        ) {
          throw new MediaUploadEngineError("RECOVERY_TARGET_MISMATCH", false);
        }
      }
      if (!(await dependencies.isOnline())) {
        throw new MediaUploadEngineError("OFFLINE", true);
      }
      manifest = { ...manifest, attempts: manifest.attempts + 1 };
      await dependencies.persist(manifest);
      dependencies.onProgress(0);
      try {
        await dependencies.upload({
          fileUri: manifest.file.uri,
          signal: dependencies.signal,
          target: liveTarget,
        });
      } catch (error) {
        if (dependencies.signal.aborted || isAbortError(error)) {
          throw new MediaUploadEngineError("CANCELLED", false, { cause: error });
        }
        if (remoteErrorCode(error) === "TIMEOUT") {
          throw new MediaUploadEngineError("TIMEOUT", true, { cause: error });
        }
        throw new MediaUploadEngineError("UPLOAD_INTERRUPTED", true, {
          cause: error,
        });
      }
      manifest = { ...manifest, checkpoint: "FINALIZE" };
      await dependencies.persist(manifest);
      continue;
    }

    if (manifest.checkpoint === "FINALIZE") {
      let finalized: Awaited<
        ReturnType<CustomerAvatarUploadEngineDependencies["finalize"]>
      >;
      try {
        finalized = await dependencies.finalize({
          idempotencyKey: manifest.idempotency.finalize,
          sessionId: manifest.session.id,
          signal: dependencies.signal,
          version: manifest.session.version,
        });
      } catch (error) {
        const code = remoteErrorCode(error);
        if (
          code === "UPLOAD_OBJECT_MISMATCH"
          && manifest.attempts < MEDIA_UPLOAD_MAX_ATTEMPTS
        ) {
          manifest = rotateUploadTargetGeneration(
            manifest,
            dependencies.uuid,
          );
          await dependencies.persist(manifest);
          throw new MediaUploadEngineError("UPLOAD_RETRY_REQUIRED", true, {
            cause: error,
          });
        }
        throw normalizeRemoteError(error, "FINALIZE_FAILED");
      }
      if (finalized.asset.state !== "READY") {
        await dependencies.cleanupLocal(manifest);
        throw new MediaUploadEngineError(finalized.asset.state, false);
      }
      manifest = {
        ...manifest,
        assetId: finalized.asset.id,
        checkpoint: "ATTACH",
      };
      await dependencies.persist(manifest);
      continue;
    }

    if (!manifest.assetId) {
      throw new MediaUploadEngineError("RECOVERY_INVALID", false);
    }
    const assetId = manifest.assetId;
    const container = await callRemote(
      () => dependencies.getContainer(dependencies.signal),
      "CONTAINER_REFRESH_FAILED",
    );
    const binding =
      container.bindings.find((item) => item.slot === "CUSTOMER_AVATAR")
      ?? null;
    if (binding?.media?.assetId === assetId) {
      dependencies.onCommitPhaseChange?.("COMMITTED");
      await dependencies.cleanupLocal(manifest);
      dependencies.onProgress(1);
      return { assetId, container };
    }
    if (container.version !== manifest.containerVersion) {
      await dependencies.cleanupLocal(manifest);
      throw new MediaUploadEngineError("DESTINATION_CHANGED", false);
    }
    assertNotCancelled(dependencies.signal);
    if (manifest.checkpoint === "ATTACH") {
      dependencies.onCommitPhaseChange?.("COMMITTING");
      manifest = { ...manifest, checkpoint: "VERIFY_ATTACH" };
      await dependencies.persist(manifest);
    }
    const attached = await callRemote(
      () =>
        dependencies.attach({
          assetId,
          containerVersion: manifest.containerVersion,
          idempotencyKey: manifest.idempotency.attach,
          replace: Boolean(binding),
          signal: dependencies.signal,
        }),
      "ATTACH_FAILED",
    );
    dependencies.onCommitPhaseChange?.("COMMITTED");
    await dependencies.cleanupLocal(manifest);
    dependencies.onProgress(1);
    return { assetId, container: attached };
  }

  throw new MediaUploadEngineError("TRANSITION_LIMIT_REACHED", false);
}

async function callRemote<T>(operation: () => Promise<T>, fallbackCode: string) {
  try {
    return await operation();
  } catch (error) {
    throw normalizeRemoteError(error, fallbackCode);
  }
}

function normalizeRemoteError(error: unknown, fallbackCode: string) {
  if (error instanceof MediaUploadEngineError) return error;
  if (error instanceof MediaUploadPolicyError) {
    return new MediaUploadEngineError(error.code, false, { cause: error });
  }
  const code = remoteErrorCode(error);
  return new MediaUploadEngineError(
    code ?? fallbackCode,
    Boolean(
      code
      && [
        "NETWORK_ERROR",
        "RATE_LIMITED",
        "SERVICE_UNAVAILABLE",
        "STORAGE_PROVIDER_FAILURE",
        "TIMEOUT",
      ].includes(code),
    ),
    { cause: error },
  );
}

function remoteErrorCode(error: unknown) {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
  ) {
    return error.code;
  }
  return null;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function assertNotCancelled(signal: AbortSignal) {
  if (signal.aborted) {
    throw new MediaUploadEngineError("CANCELLED", false);
  }
}
