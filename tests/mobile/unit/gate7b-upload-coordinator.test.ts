import assert from "node:assert/strict";
import test from "node:test";

import {
  CustomerAvatarUploadCoordinator,
  type CustomerAvatarCoordinatorDependencies,
} from "../../../apps/mobile/src/media/upload-coordinator";
import {
  runCustomerAvatarUpload,
  type CustomerAvatarUploadEngineDependencies,
  type CustomerMediaContainer,
} from "../../../apps/mobile/src/media/upload-engine";
import {
  createCustomerAvatarUploadManifest,
  type CustomerAvatarUploadManifest,
} from "../../../apps/mobile/src/media/upload-policy";

const NOW = 1_800_000_000_000;
const OWNER = "person_coordinator";
const OTHER_OWNER = "person_coordinator_other";
const ASSET_A = "00000000-0000-4000-8000-000000000201";
const ASSET_B = "00000000-0000-4000-8000-000000000202";

test("Gate 7B coordinator keeps one runner across locale rerenders and remounts", async () => {
  const releaseRun = deferred<void>();
  const harness = coordinatorHarness({
    async run(_manifest, dependencies) {
      harness.runStarted.resolve();
      await releaseRun.promise;
      dependencies.onCommitPhaseChange?.("COMMITTED");
      return { assetId: ASSET_B, container: containerFor(ASSET_B, 2) };
    },
  });
  await harness.coordinator.bootstrap(OWNER);

  const running = harness.coordinator.prepareAndStart({
    asset: inputAsset(),
    ownerId: OWNER,
    source: "LIBRARY",
  });
  await harness.runStarted.promise;
  const owned = harness.coordinator.getSnapshot(OWNER);
  assert.equal(owned.pending, true);
  assert.equal(owned.phase, "CANCELLABLE");
  assert.ok(owned.runnerId);

  const unsubscribeEnglish = harness.coordinator.subscribe(OWNER, () => {});
  unsubscribeEnglish();
  const unsubscribeArabic = harness.coordinator.subscribe(OWNER, () => {});
  const remountBootstrap = harness.coordinator.bootstrap(OWNER);
  const afterRemount = harness.coordinator.getSnapshot(OWNER);
  assert.equal(afterRemount.runnerId, owned.runnerId);
  assert.equal(afterRemount.phase, owned.phase);
  assert.equal(afterRemount.pending, true);
  assert.equal(harness.controllers.length, 1);
  assert.equal(harness.calls.run, 1);
  const duplicate = await harness.coordinator.prepareAndStart({
    asset: inputAsset(),
    ownerId: OWNER,
    source: "CAMERA",
  });
  assert.equal(duplicate, "ACTIVE");
  assert.equal(harness.coordinator.getSnapshot(OWNER).runnerId, owned.runnerId);
  assert.equal(harness.coordinator.getSnapshot(OWNER).status, owned.status);
  assert.equal(harness.calls.prepare, 1);
  assert.equal(harness.calls.run, 1);

  releaseRun.resolve();
  await Promise.all([running, remountBootstrap]);
  unsubscribeArabic();
  const complete = harness.coordinator.getSnapshot(OWNER);
  assert.equal(complete.pending, false);
  assert.equal(complete.phase, "COMMITTED");
  assert.equal(complete.runnerId, null);
  assert.equal(complete.status, "SUCCESS");
  assert.equal(harness.calls.run, 1);
  const unsubscribeKurdish = harness.coordinator.subscribe(OWNER, () => {});
  assert.equal(harness.coordinator.getSnapshot(OWNER), complete);
  unsubscribeKurdish();
});

