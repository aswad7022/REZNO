export const STAGE9_GATE9A_BASE_SHA =
  "71e022d6144ac5f508dfabd7432cbf963d5d1693" as const;

export const STAGE9_GATE9A_BRANCH = "feat/stage9-final-integration-baseline" as const;
export const STAGE9_GATE9A_VERSION = "stage9-gate9a-final-integration-baseline-v1" as const;

export const STAGE9_OFFICIAL_STATE = {
  stagesClosed: [1, 2, 3, 4, 5, 6, 7, 8],
  aiGatesClosed: ["A", "B", "C", "D"],
  activeGate: "9A",
  notStarted: ["9B", "9C", "9D"],
  stage6Runtime: "DEFERRED_BY_OWNER — CODE MERGED, RUNTIME NOT ACTIVATED",
  stage7ExternalValidation:
    "DEFERRED_BY_OWNER — CODE MERGED, EXTERNAL VALIDATION NOT COMPLETED",
  stagingProductionAi: "DISABLED",
  protectedPrs: ["#100"],
} as const;

export const GATE9A_CRITICAL_MIGRATION_HASHES = {
  "20260723180000_communications_payment_automation":
    "04fa9fe4a87c7360ec3eb585951ff49c20e90675c74755d1127d716fbf009192",
  "20260724180000_platform_operations_closure":
    "6cd6ec39cc950600002f0b36529ea08460c539b8ced0176f37fbed2980a74f0c",
  "20260726173000_hosted_payment_handoff_action":
    "a16a9c7f2b61c12d35c154e8a4f2f655a568a508118caf46ee88ebe81fbc564d",
  "20260726203000_device_push_notifications":
    "98fe060f7e9c2e1baa1e2a91c40bcad1a39915454f3b9445a55ef82fb86848f0",
} as const;

export const GATE9A_EXPECTED_MIGRATION_COUNT = 51 as const;

export type Gate9ARequirementTiming =
  | "REQUIRED_NOW"
  | "REQUIRED_GATE_9B"
  | "REQUIRED_GATE_9C"
  | "REQUIRED_GATE_9D";

export type Gate9AEnvironmentTarget =
  | "local"
  | "ci"
  | "staging"
  | "production"
  | "mobile-eas";

export type Gate9AEnvironmentVariable = {
  readonly name: string;
  readonly category:
    | "database"
    | "auth"
    | "auth-cursor"
    | "web"
    | "mobile"
    | "gemini"
    | "push"
    | "payments"
    | "storage"
    | "platform-runtime";
  readonly timing: Gate9ARequirementTiming;
  readonly secret: boolean;
  readonly allowedValues?: readonly string[];
  readonly forbidPlaceholderInProduction?: boolean;
  readonly externalRuntime?: boolean;
};

