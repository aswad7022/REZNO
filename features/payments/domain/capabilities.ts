import { paymentCurrencyRegistry } from "./money";

export function paymentCapabilities(input: {
  organizationOnlinePaymentsEnabled?: boolean;
  providerConfigured: boolean;
}) {
  const organizationEnabled = input.organizationOnlinePaymentsEnabled ?? false;
  return {
    kind: "PAYMENT_CAPABILITIES" as const,
    providerConfigured: input.providerConfigured,
    organizationOnlinePaymentsEnabled: organizationEnabled,
    onlinePaymentsAvailable: input.providerConfigured && organizationEnabled,
    supportedMethods: input.providerConfigured && organizationEnabled ? ["ONLINE_PROVIDER"] as const : [],
    offlineMethods: ["CASH_ON_DELIVERY", "PAY_AT_PICKUP"] as const,
    supportedCurrencies: ["IQD"] as const,
    minimumAmount: paymentCurrencyRegistry.IQD.minimumAmount,
    maximumAmount: paymentCurrencyRegistry.IQD.maximumAmount,
    requiresActionSupported: input.providerConfigured,
    refundsAvailable: input.providerConfigured,
  };
}