test("Gate 7B delayed startup preview cannot adopt or disturb upload B", async () => {
  const previewA = deferred<string>();
  const releaseRun = deferred<void>();
  const harness = coordinatorHarness({
    initialAssetId: ASSET_A,
    async loadPreview(assetId) {
      assert.equal(assetId, ASSET_A);
      harness.previewStarted.resolve();
      return previewA.promise;
    },
    async run(_manifest, dependencies) {
      harness.runStarted.resolve();
      await new Promise<void>((resolve, reject) => {
        const finish = () => resolve();
        dependencies.signal.addEventListener(
          "abort",
          () => reject(Object.assign(new Error("cancelled"), {
            code: "CANCELLED",
          })),
          { once: true },
        );
        releaseRun.promise.then(finish, reject);
      });
      return { assetId: ASSET_B, container: containerFor(ASSET_B, 2) };
    },
  });

  const startup = harness.coordinator.bootstrap(OWNER);
  await harness.previewStarted.promise;
  const running = harness.coordinator.prepareAndStart({
    asset: inputAsset(),
    ownerId: OWNER,
    source: "CAMERA",
  });
  await harness.runStarted.promise;
  const ownerBeforeStartupResumes =
    harness.coordinator.getSnapshot(OWNER);
  previewA.resolve("https://preview.example/avatar-a");
  await flush();
  assert.equal(harness.calls.run, 1);
  assert.equal(harness.calls.prepare, 1);
  assert.equal(
    harness.coordinator.getSnapshot(OWNER).runnerId,
    ownerBeforeStartupResumes.runnerId,
  );
  assert.equal(harness.coordinator.getSnapshot(OWNER).pending, true);

  await harness.coordinator.cancel(OWNER);
  await Promise.all([startup, running]);
  assert.equal(harness.calls.run, 1);
  assert.equal(harness.calls.cancel, 1);
  assert.equal(harness.coordinator.getSnapshot(OWNER).status, "CANCELLED");
  assert.equal(harness.coordinator.getSnapshot(OWNER).pending, false);
  assert.equal(harness.coordinator.getSnapshot(OWNER).manifest, null);
  releaseRun.resolve();
});

test("Gate 7B cancellation waits for a pending persist before cleanup and release", async () => {
  const persistStarted = deferred<void>();
  const releasePersist = deferred<void>();
  let runCount = 0;
  const harness = coordinatorHarness({
    async persist(manifest) {
      if (runCount === 1 && manifest.checkpoint === "ISSUE_TARGET") {
        persistStarted.resolve();
        await releasePersist.promise;
      }
    },
    async run(manifest, dependencies) {
      runCount += 1;
      if (runCount === 1) {
        await dependencies.persist({
          ...manifest,
          checkpoint: "ISSUE_TARGET",
        });
        assert.equal(dependencies.signal.aborted, true);
        throw Object.assign(new Error("cancelled"), {
          code: "CANCELLED",
        });
      }
      harness.stored = null;
      dependencies.onCommitPhaseChange?.("COMMITTED");
      return { assetId: ASSET_B, container: containerFor(ASSET_B, 3) };
    },
  });
  await harness.coordinator.bootstrap(OWNER);
  const firstRun = harness.coordinator.prepareAndStart({
    asset: inputAsset(),
    ownerId: OWNER,
    source: "LIBRARY",
  });
  await persistStarted.promise;
  const original = harness.coordinator.getSnapshot(OWNER);
  const cancellation = harness.coordinator.cancel(OWNER);
  await flush();

  assert.equal(harness.coordinator.getSnapshot(OWNER).status, "CANCELLING");
  assert.equal(harness.coordinator.getSnapshot(OWNER).pending, true);
  assert.equal(
    harness.coordinator.getSnapshot(OWNER).runnerId,
    original.runnerId,
  );
  assert.equal(harness.calls.cancel, 0);
  const rejectedNewRun = await harness.coordinator.prepareAndStart({
    asset: inputAsset(),
    ownerId: OWNER,
    source: "CAMERA",
  });
  assert.equal(rejectedNewRun, "ACTIVE");
  assert.equal(harness.calls.prepare, 1);
  assert.equal(harness.calls.run, 1);

  releasePersist.resolve();
  await Promise.all([firstRun, cancellation]);
  assert.equal(harness.calls.cancel, 1);
  assert.equal(harness.stored, null);
  assert.equal(harness.coordinator.getSnapshot(OWNER).status, "CANCELLED");
  assert.equal(harness.coordinator.getSnapshot(OWNER).pending, false);
  assert.equal(harness.coordinator.getSnapshot(OWNER).runnerId, null);

  await harness.coordinator.prepareAndStart({
    asset: inputAsset(),
    ownerId: OWNER,
    source: "CAMERA",
  });
  assert.equal(harness.calls.prepare, 2);
  assert.equal(harness.calls.run, 2);
  assert.equal(harness.stored, null);
  assert.equal(harness.coordinator.getSnapshot(OWNER).status, "SUCCESS");
});