export const GATE9A_ENVIRONMENT_MATRIX: readonly Gate9AEnvironmentVariable[] = [
  { name: "DATABASE_URL", category: "database", timing: "REQUIRED_NOW", secret: true, forbidPlaceholderInProduction: true },
  { name: "BETTER_AUTH_SECRET", category: "auth-cursor", timing: "REQUIRED_NOW", secret: true, forbidPlaceholderInProduction: true },
  { name: "BETTER_AUTH_URL", category: "auth", timing: "REQUIRED_NOW", secret: false },
  { name: "REZNO_AI_ENABLED", category: "gemini", timing: "REQUIRED_GATE_9B", secret: false, allowedValues: ["false", "true"], externalRuntime: true },
  { name: "REZNO_AI_KILL_SWITCH", category: "gemini", timing: "REQUIRED_GATE_9B", secret: false, allowedValues: ["false", "true"], externalRuntime: true },
  { name: "REZNO_AI_GEMINI_ENABLED", category: "gemini", timing: "REQUIRED_GATE_9B", secret: false, allowedValues: ["false", "true"], externalRuntime: true },
  { name: "REZNO_AI_DEPLOYMENT_ENV", category: "gemini", timing: "REQUIRED_GATE_9B", secret: false, allowedValues: ["local", "staging", "production"], externalRuntime: true },
  { name: "GEMINI_API_KEY", category: "gemini", timing: "REQUIRED_GATE_9B", secret: true, forbidPlaceholderInProduction: true, externalRuntime: true },
  { name: "GEMINI_MODEL", category: "gemini", timing: "REQUIRED_GATE_9B", secret: false, externalRuntime: true },
  { name: "REZNO_PUSH_TOKEN_ENCRYPTION_KEY", category: "push", timing: "REQUIRED_GATE_9D", secret: true, forbidPlaceholderInProduction: true, externalRuntime: true },
  { name: "REZNO_PUSH_RECEIPT_HMAC_SECRET", category: "push", timing: "REQUIRED_GATE_9D", secret: true, forbidPlaceholderInProduction: true, externalRuntime: true },
  { name: "REZNO_PUSH_RECEIPT_PROVIDERS", category: "push", timing: "REQUIRED_GATE_9D", secret: false, externalRuntime: true },
  { name: "REZNO_PAYMENT_PROVIDER", category: "payments", timing: "REQUIRED_GATE_9C", secret: false, allowedValues: ["NOT_CONFIGURED", "DETERMINISTIC_TEST"], externalRuntime: true },
  { name: "REZNO_STORAGE_PROVIDER", category: "storage", timing: "REQUIRED_GATE_9C", secret: false, allowedValues: ["NOT_CONFIGURED", "DETERMINISTIC_TEST"], externalRuntime: true },
  { name: "REZNO_PLATFORM_RUNTIME_ENABLED", category: "platform-runtime", timing: "REQUIRED_GATE_9D", secret: false, allowedValues: ["false", "true"], externalRuntime: true },
  { name: "EXPO_PUBLIC_REZNO_API_BASE_URL", category: "mobile", timing: "REQUIRED_GATE_9D", secret: false },
  { name: "NEXT_PUBLIC_APP_URL", category: "web", timing: "REQUIRED_GATE_9C", secret: false },
] as const;

export type Gate9AEnvironmentFindingCode =
  | "MISSING_REQUIRED_NOW"
  | "UNKNOWN_VARIABLE"
  | "INVALID_ALLOWED_VALUE"
  | "INVALID_EMPTY_VALUE"
  | "CONFLICTING_DEPLOYMENT_ENV"
  | "PRODUCTION_PLACEHOLDER"
  | "PRODUCTION_EXTERNAL_RUNTIME_ACTIVE"
  | "PRODUCTION_TEST_PROVIDER"
  | "GATE9A_EXTERNAL_SECRET_PRESENT";

export type Gate9AEnvironmentFinding = {
  readonly code: Gate9AEnvironmentFindingCode;
  readonly name: string;
  readonly timing: Gate9ARequirementTiming | "UNKNOWN";
  readonly severity: "error" | "warning";
  readonly message: string;
};

export type Gate9AEnvironmentValidation = {
  readonly ok: boolean;
  readonly target: Gate9AEnvironmentTarget;
  readonly findings: readonly Gate9AEnvironmentFinding[];
};

const knownVariables = new Map(GATE9A_ENVIRONMENT_MATRIX.map((item) => [item.name, item]));

const recognizedPrefixes = [
  "DATABASE_URL",
  "BETTER_AUTH_",
  "REZNO_",
  "GEMINI_",
  "EXPO_PUBLIC_REZNO_",
  "NEXT_PUBLIC_",
  "VERCEL_",
] as const;

const placeholderPattern =
  /(?:placeholder|changeme|change-me|example|dummy|fake|sample|local-only|test-secret|not-a-production-secret)/i;

