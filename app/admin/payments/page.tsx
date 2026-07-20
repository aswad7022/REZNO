import { randomUUID } from "node:crypto";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";
import { runReconciliationAction } from "@/features/payments/actions/payments";
import { listAdminPayments, listAdminRefunds } from "@/features/payments/services/queries";

export default async function AdminPaymentsPage({ searchParams }: {
  searchParams: Promise<{ cursor?: string | string[]; organizationId?: string | string[] }>;
}) {
  const [context, query] = await Promise.all([requireAuthenticatedCommerceAdmin("PAYMENTS_VIEW"), searchParams]);
  const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
  const organizationId = typeof query.organizationId === "string" ? query.organizationId : undefined;
  const [payments, refunds] = await Promise.all([
    listAdminPayments(context, { cursor, limit: 20, organizationId }),
    listAdminRefunds(context, { limit: 10, organizationId }),
  ]);
  return <>
    <AdminPageHeader title="Payments" description="Provider-safe operational records and financial-integrity controls." />
    <div className="mb-6 flex flex-wrap gap-2">{(context.isSuperAdmin || context.permissions.includes("SETTLEMENTS_VIEW")) ? <Button asChild variant="outline"><Link href="/admin/payments/settlements">Settlement statements</Link></Button> : null}</div>
    {(context.isSuperAdmin || context.permissions.includes("PAYMENTS_RECONCILE")) ? <Card className="mb-6"><CardHeader><CardTitle>Manual reconciliation</CardTitle></CardHeader><CardContent><form action={runReconciliationAction} className="grid gap-3 md:grid-cols-3"><input name="idempotencyKey" type="hidden" value={randomUUID()} /><Input defaultValue={organizationId} name="organizationId" placeholder="Optional Organization UUID" /><Input name="paymentIntentId" placeholder="Optional PaymentIntent UUID" /><Button className="w-fit" type="submit">Run bounded reconciliation</Button></form></CardContent></Card> : null}
    <section className="space-y-4">{payments.items.map((payment) => <Card key={payment.id}><CardHeader className="flex-row items-center justify-between"><CardTitle>{payment.target.kind}</CardTitle><Badge>{payment.status}</Badge></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-3"><p>{payment.amount} {payment.currency} · captured {payment.capturedAmount} · refunded {payment.refundedAmount}</p><Button asChild variant="outline"><Link href={`/admin/payments/${payment.id}`}>Details</Link></Button></CardContent></Card>)}{payments.items.length === 0 ? <p>No payments matched this scope.</p> : null}</section>
    {payments.nextCursor ? <Button asChild className="mt-4" variant="outline"><Link href={`/admin/payments?cursor=${encodeURIComponent(payments.nextCursor)}${organizationId ? `&organizationId=${organizationId}` : ""}`}>Next</Link></Button> : null}
    <Card className="mt-6"><CardHeader><CardTitle>Recent refunds</CardTitle></CardHeader><CardContent>{refunds.items.map((refund) => <p key={refund.id}>{refund.amount} {refund.currency} · {refund.status}</p>)}</CardContent></Card>
  </>;
}