test("Gate 7B account switch quiesces pre-commit work before the new owner starts", async () => {
  const prepareStarted = deferred<void>();
  const releasePrepare = deferred<void>();
  const harness = coordinatorHarness({
    async beforePrepare() {
      prepareStarted.resolve();
      await releasePrepare.promise;
    },
    async run() {
      throw new Error("old-owner transport must not start after account switch");
    },
  });
  await harness.coordinator.bootstrap(OWNER);
  const oldRun = harness.coordinator.prepareAndStart({
    asset: inputAsset(),
    ownerId: OWNER,
    source: "LIBRARY",
  });
  await prepareStarted.promise;
  const oldOwner = harness.coordinator.getSnapshot(OWNER);

  const switchOwner = harness.coordinator.bootstrap(OTHER_OWNER);
  await flush();
  assert.equal(harness.controllers[0]?.signal.aborted, true);
  assert.equal(harness.coordinator.getSnapshot(OWNER).status, "CANCELLING");
  assert.equal(harness.coordinator.getSnapshot(OWNER).pending, true);
  assert.equal(
    harness.coordinator.getSnapshot(OWNER).runnerId,
    oldOwner.runnerId,
  );
  assert.equal(harness.calls.run, 0);
  assert.equal(harness.calls.cancel, 0);
  assert.equal(harness.calls.discard, 0);

  releasePrepare.resolve();
  await Promise.all([oldRun, switchOwner]);
  assert.equal(harness.calls.prepare, 1);
  assert.equal(harness.calls.run, 0);
  assert.equal(harness.calls.cancel, 0);
  assert.equal(harness.calls.discard, 1);
  assert.equal(harness.stored, null);
  const current = harness.coordinator.getSnapshot(OTHER_OWNER);
  assert.equal(current.ownerId, OTHER_OWNER);
  assert.equal(current.pending, false);
  assert.equal(current.runnerId, null);
  assert.equal(current.status, "IDLE");
});

test("Gate 7B cancel during COMMITTING verifies instead of aborting", async () => {
  const releaseCommit = deferred<void>();
  const harness = coordinatorHarness({
    async run(manifest, dependencies) {
      await dependencies.persist({
        ...manifest,
        assetId: ASSET_B,
        checkpoint: "VERIFY_ATTACH",
      });
      dependencies.onCommitPhaseChange?.("COMMITTING");
      harness.commitStarted.resolve();
      await releaseCommit.promise;
      dependencies.onCommitPhaseChange?.("COMMITTED");
      return { assetId: ASSET_B, container: containerFor(ASSET_B, 2) };
    },
  });
  await harness.coordinator.bootstrap(OWNER);
  const running = harness.coordinator.prepareAndStart({
    asset: inputAsset(),
    ownerId: OWNER,
    source: "LIBRARY",
  });
  await harness.commitStarted.promise;
  const beforeCancel = harness.coordinator.getSnapshot(OWNER);
  assert.equal(beforeCancel.phase, "COMMITTING");
  const unsubscribeBeforeRemount =
    harness.coordinator.subscribe(OWNER, () => {});
  unsubscribeBeforeRemount();
  const unsubscribeAfterRemount =
    harness.coordinator.subscribe(OWNER, () => {});
  const remount = harness.coordinator.bootstrap(OWNER);
  assert.equal(
    harness.coordinator.getSnapshot(OWNER).runnerId,
    beforeCancel.runnerId,
  );

  await harness.coordinator.cancel(OWNER);
  assert.equal(harness.controllers[0]?.signal.aborted, false);
  assert.equal(
    harness.coordinator.getSnapshot(OWNER).status,
    "VERIFYING_COMMIT",
  );
  assert.equal(harness.calls.cancel, 0);
  assert.equal(harness.coordinator.getSnapshot(OWNER).pending, true);

  releaseCommit.resolve();
  await Promise.all([running, remount]);
  unsubscribeAfterRemount();
  assert.equal(harness.coordinator.getSnapshot(OWNER).status, "SUCCESS");
  assert.equal(harness.coordinator.getSnapshot(OWNER).pending, false);
  assert.equal(harness.calls.run, 1);
});

