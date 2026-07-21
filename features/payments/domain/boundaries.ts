export const PAYMENTS_GATE5C_EXCLUSIONS = [
  "REAL_PAYMENT_PROVIDER",
  "BANK_PAYOUT",
  "AUTOMATIC_SETTLEMENT_SCHEDULE",
  "ASYNC_WEBHOOK_WORKER",
  "CUSTOMER_SELF_SERVICE_REFUND",
  "APPLE_PAY",
  "GOOGLE_PAY",
  "CARD_DATA_COLLECTION",
  "STAGE_6_JOBS_AND_WORKERS",
  "STAGE_7_AI",
  "STAGE_8_LAUNCH",
] as const;

export const PAYMENTS_STAGE6_WORKER_HANDOFF = [
  "provider-event queue consumption",
  "scheduled reconciliation",
  "scheduled settlement statement generation",
  "provider retry orchestration",
] as const;
