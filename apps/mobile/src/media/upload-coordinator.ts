import {
  acquireCustomerAvatarRunner,
  createCustomerAvatarRunnerRegistry,
  customerAvatarCancellationDisposition,
  isCustomerAvatarRunnerOwner,
  MediaUploadEngineError,
  releaseCustomerAvatarRunner,
  type CustomerAvatarCommitPhase,
  type CustomerAvatarRunnerOwner,
  type CustomerAvatarUploadEngineDependencies,
  type CustomerMediaContainer,
  updateCustomerAvatarRunner,
} from "./upload-engine";
import type {
  CustomerAvatarUploadManifest,
  MediaInputSource,
  MediaUploadCheckpoint,
} from "./upload-policy";

export type CustomerAvatarInputAsset = {
  height: number;
  type?: string | null;
  uri: string;
  width: number;
};

export type CustomerAvatarCoordinatorStatus =
  | "CAMERA_PERMISSION"
  | "CANCELLED"
  | "CANCELLING"
  | "CLEANUP_FAILED"
  | "COMMIT_UNCONFIRMED"
  | "DELETING"
  | "DESTINATION_CHANGED"
  | "DUPLICATE"
  | "ERROR"
  | "EXPIRED"
  | "FILE_TOO_LARGE"
  | "IDLE"
  | "LIBRARY_PERMISSION"
  | "LOADING"
  | "MAX_RETRIES"
  | "NORMALIZING"
  | "OFFLINE"
  | "PERMISSION_BLOCKED"
  | "PICKER_CANCELLED"
  | "PREVIEW_UNAVAILABLE"
  | "PROCESSING_RECOVERED"
  | "QUARANTINED"
  | "QUOTA"
  | "REFRESHING_PREVIEW"
  | "REJECTED"
  | "RETRYABLE"
  | "STALE"
  | "SUCCESS"
  | "TIMEOUT"
  | "UNAVAILABLE"
  | "UNSAFE_FILE"
  | "UNSUPPORTED"
  | "UPLOADING"
  | "VERIFYING_COMMIT";

export type CustomerAvatarCoordinatorSnapshot = {
  activeAssetId: string | null;
  avatarUrl: string | null;
  checkpoint: MediaUploadCheckpoint | "PREPARE" | null;
  container: CustomerMediaContainer | null;
  manifest: CustomerAvatarUploadManifest | null;
  maximumBytes: number | null;
  ownerId: string | null;
  pending: boolean;
  phase: CustomerAvatarCommitPhase | null;
  previewAssetId: string | null;
  progress: number;
  providerConfigured: boolean | null;
  retryable: boolean;
  runnerId: string | null;
  status: CustomerAvatarCoordinatorStatus;
};

export type CustomerAvatarCoordinatorDependencies = {
  bootstrap(ownerId: string): Promise<{
    container: CustomerMediaContainer;
    maximumBytes: number | null;
    providerConfigured: boolean;
  }>;
  cancel(
    manifest: CustomerAvatarUploadManifest,
    signal: AbortSignal,
  ): Promise<void>;
  createAbortController(): AbortController;
  createRunDependencies(input: {
    onActiveCancel(cancel: (() => void) | null): void;
    onCommitPhaseChange(phase: CustomerAvatarCommitPhase): void;
    onProgress(fraction: number): void;
    signal: AbortSignal;
  }): CustomerAvatarUploadEngineDependencies;
  discard(manifest: CustomerAvatarUploadManifest): Promise<void>;
  load(ownerId: string): Promise<CustomerAvatarUploadManifest | null>;
  loadPreview(assetId: string): Promise<string>;
  now(): number;
  prepare(input: {
    asset: CustomerAvatarInputAsset;
    containerVersion: number;
    maximumBytes: number;
    operationId: string;
    ownerId: string;
    source: MediaInputSource;
  }): Promise<CustomerAvatarUploadManifest>;
  recoverPendingInput(): Promise<{
    asset: CustomerAvatarInputAsset;
    source: "ANDROID_RECOVERY";
  } | null>;
  remove(input: {
    bindingId: string;
    containerVersion: number;
  }): Promise<CustomerMediaContainer>;
  run(
    manifest: CustomerAvatarUploadManifest,
    dependencies: CustomerAvatarUploadEngineDependencies,
  ): Promise<{ assetId: string; container: CustomerMediaContainer }>;
  uuid(): string;
};