test("Gate 7B account switch waits for an owned commit without new-owner overlap", async () => {
  const releaseCommit = deferred<void>();
  const harness = coordinatorHarness({
    async run(manifest, dependencies) {
      await dependencies.persist({
        ...manifest,
        assetId: ASSET_B,
        checkpoint: "VERIFY_ATTACH",
      });
      dependencies.onCommitPhaseChange?.("COMMITTING");
      harness.commitStarted.resolve();
      await releaseCommit.promise;
      dependencies.onCommitPhaseChange?.("COMMITTED");
      harness.stored = null;
      return { assetId: ASSET_B, container: containerFor(ASSET_B, 2) };
    },
  });
  await harness.coordinator.bootstrap(OWNER);
  const running = harness.coordinator.prepareAndStart({
    asset: inputAsset(),
    ownerId: OWNER,
    source: "LIBRARY",
  });
  await harness.commitStarted.promise;

  const switchOwner = harness.coordinator.bootstrap(OTHER_OWNER);
  await flush();
  assert.equal(harness.controllers[0]?.signal.aborted, false);
  assert.equal(
    harness.coordinator.getSnapshot(OWNER).status,
    "VERIFYING_COMMIT",
  );
  assert.equal(harness.coordinator.getSnapshot(OWNER).pending, true);
  assert.equal(harness.calls.run, 1);
  assert.equal(harness.calls.bootstrap, 1);

  releaseCommit.resolve();
  await Promise.all([running, switchOwner]);
  assert.equal(harness.calls.run, 1);
  assert.equal(harness.calls.bootstrap, 2);
  assert.equal(harness.calls.cancel, 0);
  assert.equal(harness.calls.discard, 0);
  assert.equal(harness.coordinator.getSnapshot(OTHER_OWNER).status, "IDLE");
  assert.equal(harness.coordinator.getSnapshot(OTHER_OWNER).pending, false);
});