export function validateGate9AEnvironment(
  env: Record<string, string | undefined>,
  target: Gate9AEnvironmentTarget,
): Gate9AEnvironmentValidation {
  const findings: Gate9AEnvironmentFinding[] = [];
  const pushFinding = (
    code: Gate9AEnvironmentFindingCode,
    name: string,
    timing: Gate9ARequirementTiming | "UNKNOWN",
    severity: "error" | "warning",
    message: string,
  ) => findings.push({ code, name, timing, severity, message });

  for (const item of GATE9A_ENVIRONMENT_MATRIX) {
    const value = env[item.name];
    const present = value !== undefined;
    if (item.timing === "REQUIRED_NOW" && !present && (target === "ci" || target === "production")) {
      pushFinding(
        "MISSING_REQUIRED_NOW",
        item.name,
        item.timing,
        "error",
        `${item.name} must be configured for ${target}.`,
      );
      continue;
    }
    if (!present) continue;
    if (value.length === 0) {
      pushFinding(
        "INVALID_EMPTY_VALUE",
        item.name,
        item.timing,
        "error",
        `${item.name} is present but empty.`,
      );
      continue;
    }
    if (item.allowedValues && !item.allowedValues.includes(value)) {
      pushFinding(
        "INVALID_ALLOWED_VALUE",
        item.name,
        item.timing,
        "error",
        `${item.name} is not one of the approved values.`,
      );
    }
    if (target === "production" && item.forbidPlaceholderInProduction && placeholderPattern.test(value)) {
      pushFinding(
        "PRODUCTION_PLACEHOLDER",
        item.name,
        item.timing,
        "error",
        `${item.name} must not use a placeholder in production.`,
      );
    }
    if (
      target === "production" &&
      item.category === "payments" &&
      value === "DETERMINISTIC_TEST"
    ) {
      pushFinding(
        "PRODUCTION_TEST_PROVIDER",
        item.name,
        item.timing,
        "error",
        "Production must not use a deterministic test payment provider.",
      );
    }
    if (
      target === "production" &&
      item.category === "storage" &&
      value === "DETERMINISTIC_TEST"
    ) {
      pushFinding(
        "PRODUCTION_TEST_PROVIDER",
        item.name,
        item.timing,
        "error",
        "Production must not use a deterministic test storage provider.",
      );
    }
    if (
      (target === "staging" || target === "production") &&
      item.externalRuntime &&
      item.name === "REZNO_AI_ENABLED" &&
      value === "true"
    ) {
      pushFinding(
        "PRODUCTION_EXTERNAL_RUNTIME_ACTIVE",
        item.name,
        item.timing,
        "error",
        "Gate 9A records staging and production AI as disabled until a later gate authorizes activation.",
      );
    }
    if (
      target === "ci" &&
      item.externalRuntime &&
      item.secret &&
      value.length > 0 &&
      !placeholderPattern.test(value)
    ) {
      pushFinding(
        "GATE9A_EXTERNAL_SECRET_PRESENT",
        item.name,
        item.timing,
        "warning",
        `${item.name} is not required for Gate 9A CI and should not be provided to baseline validation.`,
      );
    }
  }

  const deploymentValues = [
    ["REZNO_AI_DEPLOYMENT_ENV", env.REZNO_AI_DEPLOYMENT_ENV],
    ["REZNO_DEPLOYMENT_ENV", env.REZNO_DEPLOYMENT_ENV],
    ["VERCEL_ENV", env.VERCEL_ENV === "development" ? "local" : env.VERCEL_ENV],
  ] as const;
  const normalized = deploymentValues.flatMap(([name, value]) => {
    if (value === undefined) return [];
    if (value.length === 0) {
      pushFinding(
        "INVALID_EMPTY_VALUE",
        name,
        knownVariables.get(name)?.timing ?? "UNKNOWN",
        "error",
        `${name} is present but empty.`,
      );
      return [];
    }
    if (!["local", "staging", "preview", "production"].includes(value)) {
      pushFinding(
        "INVALID_ALLOWED_VALUE",
        name,
        knownVariables.get(name)?.timing ?? "UNKNOWN",
        "error",
        `${name} is not an approved deployment posture.`,
      );
      return [];
    }
    return [[name, value === "preview" ? "staging" : value] as const];
  });
  const distinctDeploymentPostures = new Set(normalized.map(([, value]) => value));
  if (distinctDeploymentPostures.size > 1) {
    pushFinding(
      "CONFLICTING_DEPLOYMENT_ENV",
      "REZNO_AI_DEPLOYMENT_ENV",
      "REQUIRED_GATE_9B",
      "error",
      "Deployment environment variables disagree; Gate 9A fails closed instead of downgrading production or preview to local.",
    );
  }

  for (const [name, value] of Object.entries(env)) {
    if (
      value !== undefined &&
      recognizedPrefixes.some((prefix) => name === prefix || name.startsWith(prefix)) &&
      !knownVariables.has(name) &&
      name !== "REZNO_DEPLOYMENT_ENV" &&
      name !== "VERCEL_ENV" &&
      name !== "VERCEL_URL"
    ) {
      pushFinding(
        "UNKNOWN_VARIABLE",
        name,
        "UNKNOWN",
        "warning",
        `${name} is not part of the Gate 9A release environment matrix.`,
      );
    }
  }

  return {
    ok: findings.every((finding) => finding.severity !== "error"),
    target,
    findings,
  };
}