type Subscriber = {
  listener(snapshot: CustomerAvatarCoordinatorSnapshot): void;
  ownerId: string;
};

type RunnerContext = {
  allowAutomaticHandoff: boolean;
  checkpoint: MediaUploadCheckpoint | "PREPARE";
  completion: Promise<void>;
  execution: Promise<void> | null;
  owner: CustomerAvatarRunnerOwner;
  ownerId: string;
  ownerTransitionRequested: boolean;
  resolveCompletion(): void;
};

const EMPTY_SNAPSHOT: CustomerAvatarCoordinatorSnapshot = {
  activeAssetId: null,
  avatarUrl: null,
  checkpoint: null,
  container: null,
  manifest: null,
  maximumBytes: null,
  ownerId: null,
  pending: false,
  phase: null,
  previewAssetId: null,
  progress: 0,
  providerConfigured: null,
  retryable: false,
  runnerId: null,
  status: "LOADING",
};

export class CustomerAvatarUploadCoordinator {
  private activeOwnerId: string | null = null;
  private bootstrapOwnerId: string | null = null;
  private bootstrapPromise: Promise<void> | null = null;
  private readonly dependencies: CustomerAvatarCoordinatorDependencies;
  private readonly registry = createCustomerAvatarRunnerRegistry();
  private runner: RunnerContext | null = null;
  private snapshot: CustomerAvatarCoordinatorSnapshot = EMPTY_SNAPSHOT;
  private readonly subscribers = new Set<Subscriber>();
  private previewGeneration = 0;

  constructor(dependencies: CustomerAvatarCoordinatorDependencies) {
    this.dependencies = dependencies;
  }

  getSnapshot = (ownerId: string) => {
    if (this.snapshot.ownerId === ownerId) return this.snapshot;
    return { ...EMPTY_SNAPSHOT, ownerId };
  };

  subscribe = (
    ownerId: string,
    listener: (snapshot: CustomerAvatarCoordinatorSnapshot) => void,
  ) => {
    const subscriber = { listener, ownerId };
    this.subscribers.add(subscriber);
    listener(this.getSnapshot(ownerId));
    return () => {
      this.subscribers.delete(subscriber);
    };
  };

  async bootstrap(ownerId: string) {
    this.activeOwnerId = ownerId;
    await this.transitionFromOtherOwner(ownerId);
    if (this.activeOwnerId !== ownerId) return;
    if (
      this.bootstrapPromise
      && this.bootstrapOwnerId === ownerId
    ) {
      return this.bootstrapPromise;
    }
    if (this.runner && this.runner.ownerId === ownerId) {
      return this.runner.completion;
    }

    this.bootstrapOwnerId = ownerId;
    const operation = this.bootstrapOwner(ownerId);
    this.bootstrapPromise = operation;
    try {
      await operation;
    } finally {
      if (this.bootstrapPromise === operation) {
        this.bootstrapPromise = null;
        this.bootstrapOwnerId = null;
      }
    }
  }

  async prepareAndStart(input: {
    asset: CustomerAvatarInputAsset;
    ownerId: string;
    source: MediaInputSource;
  }) {
    if (this.activeOwnerId !== input.ownerId) return "STALE_OWNER" as const;
    const snapshot = this.getSnapshot(input.ownerId);
    if (
      this.runner
      || snapshot.pending
    ) {
      return "ACTIVE" as const;
    }
    if (
      !snapshot.container
      || snapshot.providerConfigured !== true
      || !snapshot.maximumBytes
    ) {
      this.publishFor(input.ownerId, {
        retryable: false,
        status: "UNAVAILABLE",
      });
      return "UNAVAILABLE" as const;
    }

    const operationId = this.dependencies.uuid();
    const context = this.claim({
      allowAutomaticHandoff: true,
      checkpoint: "PREPARE",
      operationId,
      ownerId: input.ownerId,
      status: input.source === "ANDROID_RECOVERY"
        ? "PROCESSING_RECOVERED"
        : "NORMALIZING",
    });
    if (!context) return "ACTIVE" as const;

    context.execution = this.prepareAndExecute(context, {
      ...input,
      containerVersion: snapshot.container.version,
      maximumBytes: snapshot.maximumBytes,
      operationId,
    });
    await context.completion;
    return "COMPLETED" as const;
  }