test("Gate 7B claimed runner keeps its original API session through commit", async () => {
  const prepareStarted = deferred<void>();
  const releasePrepare = deferred<void>();
  const persistStarted = deferred<void>();
  const releasePersist = deferred<void>();
  let sessionOwner = OWNER;
  const harness = coordinatorHarness({
    async attach(capturedSessionOwner) {
      harness.attachedSessionOwners.push(capturedSessionOwner);
      return containerFor(ASSET_B, 2);
    },
    async beforePrepare() {
      prepareStarted.resolve();
      await releasePrepare.promise;
    },
    currentSessionOwner: () => sessionOwner,
    async persist(manifest) {
      if (manifest.checkpoint === "VERIFY_ATTACH") {
        persistStarted.resolve();
        await releasePersist.promise;
      }
    },
    async run(manifest, dependencies) {
      const attachManifest: CustomerAvatarUploadManifest = {
        ...manifest,
        assetId: ASSET_B,
        checkpoint: "ATTACH",
        session: {
          id: "00000000-0000-4000-8000-000000000301",
          targetExpiresAt: null,
          targetRequestVersion: 1,
          version: 1,
        },
      };
      harness.stored = attachManifest;
      return runCustomerAvatarUpload(attachManifest, dependencies);
    },
  });
  await harness.coordinator.bootstrap(OWNER);
  const running = harness.coordinator.prepareAndStart({
    asset: inputAsset(),
    ownerId: OWNER,
    source: "LIBRARY",
  });
  await prepareStarted.promise;
  assert.deepEqual(harness.capturedSessionOwners, [OWNER]);

  releasePrepare.resolve();
  await persistStarted.promise;
  assert.equal(harness.coordinator.getSnapshot(OWNER).phase, "COMMITTING");
  sessionOwner = OTHER_OWNER;
  const switchOwner = harness.coordinator.bootstrap(OTHER_OWNER);
  await flush();
  assert.equal(harness.calls.attach, 0);
  assert.equal(harness.calls.bootstrap, 1);
  assert.equal(harness.coordinator.getSnapshot(OWNER).pending, true);

  releasePersist.resolve();
  await Promise.all([running, switchOwner]);
  assert.equal(harness.calls.attach, 1);
  assert.deepEqual(harness.attachedSessionOwners, [OWNER]);
  assert.equal(harness.calls.bootstrap, 2);
  assert.equal(harness.coordinator.getSnapshot(OTHER_OWNER).status, "IDLE");
});

test("Gate 7B stale owner actions cannot cancel the current account runner", async () => {
  const runStarted = deferred<void>();
  const releaseRun = deferred<void>();
  const harness = coordinatorHarness({
    async run(manifest, dependencies) {
      assert.equal(manifest.ownerId, OTHER_OWNER);
      runStarted.resolve();
      await releaseRun.promise;
      dependencies.onCommitPhaseChange?.("COMMITTED");
      harness.stored = null;
      return { assetId: ASSET_B, container: containerFor(ASSET_B, 2) };
    },
  });
  await harness.coordinator.bootstrap(OWNER);
  await harness.coordinator.bootstrap(OTHER_OWNER);
  const running = harness.coordinator.prepareAndStart({
    asset: inputAsset(),
    ownerId: OTHER_OWNER,
    source: "LIBRARY",
  });
  await runStarted.promise;

  const current = harness.coordinator.getSnapshot(OTHER_OWNER);
  await harness.coordinator.cancel(OWNER);
  assert.equal(harness.controllers[0]?.signal.aborted, false);
  assert.equal(
    harness.coordinator.getSnapshot(OTHER_OWNER).runnerId,
    current.runnerId,
  );
  assert.equal(harness.coordinator.getSnapshot(OTHER_OWNER).pending, true);
  assert.equal(harness.calls.cancel, 0);
  assert.equal(harness.calls.run, 1);

  releaseRun.resolve();
  await running;
  assert.equal(harness.coordinator.getSnapshot(OTHER_OWNER).status, "SUCCESS");
  assert.equal(harness.coordinator.getSnapshot(OTHER_OWNER).pending, false);
});

test("Gate 7B committed attach stays successful when preview is unavailable", async () => {
  const harness = coordinatorHarness({
    async loadPreview(assetId) {
      assert.equal(assetId, ASSET_B);
      throw new Error("preview unavailable");
    },
    async run() {
      harness.stored = null;
      return { assetId: ASSET_B, container: containerFor(ASSET_B, 2) };
    },
  });
  await harness.coordinator.bootstrap(OWNER);
  await harness.coordinator.prepareAndStart({
    asset: inputAsset(),
    ownerId: OWNER,
    source: "LIBRARY",
  });
  await flush();

  const snapshot = harness.coordinator.getSnapshot(OWNER);
  assert.equal(snapshot.activeAssetId, ASSET_B);
  assert.equal(snapshot.status, "PREVIEW_UNAVAILABLE");
  assert.equal(snapshot.previewAssetId, ASSET_B);
  assert.equal(snapshot.manifest, null);
  assert.equal(snapshot.pending, false);
  assert.equal(harness.calls.run, 1);
  assert.equal(harness.calls.attach, 0);

  await harness.coordinator.retryPreview(OWNER);
  assert.equal(harness.calls.run, 1);
  assert.equal(harness.calls.attach, 0);
  assert.equal(
    harness.coordinator.getSnapshot(OWNER).status,
    "PREVIEW_UNAVAILABLE",
  );
});