export type Gate9AInventoryItem = {
  readonly id: string;
  readonly stage: string;
  readonly domain: string;
  readonly surfaces: readonly string[];
  readonly routes: readonly string[];
  readonly mobileEntryPoints: readonly string[];
  readonly tests: readonly string[];
  readonly evidence: readonly string[];
  readonly gate9aCoverage: "direct-postgres" | "contract" | "inherited";
};

export const GATE9A_RELEASE_INVENTORY = [
  {
    id: "identity-customer-business-admin-auth",
    stage: "1",
    domain: "Identity, onboarding, RBAC, admin access",
    surfaces: ["Customer Web", "Business Web", "Admin Web", "Mobile"],
    routes: ["/onboarding", "/onboarding/business", "/select-business", "/admin/access"],
    mobileEntryPoints: ["apps/mobile/src/api/onboarding.ts", "apps/mobile/src/onboarding/startup-state.ts"],
    tests: [
      "tests/identity/unit/*.test.ts",
      "tests/identity/integration/identity-permission-baseline.test.ts",
      "tests/identity/http/*.test.ts",
    ],
    evidence: ["Gate 9A fixture creates active Customer, Owner, Admin identities with isolated memberships."],
    gate9aCoverage: "direct-postgres",
  },
  {
    id: "business-operations-booking-catalog",
    stage: "2",
    domain: "Business operations, services, branches, hours, bookings",
    surfaces: ["Customer Web", "Business Web", "Admin Web", "Mobile"],
    routes: ["/marketplace", "/book/[offeringId]", "/business/bookings", "/admin/bookings"],
    mobileEntryPoints: ["apps/mobile/src/api/bookings.ts", "apps/mobile/src/bookings/state.ts"],
    tests: [
      "tests/business-operations/**/*.test.ts",
      "tests/bookings/**/*.test.ts",
    ],
    evidence: ["Gate 9A fixture publishes branch/service/hours and creates one customer booking."],
    gate9aCoverage: "direct-postgres",
  },
  {
    id: "restaurant-reservations",
    stage: "2",
    domain: "Restaurant tables, menu, and reservation details",
    surfaces: ["Customer Web", "Business Web", "Admin Web", "Mobile"],
    routes: ["/[slug]/reserve", "/business/reservations", "/business/tables", "/admin/restaurants"],
    mobileEntryPoints: [
      "apps/mobile/src/api/restaurant-reservations.ts",
      "apps/mobile/src/restaurant-reservations/state.ts",
    ],
    tests: ["tests/restaurants/**/*.test.ts"],
    evidence: ["Gate 9A fixture links a reservation detail and menu item to the same booking."],
    gate9aCoverage: "direct-postgres",
  },
  {
    id: "commerce-store-product-order-payment",
    stage: "3/5",
    domain: "Commerce, cart, checkout, order, deterministic payment lifecycle",
    surfaces: ["Customer Web", "Business Web", "Admin Web", "Mobile"],
    routes: [
      "/business/commerce",
      "/business/commerce/store",
      "/business/commerce/products",
      "/business/commerce/orders",
      "/admin/commerce",
      "/customer/payments",
    ],
    mobileEntryPoints: ["apps/mobile/src/api/commerce.ts", "apps/mobile/src/api/payments.ts"],
    tests: ["tests/commerce/**/*.test.ts", "tests/payments/**/*.test.ts"],
    evidence: ["Gate 9A fixture publishes Store/Product/Variant/Inventory/Cart/Order and DETERMINISTIC_TEST PaymentIntent."],
    gate9aCoverage: "direct-postgres",
  },
  {
    id: "communications-notifications-messages",
    stage: "4",
    domain: "Notifications, messages, admin communications",
    surfaces: ["Customer Web", "Business Web", "Admin Web", "Mobile"],
    routes: ["/customer/notifications", "/customer/messages", "/business/messages", "/admin/communications"],
    mobileEntryPoints: ["apps/mobile/src/api/notifications.ts", "apps/mobile/src/api/messages.ts"],
    tests: [
      "tests/notifications/**/*.test.ts",
      "tests/messages/**/*.test.ts",
      "tests/communications/**/*.test.ts",
    ],
    evidence: ["Gate 9A fixture creates authorized Notification, recipient state, Conversation, Message, and read state."],
    gate9aCoverage: "direct-postgres",
  },
  {
    id: "storage-media-upload-recovery",
    stage: "5/6/7",
    domain: "Managed storage, media lifecycle, mobile upload/recovery",
    surfaces: ["Customer Web", "Business Web", "Admin Web", "Mobile"],
    routes: ["/media/[assetId]", "/business/profile", "/business/commerce/products"],
    mobileEntryPoints: [
      "apps/mobile/src/components/customer-avatar-manager.tsx",
      "apps/mobile/src/media/upload-engine.ts",
      "apps/mobile/src/media/upload-coordinator.ts",
    ],
    tests: ["tests/storage/**/*.test.ts", "tests/media/**/*.test.ts", "tests/mobile/unit/gate7b-*.test.ts"],
    evidence: ["Gate 9A fixture binds a READY deterministic media asset to a product media container."],
    gate9aCoverage: "direct-postgres",
  },
  {
    id: "platform-jobs-operations-runtime-deferred",
    stage: "6",
    domain: "Durable platform jobs and operations without runtime activation",
    surfaces: ["Admin Web"],
    routes: ["/admin/platform-jobs", "/admin/platform-operations"],
    mobileEntryPoints: [],
    tests: ["tests/platform-jobs/**/*.test.ts"],
    evidence: ["Gate 9A fixture records an AVAILABLE job while Stage 6 runtime remains disabled by policy."],
    gate9aCoverage: "direct-postgres",
  },
  {
    id: "stage8-visual-localization-accessibility",
    stage: "8",
    domain: "Brand, responsive layout, RTL/LTR, visual evidence, accessibility",
    surfaces: ["Public Web", "Customer Web", "Business Web", "Admin Web", "Mobile"],
    routes: ["/", "/admin", "/business", "/customer"],
    mobileEntryPoints: ["apps/mobile/src/theme/tokens.ts", "apps/mobile/src/components/mobile-chrome.tsx"],
    tests: ["tests/design-system/unit/gate8*.test.ts"],
    evidence: ["Gate 9A inherits reviewed Stage 8 baselines and checks ar/en/ckb route coverage in inventory."],
    gate9aCoverage: "contract",
  },
  {
    id: "ai-customer-discovery-disabled-production",
    stage: "AI A-D",
    domain: "AI foundation, grounded customer discovery, provider control plane, closure",
    surfaces: ["Customer Web", "Mobile coming-soon"],
    routes: ["/customer/assistant", "/api/ai/customer/discovery"],
    mobileEntryPoints: ["apps/mobile/src/screens/rezno-ai-coming-soon-screen.tsx"],
    tests: ["tests/ai/unit/gate-*.test.ts"],
    evidence: ["Gate 9A fixture verifies disabled AI refusal path has providerRequestCount=0."],
    gate9aCoverage: "direct-postgres",
  },
] as const satisfies readonly Gate9AInventoryItem[];

