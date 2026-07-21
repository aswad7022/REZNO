export type MobilePaymentCapabilities = {
  kind: "PAYMENT_CAPABILITIES";
  providerConfigured: boolean;
  organizationOnlinePaymentsEnabled: boolean;
  onlinePaymentsAvailable: boolean;
  supportedMethods: Array<"ONLINE_PROVIDER">;
  supportedCurrencies: Array<"IQD">;
  refundsAvailable: boolean;
  requiresActionSupported: boolean;
  minimumAmount: string;
  maximumAmount: string;
};

export type MobilePaymentIntent = {
  kind: "PAYMENT_INTENT";
  id: string;
  target: { kind: "ORDER" | "BOOKING"; id: string };
  status: string;
  amount: string;
  currency: "IQD";
  capturedAmount: string;
  refundedAmount: string;
  refundableAmount: string;
  version: number;
  provider: { kind: string; displayName: string };
  action: { kind: "PROVIDER_ACTION"; reference: string; expiresAt: string } | null;
  attempts: Array<{
    id: string;
    number: number;
    status: string;
    requiresAction: boolean;
    safeCode: string | null;
    createdAt: string;
    finishedAt: string | null;
  }>;
  refunds: Array<{
    id: string;
    amount: string;
    currency: string;
    reason: string;
    status: string;
    version: number;
    createdAt: string;
    completedAt: string | null;
  }>;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MobilePaymentPage = {
  kind: "PAYMENT_PAGE";
  items: MobilePaymentIntent[];
  pageSize: number;
  nextCursor: string | null;
};
