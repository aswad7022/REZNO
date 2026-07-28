import "server-only";

export const AI_GATE_A_POLICY_VERSION = "ai-gate-a-policy-v1" as const;
export const AI_GATE_A_PROMPT_VERSION = "ai-gate-a-no-provider-v1" as const;
export const AI_GATE_A_EVAL_VERSION = "ai-gate-a-evals-v1" as const;

export const AI_SUPPORTED_LOCALES = ["ar", "en", "ckb"] as const;
export type AiLocale = (typeof AI_SUPPORTED_LOCALES)[number];

export const AI_ACTOR_ROLES = [
  "CUSTOMER",
  "BUSINESS_OWNER",
  "BUSINESS_MANAGER",
  "BUSINESS_STAFF",
  "ADMIN",
] as const;
export type AiActorRole = (typeof AI_ACTOR_ROLES)[number];

export const AI_ALLOWED_GATE_A_USE_CASES = [
  "CUSTOMER_DISCOVERY_INTENT",
  "CATEGORY_FILTER_SUGGESTION",
  "PUBLIC_BUSINESS_SUMMARY",
  "READ_ONLY_OPTION_RANKING",
  "GROUNDED_EXPLANATION",
] as const;
export type AiAllowedUseCase = (typeof AI_ALLOWED_GATE_A_USE_CASES)[number];

export const AI_FORBIDDEN_ACTIONS = [
  "CREATE_BOOKING",
  "CANCEL_BOOKING",
  "RESCHEDULE_BOOKING",
  "EXECUTE_PAYMENT",
  "CHANGE_PAYMENT_STATE",
  "SEND_MESSAGE",
  "SEND_NOTIFICATION",
  "CHANGE_PRICE",
  "CHANGE_AVAILABILITY",
  "MUTATE_ORDER",
  "ADMIN_PLATFORM_OPERATION",
  "READ_SECRETS",
] as const;
export type AiForbiddenAction = (typeof AI_FORBIDDEN_ACTIONS)[number];

export type AiProviderMode = "LOCAL_DETERMINISTIC" | "EXTERNAL_DISABLED";

export type AiFeatureFlags = {
  readonly enabled: boolean;
  readonly killSwitch: boolean;
  readonly externalProviderEnabled: false;
};

export type AiBudget = {
  readonly maxInputChars: number;
  readonly maxOutputChars: number;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly maxEstimatedTokens: number;
  readonly maxEstimatedCostUsd: string;
};

export const AI_GATE_A_DEFAULT_FLAGS: AiFeatureFlags = {
  enabled: false,
  killSwitch: true,
  externalProviderEnabled: false,
};

export const AI_GATE_A_DEFAULT_BUDGET: AiBudget = {
  maxInputChars: 1_200,
  maxOutputChars: 1_500,
  timeoutMs: 1_500,
  maxRetries: 0,
  maxEstimatedTokens: 800,
  maxEstimatedCostUsd: "0.00",
};

export type AiAuthorizationContext = {
  readonly actorId: string;
  readonly role: AiActorRole;
  readonly locale: AiLocale;
  readonly organizationId?: string;
  readonly allowedUseCases: readonly AiAllowedUseCase[];
  readonly forbiddenActions: readonly AiForbiddenAction[];
  readonly readableResourceScopes: readonly string[];
};

export type AiGroundingCitation = {
  readonly id: string;
  readonly sourceType:
    | "PUBLIC_BUSINESS"
    | "PUBLIC_CATEGORY"
    | "PUBLIC_SERVICE"
    | "PUBLIC_COMMERCE_STORE"
    | "REZNO_POLICY";
  readonly title: string;
  readonly resourceId?: string;
  readonly fieldPath: string;
};

export type AiToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly allowedUseCases: readonly AiAllowedUseCase[];
  readonly sideEffect: "NONE";
  readonly maxResultCount: number;
};

export type AiIntent =
  | "DISCOVERY"
  | "COMPARE_OPTIONS"
  | "SUMMARIZE_PUBLIC_DATA"
  | "UNSUPPORTED_ACTION"
  | "UNSAFE_REQUEST"
  | "UNKNOWN";

export type AiRefusalCode =
  | "FEATURE_DISABLED"
  | "KILL_SWITCH_ACTIVE"
  | "EXTERNAL_PROVIDER_DISABLED"
  | "FORBIDDEN_ACTION"
  | "UNAUTHORIZED_SCOPE"
  | "UNSUPPORTED_DECISION_DOMAIN"
  | "UNSAFE_INPUT"
  | "UNGROUNDED_OUTPUT"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "MALFORMED_PROVIDER_OUTPUT";

export type AiGatewayRequest = {
  readonly requestId: string;
  readonly locale: AiLocale;
  readonly input: string;
  readonly authorization: AiAuthorizationContext;
  readonly requestedUseCase: AiAllowedUseCase;
  readonly flags: AiFeatureFlags;
  readonly budget: AiBudget;
};

export type AiGatewaySuccess = {
  readonly ok: true;
  readonly mode: AiProviderMode;
  readonly intent: AiIntent;
  readonly answer: string;
  readonly citations: readonly AiGroundingCitation[];
  readonly usedTools: readonly string[];
  readonly degraded: boolean;
  readonly policyVersion: typeof AI_GATE_A_POLICY_VERSION;
  readonly promptVersion: typeof AI_GATE_A_PROMPT_VERSION;
};

export type AiGatewayRefusal = {
  readonly ok: false;
  readonly mode: AiProviderMode;
  readonly intent: AiIntent;
  readonly refusalCode: AiRefusalCode;
  readonly safeMessage: Record<AiLocale, string>;
  readonly citations: readonly AiGroundingCitation[];
  readonly usedTools: readonly string[];
  readonly degraded: true;
  readonly policyVersion: typeof AI_GATE_A_POLICY_VERSION;
  readonly promptVersion: typeof AI_GATE_A_PROMPT_VERSION;
};

export type AiGatewayResponse = AiGatewaySuccess | AiGatewayRefusal;

export type AiAuditMetadata = {
  readonly requestId: string;
  readonly actorRole: AiActorRole;
  readonly locale: AiLocale;
  readonly requestedUseCase: AiAllowedUseCase;
  readonly mode: AiProviderMode;
  readonly policyVersion: typeof AI_GATE_A_POLICY_VERSION;
  readonly promptVersion: typeof AI_GATE_A_PROMPT_VERSION;
  readonly evalVersion: typeof AI_GATE_A_EVAL_VERSION;
  readonly inputChars: number;
  readonly outputChars: number;
  readonly estimatedTokens: number;
  readonly estimatedCostUsd: string;
  readonly refusalCode?: AiRefusalCode;
};