  async retry(ownerId: string) {
    if (this.activeOwnerId !== ownerId) return;
    if (this.runner) return this.runner.completion;
    let recovered: CustomerAvatarUploadManifest | null;
    try {
      recovered = await this.dependencies.load(ownerId);
    } catch (error) {
      this.publishFor(ownerId, {
        manifest: null,
        retryable: false,
        status: statusForError(error),
      });
      return;
    }
    if (!recovered) {
      this.publishFor(ownerId, {
        checkpoint: null,
        manifest: null,
        retryable: false,
        status: "EXPIRED",
      });
      return;
    }
    return this.startRecovered(recovered, true);
  }

  async cancel(ownerId: string) {
    if (this.activeOwnerId !== ownerId) return;
    let context = this.runner;
    const manifest = this.snapshot.ownerId === ownerId
      ? this.snapshot.manifest
      : null;
    if (context && context.ownerId !== ownerId) return;
    if (!context && !manifest) return;

    if (
      (context && customerAvatarCancellationDisposition(
        context.owner.commitPhase,
      ) === "VERIFY")
      || manifest?.checkpoint === "VERIFY_ATTACH"
    ) {
      if (context) {
        updateCustomerAvatarRunner(this.registry, context.owner, {
          verificationRequested: true,
        });
        this.publishFor(ownerId, {
          retryable: false,
          status: "VERIFYING_COMMIT",
        });
      } else if (manifest) {
        await this.startRecovered(manifest, false);
      }
      return;
    }

    if (!context && manifest) {
      context = this.claim({
        allowAutomaticHandoff: false,
        checkpoint: manifest.checkpoint,
        operationId: manifest.operationId,
        ownerId,
        status: "CANCELLING",
      });
    }
    if (!context) return;
    if (!this.isOwner(context)) return;
    await this.requestCancellation(context, manifest, false);
  }

  async remove(ownerId: string) {
    if (this.activeOwnerId !== ownerId) return;
    const snapshot = this.getSnapshot(ownerId);
    const binding =
      snapshot.container?.bindings.find(
        (item) => item.slot === "CUSTOMER_AVATAR",
      ) ?? null;
    if (
      this.runner
      || snapshot.pending
      || snapshot.manifest
      || !snapshot.container
      || !binding
    ) {
      return;
    }
    this.previewGeneration += 1;
    this.publishFor(ownerId, {
      pending: true,
      retryable: false,
      status: "DELETING",
    });
    try {
      const container = await this.dependencies.remove({
        bindingId: binding.id,
        containerVersion: snapshot.container.version,
      });
      if (this.snapshot.ownerId !== ownerId) return;
      this.publishFor(ownerId, {
        activeAssetId: null,
        avatarUrl: null,
        container,
        previewAssetId: null,
        status: "IDLE",
      });
    } catch (error) {
      this.publishFor(ownerId, { status: statusForError(error) });
    } finally {
      this.publishFor(ownerId, { pending: false });
    }
  }

  async retryPreview(ownerId: string) {
    if (this.activeOwnerId !== ownerId) return;
    const snapshot = this.getSnapshot(ownerId);
    if (!snapshot.previewAssetId || snapshot.pending) return;
    this.publishFor(ownerId, {
      pending: true,
      status: "REFRESHING_PREVIEW",
    });
    await this.loadPreview(
      ownerId,
      snapshot.previewAssetId,
      "SUCCESS",
      true,
    );
  }

  reportStatus(
    ownerId: string,
    status: CustomerAvatarCoordinatorStatus,
  ) {
    if (this.activeOwnerId !== ownerId) return;
    if (this.runner && this.runner.ownerId === ownerId) return;
    this.publishFor(ownerId, { status });
  }

  reportError(ownerId: string, error: unknown) {
    if (this.activeOwnerId !== ownerId) return;
    if (this.runner && this.runner.ownerId === ownerId) return;
    this.publishFor(ownerId, {
      retryable: false,
      status: statusForError(error),
    });
  }