export const GATE9A_DEFERRED_EXTERNAL_WORK = [
  {
    id: "stage6-runtime-activation",
    status: "DEFERRED_BY_OWNER",
    targetGate: "9D",
    reason: "Stage 6 code is merged but scheduled runtime activation, credential rotation, and external health probes remain owner-deferred.",
  },
  {
    id: "stage7-physical-provider-validation",
    status: "DEFERRED_BY_OWNER",
    targetGate: "9D",
    reason: "Physical device, store, APNs/FCM, and app-store validation were explicitly deferred and are not claimed by Gate 9A.",
  },
  {
    id: "production-ai-activation",
    status: "DISABLED",
    targetGate: "9B/9C/9D",
    reason: "AI Gates A-D closed code and tests, but staging/production provider activation and secrets remain disabled.",
  },
  {
    id: "pr-100-protected-stage7-reference",
    status: "OUT_OF_SCOPE",
    targetGate: "none",
    reason: "PR #100 remains a protected draft reference and is not modified by Stage 9.",
  },
] as const;

export type Gate9APerformanceSnapshot = {
  readonly marketplaceLimit: number;
  readonly adminPageLimit: number;
  readonly bookingAvailabilityDays: number;
  readonly aiProviderConcurrencyLimit: number;
  readonly httpBodyBytes: number;
  readonly mediaUploadBytes: number;
  readonly nextRouteCount: number;
  readonly mobileExpoModuleCount: number;
};