test("Gate 7B ambiguous attach hands VERIFY_ATTACH to a new owned verifier", async () => {
  let runs = 0;
  const harness = coordinatorHarness({
    async run(manifest, dependencies) {
      runs += 1;
      if (runs === 1) {
        harness.calls.attach += 1;
        await dependencies.persist({
          ...manifest,
          assetId: ASSET_B,
          checkpoint: "VERIFY_ATTACH",
        });
        dependencies.onCommitPhaseChange?.("COMMITTING");
        throw Object.assign(new Error("network lost after attach"), {
          code: "NETWORK_ERROR",
          retryable: true,
        });
      }
      assert.equal(manifest.checkpoint, "VERIFY_ATTACH");
      harness.calls.verify += 1;
      dependencies.onCommitPhaseChange?.("COMMITTED");
      harness.stored = null;
      return { assetId: ASSET_B, container: containerFor(ASSET_B, 2) };
    },
  });
  await harness.coordinator.bootstrap(OWNER);
  await harness.coordinator.prepareAndStart({
    asset: inputAsset(),
    ownerId: OWNER,
    source: "LIBRARY",
  });

  const snapshot = harness.coordinator.getSnapshot(OWNER);
  assert.equal(harness.calls.run, 2);
  assert.equal(harness.calls.attach, 1);
  assert.equal(harness.calls.verify, 1);
  assert.equal(harness.controllers.length, 2);
  assert.equal(snapshot.status, "SUCCESS");
  assert.equal(snapshot.phase, "COMMITTED");
  assert.equal(snapshot.pending, false);
  assert.equal(snapshot.manifest, null);
});

test("Gate 7B unresolved VERIFY_ATTACH remains explicit and recoverable", async () => {
  let runs = 0;
  const harness = coordinatorHarness({
    async run(manifest, dependencies) {
      runs += 1;
      if (runs === 1) {
        await dependencies.persist({
          ...manifest,
          assetId: ASSET_B,
          checkpoint: "VERIFY_ATTACH",
        });
        dependencies.onCommitPhaseChange?.("COMMITTING");
      }
      throw Object.assign(new Error("verification unavailable"), {
        code: "NETWORK_ERROR",
        retryable: true,
      });
    },
  });
  await harness.coordinator.bootstrap(OWNER);
  await harness.coordinator.prepareAndStart({
    asset: inputAsset(),
    ownerId: OWNER,
    source: "LIBRARY",
  });

  const snapshot = harness.coordinator.getSnapshot(OWNER);
  assert.equal(harness.calls.run, 2);
  assert.equal(snapshot.checkpoint, "VERIFY_ATTACH");
  assert.equal(snapshot.status, "COMMIT_UNCONFIRMED");
  assert.equal(snapshot.retryable, true);
  assert.equal(snapshot.pending, false);
  assert.equal(snapshot.runnerId, null);
  assert.ok(snapshot.manifest);
});

test("Gate 7B recovery starts once only when no in-memory runner owns it", async () => {
  const manifest = manifestFor(
    "00000000-0000-4000-8000-000000000299",
  );
  const harness = coordinatorHarness({
    initialManifest: manifest,
    async run(recovered, dependencies) {
      assert.equal(recovered.operationId, manifest.operationId);
      dependencies.onCommitPhaseChange?.("COMMITTED");
      harness.stored = null;
      return { assetId: ASSET_B, container: containerFor(ASSET_B, 2) };
    },
  });
  const first = harness.coordinator.bootstrap(OWNER);
  const second = harness.coordinator.bootstrap(OWNER);
  await Promise.all([first, second]);
  assert.equal(harness.calls.bootstrap, 1);
  assert.equal(harness.calls.run, 1);
  assert.equal(harness.controllers.length, 1);
  assert.equal(harness.coordinator.getSnapshot(OWNER).status, "SUCCESS");
});