  private async bootstrapOwner(ownerId: string) {
    this.resetForOwner(ownerId);
    try {
      const bootstrap = await this.dependencies.bootstrap(ownerId);
      if (this.snapshot.ownerId !== ownerId) return;
      const activeAssetId = avatarAssetId(bootstrap.container);
      this.publishFor(ownerId, {
        activeAssetId,
        avatarUrl: activeAssetId === this.snapshot.activeAssetId
          ? this.snapshot.avatarUrl
          : null,
        container: bootstrap.container,
        maximumBytes: bootstrap.maximumBytes,
        previewAssetId: null,
        providerConfigured: bootstrap.providerConfigured,
        status: bootstrap.providerConfigured ? "IDLE" : "UNAVAILABLE",
      });
      if (activeAssetId) {
        await this.loadPreview(ownerId, activeAssetId, "IDLE", false);
      }

      const recovered = await this.dependencies.load(ownerId);
      if (this.snapshot.ownerId !== ownerId) return;
      if (this.runner) return this.runner.completion;
      if (recovered) {
        if (
          this.dependencies.now() >= recovered.expiresAt
          || bootstrap.providerConfigured
          || recovered.checkpoint === "ATTACH"
          || recovered.checkpoint === "VERIFY_ATTACH"
        ) {
          await this.startRecovered(recovered, true);
        } else {
          this.publishFor(ownerId, {
            checkpoint: recovered.checkpoint,
            manifest: recovered,
            retryable: false,
            status: "UNAVAILABLE",
          });
        }
        return;
      }
      const pendingInput = await this.dependencies.recoverPendingInput();
      if (this.snapshot.ownerId !== ownerId || this.runner || !pendingInput) {
        return;
      }
      await this.prepareAndStart({ ...pendingInput, ownerId });
    } catch (error) {
      if (this.snapshot.ownerId === ownerId) {
        this.publishFor(ownerId, { status: statusForError(error) });
      }
    }
  }

  private async prepareAndExecute(
    context: RunnerContext,
    input: {
      asset: CustomerAvatarInputAsset;
      containerVersion: number;
      maximumBytes: number;
      operationId: string;
      ownerId: string;
      source: MediaInputSource;
    },
  ) {
    try {
      const manifest = await this.dependencies.prepare(input);
      if (!this.isOwner(context)) return;
      context.checkpoint = manifest.checkpoint;
      if (context.owner.cancelRequested) return;
      this.publishFor(context.ownerId, {
        checkpoint: manifest.checkpoint,
        manifest,
        status: "UPLOADING",
      });
      await this.executeOwned(context, manifest);
    } catch (error) {
      if (!this.isOwner(context)) return;
      if (context.owner.cancelRequested) return;
      this.publishFor(context.ownerId, {
        retryable: false,
        status: statusForError(error),
      });
      this.release(context);
    }
  }

  private async startRecovered(
    manifest: CustomerAvatarUploadManifest,
    allowAutomaticHandoff: boolean,
  ) {
    if (this.runner) return this.runner.completion;
    const context = this.claim({
      allowAutomaticHandoff,
      checkpoint: manifest.checkpoint,
      operationId: manifest.operationId,
      ownerId: manifest.ownerId,
      status: manifest.checkpoint === "VERIFY_ATTACH"
        ? "VERIFYING_COMMIT"
        : "UPLOADING",
    });
    if (!context) return;
    this.publishFor(manifest.ownerId, {
      checkpoint: manifest.checkpoint,
      manifest,
    });
    context.execution = this.executeOwned(context, manifest);
    await context.completion;
  }

