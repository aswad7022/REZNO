import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";
import { requestAdminRefundAction } from "@/features/payments/actions/payments";
import { PaymentDomainError } from "@/features/payments/domain/errors";
import { getAdminPayment } from "@/features/payments/services/queries";

export default async function AdminPaymentDetailPage({ params }: { params: Promise<{ intentId: string }> }) {
  const [context, { intentId }] = await Promise.all([requireAuthenticatedCommerceAdmin("PAYMENTS_VIEW"), params]);
  let payment: Awaited<ReturnType<typeof getAdminPayment>>;
  try { payment = await getAdminPayment(context, intentId); }
  catch (error) { if (error instanceof PaymentDomainError && error.code === "NOT_FOUND") notFound(); throw error; }
  const canRefund = context.isSuperAdmin || context.permissions.includes("PAYMENTS_REFUND");
  return <><AdminPageHeader title="Payment detail" description="Safe provider state, attempts, refunds, and snapshotted commission." /><Button asChild className="mb-4" variant="outline"><Link href="/admin/payments">Back</Link></Button>
    <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>{payment.target.kind}</CardTitle><Badge>{payment.status}</Badge></CardHeader><CardContent className="space-y-2"><p>{payment.amount} {payment.currency} · captured {payment.capturedAmount} · refunded {payment.refundedAmount}</p><p>Merchant net {payment.commission.merchantNet} · commission {payment.commission.amount} · {payment.commission.policyId}</p>{payment.attempts.map((attempt) => <p key={attempt.id}>Attempt #{attempt.number} · {attempt.status} · {attempt.safeCode ?? "no safe code"}</p>)}</CardContent></Card>
    {canRefund && payment.refundableAmount !== "0.000" ? <Card className="mt-6"><CardHeader><CardTitle>Admin refund</CardTitle></CardHeader><CardContent><form action={requestAdminRefundAction} className="grid gap-3 md:grid-cols-2"><input name="paymentIntentId" type="hidden" value={payment.id} /><input name="expectedVersion" type="hidden" value={payment.version} /><input name="idempotencyKey" type="hidden" value={randomUUID()} /><Input name="amount" inputMode="decimal" placeholder="Amount" required /><select className="rounded-md border bg-background px-3" defaultValue="ADMIN_CORRECTION" name="reasonCode"><option value="ADMIN_CORRECTION">Admin correction</option><option value="DUPLICATE_PAYMENT">Duplicate payment</option><option value="CUSTOMER_REQUEST">Customer request</option><option value="OTHER">Other</option></select><Input maxLength={500} name="note" placeholder="Bounded reason note" /><Button className="w-fit" type="submit">Request refund</Button></form></CardContent></Card> : null}
  </>;
}