test("Gate 7B stale preview responses never replace a newer or removed avatar", async () => {
  const previewA = deferred<string>();
  const previewB = deferred<string>();
  const harness = coordinatorHarness({
    initialAssetId: ASSET_A,
    loadPreview(assetId) {
      if (assetId === ASSET_A) return previewA.promise;
      if (assetId === ASSET_B) return previewB.promise;
      throw new Error("unexpected asset");
    },
    async run() {
      harness.stored = null;
      return { assetId: ASSET_B, container: containerFor(ASSET_B, 2) };
    },
  });
  const startup = harness.coordinator.bootstrap(OWNER);
  await flush();
  const upload = harness.coordinator.prepareAndStart({
    asset: inputAsset(),
    ownerId: OWNER,
    source: "LIBRARY",
  });
  await upload;
  previewA.resolve("https://preview.example/stale-a");
  await startup;
  assert.equal(harness.coordinator.getSnapshot(OWNER).activeAssetId, ASSET_B);
  assert.notEqual(
    harness.coordinator.getSnapshot(OWNER).avatarUrl,
    "https://preview.example/stale-a",
  );

  previewB.resolve("https://preview.example/current-b");
  await flush();
  assert.equal(
    harness.coordinator.getSnapshot(OWNER).avatarUrl,
    "https://preview.example/current-b",
  );
  await harness.coordinator.remove(OWNER);
  assert.equal(harness.coordinator.getSnapshot(OWNER).activeAssetId, null);
  assert.equal(harness.coordinator.getSnapshot(OWNER).avatarUrl, null);
  assert.equal(harness.calls.run, 1);
  assert.equal(harness.calls.remove, 1);
});