  private async executeOwned(
    context: RunnerContext,
    initial: CustomerAvatarUploadManifest,
  ) {
    let handoff: CustomerAvatarUploadManifest | null = null;
    let committed:
      | { assetId: string; container: CustomerMediaContainer }
      | null = null;
    try {
      const dependencies = this.dependencies.createRunDependencies({
        onActiveCancel: (cancel) => {
          updateCustomerAvatarRunner(this.registry, context.owner, {
            activeCancel: cancel,
          });
        },
        onCommitPhaseChange: (phase) => {
          if (
            updateCustomerAvatarRunner(this.registry, context.owner, {
              commitPhase: phase,
            })
          ) {
            this.publishFor(context.ownerId, { phase });
          }
        },
        onProgress: (progress) => {
          if (this.isOwner(context)) {
            this.publishFor(context.ownerId, { progress });
          }
        },
        signal: context.owner.abortController.signal,
      });
      const persist = dependencies.persist;
      dependencies.persist = async (manifest) => {
        if (!this.isOwner(context) || context.owner.cancelRequested) {
          throw new MediaUploadEngineError("CANCELLED", false);
        }
        await persist(manifest);
        if (!this.isOwner(context) || context.owner.cancelRequested) {
          throw new MediaUploadEngineError("CANCELLED", false);
        }
        context.checkpoint = manifest.checkpoint;
        this.publishFor(context.ownerId, {
          checkpoint: manifest.checkpoint,
          manifest,
        });
      };

      committed = await this.dependencies.run(initial, dependencies);
      if (!this.isOwner(context)) return;
      this.previewGeneration += 1;
      this.publishFor(context.ownerId, {
        activeAssetId: committed.assetId,
        avatarUrl:
          this.snapshot.activeAssetId === committed.assetId
            ? this.snapshot.avatarUrl
            : null,
        checkpoint: null,
        container: committed.container,
        manifest: null,
        phase: "COMMITTED",
        previewAssetId: null,
        progress: 1,
        retryable: false,
        status: "SUCCESS",
      });
    } catch (error) {
      if (!this.isOwner(context) || context.owner.cancelRequested) return;
      const next = await this.dependencies
        .load(context.ownerId)
        .catch(() => null);
      if (!this.isOwner(context)) return;
      const commitUnconfirmed =
        context.owner.commitPhase === "COMMITTING"
        || next?.checkpoint === "VERIFY_ATTACH";
      this.publishFor(context.ownerId, {
        checkpoint: next?.checkpoint ?? null,
        manifest: next,
        retryable: Boolean(next) && (
          commitUnconfirmed
          || retryableError(error)
          || errorCode(error) === "RECOVERY_CLEANUP_FAILED"
        ),
        status: commitUnconfirmed
          ? "COMMIT_UNCONFIRMED"
          : statusForError(error),
      });
      if (
        commitUnconfirmed
        && next
        && context.allowAutomaticHandoff
      ) {
        handoff = next;
      }
    } finally {
      updateCustomerAvatarRunner(this.registry, context.owner, {
        activeCancel: null,
      });
      if (!context.owner.cancelRequested) {
        this.release(context, {
          complete: !handoff,
          preservePending: Boolean(handoff),
        });
      }
    }

    if (committed && !context.ownerTransitionRequested) {
      void this.loadPreview(
        context.ownerId,
        committed.assetId,
        "SUCCESS",
        false,
      );
    } else if (handoff) {
      await this.startRecovered(handoff, false);
      context.resolveCompletion();
    }
  }

  private async finishCancellation(
    context: RunnerContext,
    fallback: CustomerAvatarUploadManifest | null,
    cleanupController: AbortController,
    localOnly: boolean,
  ) {
    try {
      await context.execution;
      if (!this.isOwner(context)) return;
      const latest = await this.dependencies
        .load(context.ownerId)
        .catch(() => fallback);
      const target = latest ?? fallback;
      if (target) {
        if (localOnly) {
          await this.dependencies.discard(target);
        } else {
          await this.dependencies.cancel(target, cleanupController.signal);
        }
      }
      if (!this.isOwner(context)) return;
      this.publishFor(context.ownerId, {
        checkpoint: null,
        manifest: null,
        progress: 0,
        retryable: false,
        status: "CANCELLED",
      });
    } catch (error) {
      if (this.isOwner(context)) {
        this.publishFor(context.ownerId, {
          retryable: true,
          status: statusForError(error),
        });
      }
    } finally {
      updateCustomerAvatarRunner(this.registry, context.owner, {
        cleanupAbortController: null,
      });
      this.release(context);
    }
  }