export const GATE9A_PERFORMANCE_BUDGETS = {
  marketplaceLimit: 50,
  adminPageLimit: 100,
  bookingAvailabilityDays: 31,
  aiProviderConcurrencyLimit: 2,
  httpBodyBytes: 4096,
  mediaUploadBytes: 10 * 1024 * 1024,
  nextRouteCount: 320,
  mobileExpoModuleCount: 1_200,
} as const satisfies Gate9APerformanceSnapshot;

export function evaluateGate9APerformanceSnapshot(
  snapshot: Gate9APerformanceSnapshot,
) {
  return (Object.keys(GATE9A_PERFORMANCE_BUDGETS) as Array<keyof Gate9APerformanceSnapshot>)
    .flatMap((key) => {
      const budget = GATE9A_PERFORMANCE_BUDGETS[key];
      const actual = snapshot[key];
      if (actual <= budget) return [];
      return [{
        actual,
        budget,
        key,
        message: `${key} exceeded Gate 9A budget (${actual} > ${budget}).`,
      }];
    });
}

export function findGate9AInventoryGaps(
  implementedRoutes: readonly string[],
  mobileEntryPoints: readonly string[],
) {
  const routeSet = new Set(implementedRoutes);
  const mobileSet = new Set(mobileEntryPoints);
  return GATE9A_RELEASE_INVENTORY.flatMap((item) => [
    ...item.routes
      .filter((route) => !routeSet.has(route))
      .map((route) => ({ id: item.id, kind: "route" as const, value: route })),
    ...item.mobileEntryPoints
      .filter((entry) => !mobileSet.has(entry))
      .map((entry) => ({ id: item.id, kind: "mobile" as const, value: entry })),
  ]);
}

export function gate9ARequiresNoExternalSecrets(env: Record<string, string | undefined>) {
  return GATE9A_ENVIRONMENT_MATRIX
    .filter((item) => item.externalRuntime && item.secret && env[item.name])
    .map((item) => item.name);
}