function coordinatorHarness(options: {
  attach?(
    capturedSessionOwner: string,
  ): Promise<CustomerMediaContainer>;
  beforePrepare?(
    input: Parameters<CustomerAvatarCoordinatorDependencies["prepare"]>[0],
  ): Promise<void>;
  currentSessionOwner?(): string;
  initialAssetId?: string | null;
  initialManifest?: CustomerAvatarUploadManifest | null;
  loadPreview?(assetId: string): Promise<string>;
  persist?(manifest: CustomerAvatarUploadManifest): Promise<void>;
  run?(
    manifest: CustomerAvatarUploadManifest,
    dependencies: CustomerAvatarUploadEngineDependencies,
  ): Promise<{ assetId: string; container: CustomerMediaContainer }>;
} = {}) {
  const calls = {
    attach: 0,
    bootstrap: 0,
    cancel: 0,
    discard: 0,
    prepare: 0,
    remove: 0,
    run: 0,
    verify: 0,
  };
  const controllers: AbortController[] = [];
  const runStarted = deferred<void>();
  const previewStarted = deferred<void>();
  const commitStarted = deferred<void>();
  let uuidCounter = 1;
  const harness: {
    attachedSessionOwners: string[];
    calls: typeof calls;
    capturedSessionOwners: string[];
    commitStarted: ReturnType<typeof deferred<void>>;
    controllers: AbortController[];
    coordinator: CustomerAvatarUploadCoordinator;
    previewStarted: ReturnType<typeof deferred<void>>;
    runStarted: ReturnType<typeof deferred<void>>;
    stored: CustomerAvatarUploadManifest | null;
  } = {
    attachedSessionOwners: [],
    calls,
    capturedSessionOwners: [],
    commitStarted,
    controllers,
    coordinator: null as unknown as CustomerAvatarUploadCoordinator,
    previewStarted,
    runStarted,
    stored: options.initialManifest ?? null,
  };
  const dependencies: CustomerAvatarCoordinatorDependencies = {
    async bootstrap() {
      calls.bootstrap += 1;
      return {
        container: containerFor(options.initialAssetId ?? null, 1),
        maximumBytes: 5 * 1024 * 1024,
        providerConfigured: true,
      };
    },
    async cancel() {
      calls.cancel += 1;
      harness.stored = null;
    },
    createAbortController() {
      const controller = new AbortController();
      controllers.push(controller);
      return controller;
    },
    createRunDependencies(input) {
      const capturedSessionOwner = options.currentSessionOwner?.() ?? OWNER;
      harness.capturedSessionOwners.push(capturedSessionOwner);
      const dependencies: CustomerAvatarUploadEngineDependencies = {
        async attach() {
          calls.attach += 1;
          return options.attach?.(capturedSessionOwner)
            ?? containerFor(ASSET_B, 2);
        },
        async cleanupLocal(manifest) {
          if (harness.stored?.operationId === manifest.operationId) {
            harness.stored = null;
          }
        },
        async createSession() {
          throw new Error("engine adapter is not used by coordinator tests");
        },
        async finalize() {
          throw new Error("engine adapter is not used by coordinator tests");
        },
        async getContainer() {
          return containerFor(options.initialAssetId ?? null, 1);
        },
        async isOnline() {
          return true;
        },
        async issueTarget() {
          throw new Error("engine adapter is not used by coordinator tests");
        },
        now: () => NOW,
        onCommitPhaseChange: input.onCommitPhaseChange,
        onProgress: input.onProgress,
        async persist(manifest) {
          await options.persist?.(manifest);
          harness.stored = manifest;
        },
        signal: input.signal,
        async upload() {
          throw new Error("engine adapter is not used by coordinator tests");
        },
        uuid: () => nextUuid(),
      };
      return dependencies;
    },
    async discard() {
      calls.discard += 1;
      harness.stored = null;
    },
    async load() {
      return harness.stored;
    },
    loadPreview: options.loadPreview
      ?? (async (assetId) => `https://preview.example/${assetId}`),
    now: () => NOW,
    async prepare(input) {
      calls.prepare += 1;
      await options.beforePrepare?.(input);
      const manifest = manifestFor(input.operationId, input.ownerId);
      harness.stored = manifest;
      return manifest;
    },
    async recoverPendingInput() {
      return null;
    },
    async remove() {
      calls.remove += 1;
      return containerFor(null, 3);
    },
    async run(manifest, runDependencies) {
      calls.run += 1;
      if (options.run) return options.run(manifest, runDependencies);
      harness.stored = null;
      runDependencies.onCommitPhaseChange?.("COMMITTED");
      return { assetId: ASSET_B, container: containerFor(ASSET_B, 2) };
    },
    uuid: () => nextUuid(),
  };
  function nextUuid() {
    return `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`;
  }
  harness.coordinator = new CustomerAvatarUploadCoordinator(dependencies);
  return harness;
}

function manifestFor(operationId: string, ownerId = OWNER) {
  let uuidCounter = 500;
  return createCustomerAvatarUploadManifest({
    checksumSha256: "b".repeat(64),
    containerVersion: 1,
    fileUri: "file:///safe/coordinator.jpg",
    now: NOW,
    operationId,
    ownerId,
    sizeBytes: 1024,
    source: "LIBRARY",
    uuid: () =>
      `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, "0")}`,
  });
}

function inputAsset() {
  return {
    height: 1024,
    type: "image",
    uri: "file:///private/source.heic",
    width: 1024,
  };
}

function containerFor(
  assetId: string | null,
  version: number,
): CustomerMediaContainer {
  return {
    bindings: assetId
      ? [{
          id: `binding-${assetId}`,
          media: { assetId },
          slot: "CUSTOMER_AVATAR",
        }]
      : [],
    version,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}