  private claim(input: {
    allowAutomaticHandoff: boolean;
    checkpoint: MediaUploadCheckpoint | "PREPARE";
    operationId: string;
    ownerId: string;
    status: CustomerAvatarCoordinatorStatus;
  }) {
    const acquisition = acquireCustomerAvatarRunner(this.registry, {
      createAbortController: this.dependencies.createAbortController,
      createRunnerId: this.dependencies.uuid,
      operationId: input.operationId,
    });
    if (acquisition.status !== "ACQUIRED") return null;
    if (input.checkpoint === "VERIFY_ATTACH") {
      updateCustomerAvatarRunner(this.registry, acquisition.owner, {
        commitPhase: "COMMITTING",
      });
    }
    let resolveCompletion!: () => void;
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    const context: RunnerContext = {
      allowAutomaticHandoff: input.allowAutomaticHandoff,
      checkpoint: input.checkpoint,
      completion,
      execution: null,
      owner: acquisition.owner,
      ownerId: input.ownerId,
      ownerTransitionRequested: false,
      resolveCompletion,
    };
    this.runner = context;
    this.publishFor(input.ownerId, {
      checkpoint: input.checkpoint,
      pending: true,
      phase: acquisition.owner.commitPhase,
      progress: 0,
      retryable: false,
      runnerId: acquisition.owner.runnerId,
      status: input.status,
    });
    return context;
  }

  private release(
    context: RunnerContext,
    options: {
      complete?: boolean;
      preservePending?: boolean;
    } = {},
  ) {
    if (!this.isOwner(context)) return false;
    if (!releaseCustomerAvatarRunner(this.registry, context.owner)) return false;
    this.runner = null;
    this.publishFor(
      context.ownerId,
      options.preservePending
        ? {
            phase: context.owner.commitPhase,
            runnerId: null,
          }
        : {
            pending: false,
            phase: context.owner.commitPhase,
            runnerId: null,
          },
    );
    if (options.complete !== false) context.resolveCompletion();
    return true;
  }

  private isOwner(context: RunnerContext) {
    return (
      this.runner === context
      && isCustomerAvatarRunnerOwner(this.registry, context.owner)
    );
  }

  private async loadPreview(
    ownerId: string,
    assetId: string,
    successStatus: CustomerAvatarCoordinatorStatus,
    clearPending: boolean,
  ) {
    const generation = ++this.previewGeneration;
    try {
      const url = await this.dependencies.loadPreview(assetId);
      if (
        generation !== this.previewGeneration
        || this.snapshot.ownerId !== ownerId
        || this.snapshot.activeAssetId !== assetId
      ) {
        return "STALE" as const;
      }
      this.publishFor(ownerId, {
        avatarUrl: url,
        previewAssetId: null,
        status: this.runner ? this.snapshot.status : successStatus,
      });
      return "READY" as const;
    } catch {
      if (
        generation !== this.previewGeneration
        || this.snapshot.ownerId !== ownerId
        || this.snapshot.activeAssetId !== assetId
      ) {
        return "STALE" as const;
      }
      this.publishFor(ownerId, {
        avatarUrl: null,
        previewAssetId: assetId,
        status: this.runner
          ? this.snapshot.status
          : "PREVIEW_UNAVAILABLE",
      });
      return "UNAVAILABLE" as const;
    } finally {
      if (
        clearPending
        && generation === this.previewGeneration
        && this.snapshot.ownerId === ownerId
        && this.snapshot.activeAssetId === assetId
        && !this.runner
      ) {
        this.publishFor(ownerId, { pending: false });
      }
    }
  }

  private async transitionFromOtherOwner(ownerId: string) {
    const active = this.runner;
    if (active && active.ownerId !== ownerId) {
      active.ownerTransitionRequested = true;
      active.allowAutomaticHandoff = false;
      if (
        customerAvatarCancellationDisposition(active.owner.commitPhase)
        === "CANCEL"
      ) {
        const manifest = this.snapshot.ownerId === active.ownerId
          ? this.snapshot.manifest
          : null;
        await this.requestCancellation(active, manifest, true);
      } else {
        this.publishFor(active.ownerId, {
          retryable: false,
          status: "VERIFYING_COMMIT",
        });
        await active.completion;
        await this.discardTransitionRecovery(active);
      }
    }
  }

