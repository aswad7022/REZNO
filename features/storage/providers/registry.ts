import "server-only";

import type { StorageProviderKind } from "@prisma/client";

import { storageError } from "@/features/storage/domain/errors";
import { storageRuntimeEnvironment } from "@/features/storage/domain/policy";
import type { StorageProvider } from "@/features/storage/providers/provider";
import { NotConfiguredStorageProvider } from "@/features/storage/providers/provider";

const notConfigured = new NotConfiguredStorageProvider();
let testProvider: StorageProvider | undefined;

export function setStorageProviderForTests(provider: StorageProvider | undefined) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Storage provider test configuration is unavailable in production.");
  }
  testProvider = provider;
}

export function configuredStorageProvider(): StorageProvider {
  if (testProvider) {
    if (testProvider.kind === "DETERMINISTIC_TEST" && storageRuntimeEnvironment() === "production") {
      throw new Error("Deterministic storage provider cannot run in production.");
    }
    return testProvider;
  }
  return notConfigured;
}

export function storageProviderFor(kind: StorageProviderKind) {
  const provider = configuredStorageProvider();
  if (provider.kind !== kind) {
    if (kind === "NOT_CONFIGURED") {
      storageError("STORAGE_PROVIDER_NOT_CONFIGURED", "Managed storage provider is not configured.");
    }
    storageError("STORAGE_PROVIDER_FAILURE", "Managed storage provider is unavailable.");
  }
  return provider;
}
