import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireAuthenticatedMerchantActor } from "@/features/commerce/services/authenticated-context";
import { listBusinessJournals } from "@/features/payments/services/journal-queries";
import { listBusinessSettlements } from "@/features/payments/services/settlements";

export default async function BusinessSettlementsPage({ searchParams }: { searchParams: Promise<{ cursor?: string | string[] }> }) {
  const [actor, query] = await Promise.all([requireAuthenticatedMerchantActor(), searchParams]);
  const reference = { contextOrganizationId: actor.organizationId, membershipId: actor.membershipId, personId: actor.personId };
  const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
  const [page, journals] = await Promise.all([listBusinessSettlements(reference, { cursor, limit: 20 }), listBusinessJournals(reference, { limit: 10 })]);
  return <DashboardShell><DashboardPageHeader title="Settlement statements" description="Finalized ledger calculation snapshots; these do not mean a bank payout occurred." actions={<Button asChild variant="outline"><Link href="/business/payments">Payments</Link></Button>} />
    {page.items.map((batch) => <Card key={batch.id}><CardHeader className="flex-row items-center justify-between"><CardTitle>{batch.periodStart.slice(0, 10)} – {batch.periodEnd.slice(0, 10)}</CardTitle><Badge>{batch.status}</Badge></CardHeader><CardContent><p>Gross {batch.captureGross} · Refunds {batch.refunds} · Commission {batch.commission} · Merchant net {batch.merchantNet} {batch.currency}</p><p className="text-sm text-muted-foreground">Ledger statement — not bank payout confirmation.</p></CardContent></Card>)}
    {page.items.length === 0 ? <p>No finalized statements.</p> : null}
    {page.nextCursor ? <Button asChild variant="outline"><Link href={`/business/payments/settlements?cursor=${encodeURIComponent(page.nextCursor)}`}>Next</Link></Button> : null}
    <Card><CardHeader><CardTitle>Recent ledger Journals</CardTitle></CardHeader><CardContent>{journals.items.map((journal) => <p key={journal.id}>{journal.source} · {journal.debitTotal}/{journal.creditTotal} {journal.currency} · {journal.status}</p>)}</CardContent></Card>
  </DashboardShell>;
}
