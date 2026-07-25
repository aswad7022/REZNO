export type CustomerAvatarCleanupStep = "FILE" | "MANIFEST";

export class CustomerAvatarCleanupError extends Error {
  readonly code = "RECOVERY_CLEANUP_FAILED";

  constructor(
    readonly step: CustomerAvatarCleanupStep,
    options?: { cause?: unknown },
  ) {
    super("RECOVERY_CLEANUP_FAILED", options);
    this.name = "CustomerAvatarCleanupError";
  }
}

export async function cleanupCustomerAvatarRecoveryArtifacts(input: {
  cleanupFile(): Promise<void>;
  cleanupManifest(): Promise<void>;
}) {
  try {
    await input.cleanupFile();
  } catch (error) {
    // Keep the manifest as the recovery pointer when the private file could
    // not be removed. A later cleanup attempt can therefore retry safely.
    throw new CustomerAvatarCleanupError("FILE", { cause: error });
  }

  try {
    await input.cleanupManifest();
  } catch (error) {
    throw new CustomerAvatarCleanupError("MANIFEST", { cause: error });
  }
}
