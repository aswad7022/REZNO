import {
  parseHostedPaymentRecoveryManifest,
  type HostedPaymentRecoveryManifest,
} from "./hosted-payment-policy";

export type HostedPaymentRecoveryStoreDependencies = {
  approvedOrigins: readonly string[];
  deleteItem(key: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  keyForOwner(ownerId: string): Promise<string>;
  now(): number;
  setItem(key: string, value: string): Promise<void>;
};

export class HostedPaymentRecoveryStore {
  constructor(
    private readonly dependencies: HostedPaymentRecoveryStoreDependencies,
  ) {}

  async cleanup(manifest: HostedPaymentRecoveryManifest) {
    const key = await this.dependencies.keyForOwner(manifest.ownerId);
    const raw = await this.dependencies.getItem(key);
    if (!raw) return;
    let operationId: unknown;
    try {
      operationId = (JSON.parse(raw) as { operationId?: unknown }).operationId;
    } catch {
      operationId = null;
    }
    if (operationId === manifest.operationId || operationId === null) {
      await this.dependencies.deleteItem(key);
    }
  }

  async load(ownerId: string) {
    const key = await this.dependencies.keyForOwner(ownerId);
    const raw = await this.dependencies.getItem(key);
    if (!raw) return null;
    try {
      return parseHostedPaymentRecoveryManifest(raw, {
        allowExpired: true,
        approvedOrigins: this.dependencies.approvedOrigins,
        now: this.dependencies.now(),
        ownerId,
      });
    } catch {
      await this.dependencies.deleteItem(key);
      return null;
    }
  }

  async persist(manifest: HostedPaymentRecoveryManifest) {
    const key = await this.dependencies.keyForOwner(manifest.ownerId);
    await this.dependencies.setItem(key, JSON.stringify(manifest));
  }
}
