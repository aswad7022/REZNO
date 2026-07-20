import { paymentId } from "../../features/payments/api/validation";
import { resolveAdminGrant } from "../../features/admin/policies/admin-authorization";
import { runPaymentReconciliation } from "../../features/payments/services/reconciliation";
import { prisma } from "../../lib/db/prisma";

const CONFIRMATION = "REZNO_PAYMENT_RECONCILIATION_MANUAL";

async function main() {
  if (process.env.REZNO_PAYMENT_RECONCILIATION_CONFIRM !== CONFIRMATION) {
    throw new Error("Manual payment reconciliation requires the exact confirmation marker.");
  }
  const args = parseArgs(process.argv.slice(2));
  const access = await prisma.adminAccess.findFirst({
    where: { status: "ACTIVE", userId: args.adminUserId },
  });
  const [grant, person] = await Promise.all([
    Promise.resolve(resolveAdminGrant({ databaseAccess: access, envSuperAdmin: false })),
    prisma.person.findFirst({ where: { authUserId: args.adminUserId, deletedAt: null, status: "ACTIVE" } }),
  ]);
  if (!access || !grant || !person || !grant.permissions.includes("PAYMENTS_RECONCILE")) {
    throw new Error("An active AdminAccess grant with PAYMENTS_RECONCILE is required.");
  }
  const result = await runPaymentReconciliation({
    adminAccessId: access.id,
    isSuperAdmin: grant.isSuperAdmin,
    personId: person.id,
    permissions: grant.permissions,
    source: "database",
    userId: access.userId,
  }, {
    idempotencyKey: args.idempotencyKey,
    limit: args.limit,
    organizationId: args.organizationId,
    paymentIntentId: args.paymentIntentId,
  });
  console.log(JSON.stringify(result));
}

function parseArgs(values: string[]) {
  const allowed = new Set(["--admin-user-id", "--idempotency-key", "--limit", "--organization-id", "--payment-intent-id"]);
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key || !value || !allowed.has(key) || parsed.has(key)) throw new Error("Reconciliation arguments are invalid.");
    parsed.set(key, value);
  }
  const adminUserId = parsed.get("--admin-user-id")?.trim() ?? "";
  if (!adminUserId || adminUserId.length > 191) throw new Error("--admin-user-id is required.");
  const idempotencyKey = paymentId(parsed.get("--idempotency-key") ?? "", "idempotencyKey");
  const limitValue = parsed.get("--limit");
  const limit = limitValue === undefined ? 25 : Number(limitValue);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error("--limit must be between 1 and 50.");
  const organization = parsed.get("--organization-id");
  const intent = parsed.get("--payment-intent-id");
  return {
    adminUserId,
    idempotencyKey,
    limit,
    organizationId: organization ? paymentId(organization, "organizationId") : undefined,
    paymentIntentId: intent ? paymentId(intent, "paymentIntentId") : undefined,
  };
}

main().finally(() => prisma.$disconnect());
