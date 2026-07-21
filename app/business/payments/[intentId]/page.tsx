import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireAuthenticatedMerchantActor } from "@/features/commerce/services/authenticated-context";
import { requestBusinessRefundAction } from "@/features/payments/actions/payments";
import { PaymentDomainError } from "@/features/payments/domain/errors";
import { getBusinessPayment } from "@/features/payments/services/queries";

export default async function BusinessPaymentDetailPage({ params }: { params: Promise<{ intentId: string }> }) {
  const [actor, { intentId }] = await Promise.all([requireAuthenticatedMerchantActor(), params]);
  let payment: Awaited<ReturnType<typeof getBusinessPayment>>;
  try { payment = await getBusinessPayment({ contextOrganizationId: actor.organizationId, membershipId: actor.membershipId, personId: actor.personId }, intentId); }
  catch (error) { if (error instanceof PaymentDomainError && error.code === "NOT_FOUND") notFound(); throw error; }
  return <DashboardShell>
    <DashboardPageHeader title="Payment detail" description="Provider-safe state and immutable accounting snapshot." actions={<Button asChild variant="outline"><Link href="/business/payments">Back</Link></Button>} />
    <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>{payment.target.kind}</CardTitle><Badge>{payment.status}</Badge></CardHeader><CardContent className="space-y-2"><p>Total {payment.amount} {payment.currency}</p><p>Captured {payment.capturedAmount} · Refunded {payment.refundedAmount} · Refundable {payment.refundableAmount}</p><p>Merchant net {payment.commission.merchantNet} · Commission {payment.commission.amount} ({payment.commission.basisPoints} bps, {payment.commission.policyId})</p>{payment.attempts.map((attempt) => <p key={attempt.id}>Attempt #{attempt.number} · {attempt.status}</p>)}</CardContent></Card>
    {actor.permissions.includes("PAYMENT_REFUND") && payment.refundableAmount !== "0.000" ? <Card><CardHeader><CardTitle>Request refund</CardTitle></CardHeader><CardContent><form action={requestBusinessRefundAction} className="grid gap-3 md:grid-cols-2"><input name="paymentIntentId" type="hidden" value={payment.id} /><input name="expectedVersion" type="hidden" value={payment.version} /><input name="idempotencyKey" type="hidden" value={randomUUID()} /><Input name="amount" inputMode="decimal" placeholder="Amount, e.g. 1000.000" required /><select className="rounded-md border bg-background px-3" defaultValue="CUSTOMER_REQUEST" name="reasonCode"><option value="CUSTOMER_REQUEST">Customer request</option><option value="MERCHANT_CANCELLATION">Merchant cancellation</option><option value="SERVICE_UNAVAILABLE">Service unavailable</option><option value="OTHER">Other</option></select><Input maxLength={500} name="note" placeholder="Optional bounded note" /><Button className="w-fit" type="submit">Request refund</Button></form></CardContent></Card> : null}
  </DashboardShell>;
}