  private async requestCancellation(
    context: RunnerContext,
    fallback: CustomerAvatarUploadManifest | null,
    localOnly: boolean,
  ) {
    if (!this.isOwner(context)) return;
    if (!context.owner.cancelRequested) {
      updateCustomerAvatarRunner(this.registry, context.owner, {
        cancelRequested: true,
      });
      this.publishFor(context.ownerId, {
        pending: true,
        retryable: false,
        status: "CANCELLING",
      });
      context.owner.activeCancel?.();
      context.owner.abortController.abort();
      const cleanupController = this.dependencies.createAbortController();
      updateCustomerAvatarRunner(this.registry, context.owner, {
        cleanupAbortController: cleanupController,
      });
      void this.finishCancellation(
        context,
        fallback,
        cleanupController,
        localOnly,
      );
    }
    await context.completion;
  }

  private async discardTransitionRecovery(context: RunnerContext) {
    const manifest = await this.dependencies
      .load(context.ownerId)
      .catch(() => null);
    if (
      manifest
      && manifest.operationId === context.owner.operationId
    ) {
      await this.dependencies.discard(manifest);
    }
  }

  private resetForOwner(ownerId: string) {
    if (this.snapshot.ownerId === ownerId) {
      this.publishFor(ownerId, {
        checkpoint: null,
        manifest: null,
        pending: false,
        phase: null,
        progress: 0,
        retryable: false,
        runnerId: null,
        status: "LOADING",
      });
      return;
    }
    this.previewGeneration += 1;
    this.snapshot = { ...EMPTY_SNAPSHOT, ownerId };
    this.notify();
  }

  private publishFor(
    ownerId: string,
    patch: Partial<CustomerAvatarCoordinatorSnapshot>,
  ) {
    if (this.snapshot.ownerId !== ownerId) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.notify();
  }

  private notify() {
    for (const subscriber of this.subscribers) {
      subscriber.listener(this.getSnapshot(subscriber.ownerId));
    }
  }
}

export function statusForError(
  error: unknown,
): CustomerAvatarCoordinatorStatus {
  const code = errorCode(error);
  if (code === "STORAGE_PROVIDER_NOT_CONFIGURED") return "UNAVAILABLE";
  if (code === "STORAGE_QUOTA_EXCEEDED") return "QUOTA";
  if (code === "FILE_TOO_LARGE") return "FILE_TOO_LARGE";
  if (code === "UNSUPPORTED_MEDIA_TYPE") return "UNSUPPORTED";
  if (
    code === "INVALID_FILE"
    || code === "NORMALIZATION_FAILED"
    || code === "PIXEL_LIMIT_EXCEEDED"
    || code === "RECOVERY_FILE_MISMATCH"
    || code === "RECOVERY_INVALID"
    || code === "RECOVERY_UNSAFE_PATH"
    || code === "UNSAFE_UPLOAD_TARGET"
  ) {
    return "UNSAFE_FILE";
  }
  if (code === "REJECTED") return "REJECTED";
  if (code === "QUARANTINED") return "QUARANTINED";
  if (code === "STALE_VERSION") return "STALE";
  if (code === "DESTINATION_CHANGED") return "DESTINATION_CHANGED";
  if (code === "OFFLINE") return "OFFLINE";
  if (code === "TIMEOUT") return "TIMEOUT";
  if (code === "MAX_RETRIES_REACHED") return "MAX_RETRIES";
  if (code === "RECOVERY_EXPIRED") return "EXPIRED";
  if (code === "RECOVERY_CLEANUP_FAILED") return "CLEANUP_FAILED";
  if (code === "ALREADY_RUNNING" || code === "PENDING_OPERATION") {
    return "DUPLICATE";
  }
  if (code === "CANCELLED") return "CANCELLED";
  if (retryableError(error)) return "RETRYABLE";
  return "ERROR";
}

function retryableError(error: unknown) {
  if (
    typeof error === "object"
    && error !== null
    && "retryable" in error
    && error.retryable === true
  ) {
    return true;
  }
  return [
    "NETWORK_ERROR",
    "RATE_LIMITED",
    "SERVICE_UNAVAILABLE",
    "STORAGE_PROVIDER_FAILURE",
    "TIMEOUT",
    "UPLOAD_INTERRUPTED",
  ].includes(errorCode(error));
}

function errorCode(error: unknown) {
  if (
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
  ) {
    return error.code;
  }
  return "";
}

function avatarAssetId(container: CustomerMediaContainer) {
  return (
    container.bindings.find((item) => item.slot === "CUSTOMER_AVATAR")
      ?.media?.assetId ?? null
  );
}
