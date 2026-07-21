import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireAuthenticatedMerchantActor } from "@/features/commerce/services/authenticated-context";
import { listBusinessPayments, listBusinessRefunds } from "@/features/payments/services/queries";

export default async function BusinessPaymentsPage({ searchParams }: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const [actor, query] = await Promise.all([requireAuthenticatedMerchantActor(), searchParams]);
  const reference = { contextOrganizationId: actor.organizationId, membershipId: actor.membershipId, personId: actor.personId };
  const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
  const [payments, refunds] = await Promise.all([
    listBusinessPayments(reference, { cursor, limit: 20 }),
    listBusinessRefunds(reference, { limit: 10 }),
  ]);
  return <DashboardShell>
    <DashboardPageHeader title="Payments" description="Captured funds, refunds, and commission snapshots for the active Organization." actions={actor.permissions.includes("SETTLEMENT_VIEW") ? <Button asChild variant="outline"><Link href="/business/payments/settlements">Settlement statements</Link></Button> : null} />
    <section className="space-y-4">
      {payments.items.map((payment) => <Card key={payment.id}>
        <CardHeader className="flex-row items-center justify-between"><CardTitle>{payment.target.kind}</CardTitle><Badge>{payment.status}</Badge></CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3"><p>{payment.amount} {payment.currency} · net {payment.commission.merchantNet} · commission {payment.commission.amount}</p><Button asChild variant="outline"><Link href={`/business/payments/${payment.id}`}>Details</Link></Button></CardContent>
      </Card>)}
      {payments.items.length === 0 ? <p className="text-sm text-muted-foreground">No online payments in this Organization.</p> : null}
      {payments.nextCursor ? <Button asChild variant="outline"><Link href={`/business/payments?cursor=${encodeURIComponent(payments.nextCursor)}`}>Next</Link></Button> : null}
    </section>
    <Card><CardHeader><CardTitle>Recent refunds</CardTitle></CardHeader><CardContent className="space-y-2">{refunds.items.map((refund) => <p key={refund.id}>{refund.amount} {refund.currency} · {refund.status}</p>)}{refunds.items.length === 0 ? <p>No refunds.</p> : null}</CardContent></Card>
  </DashboardShell>;
}
