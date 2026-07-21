import { randomUUID } from "node:crypto";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";
import { finalizeSettlementAction, previewSettlementAction } from "@/features/payments/actions/payments";
import { listAdminJournals } from "@/features/payments/services/journal-queries";
import { listAdminSettlements } from "@/features/payments/services/settlements";

export default async function AdminSettlementsPage({ searchParams }: { searchParams: Promise<{ cursor?: string | string[]; organizationId?: string | string[] }> }) {
  const [context, query] = await Promise.all([requireAuthenticatedCommerceAdmin("SETTLEMENTS_VIEW"), searchParams]);
  const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
  const organizationId = typeof query.organizationId === "string" ? query.organizationId : undefined;
  const [page, journals] = await Promise.all([listAdminSettlements(context, { cursor, limit: 20, organizationId }), listAdminJournals(context, { limit: 10, organizationId })]);
  const canManage = context.isSuperAdmin || context.permissions.includes("SETTLEMENTS_MANAGE");
  return <><AdminPageHeader title="Settlement statements" description="Manual ledger calculations only. FINALIZED never means bank payout." /><Button asChild className="mb-4" variant="outline"><Link href="/admin/payments">Payments</Link></Button>
    {canManage ? <Card className="mb-6"><CardHeader><CardTitle>Preview statement</CardTitle></CardHeader><CardContent><form action={previewSettlementAction} className="grid gap-3 md:grid-cols-2"><input name="idempotencyKey" type="hidden" value={randomUUID()} /><Input defaultValue={organizationId} name="organizationId" placeholder="Organization UUID" required /><Input name="periodStart" placeholder="2026-07-01T00:00:00Z" required /><Input name="periodEnd" placeholder="2026-08-01T00:00:00Z" required /><Button className="w-fit" type="submit">Create draft preview</Button></form></CardContent></Card> : null}
    <div className="space-y-4">{page.items.map((batch) => <Card key={batch.id}><CardHeader className="flex-row items-center justify-between"><CardTitle>{batch.periodStart.slice(0, 10)} – {batch.periodEnd.slice(0, 10)}</CardTitle><Badge>{batch.status}</Badge></CardHeader><CardContent className="space-y-2"><p>Gross {batch.captureGross} · refunds {batch.refunds} · commission {batch.commission} · merchant net {batch.merchantNet} {batch.currency}</p><p className="text-sm text-muted-foreground">{batch.meaning}</p>{canManage && batch.status === "DRAFT" ? <form action={finalizeSettlementAction}><input name="batchId" type="hidden" value={batch.id} /><input name="expectedVersion" type="hidden" value={batch.version} /><input name="idempotencyKey" type="hidden" value={randomUUID()} /><Button type="submit">Finalize immutable calculation</Button></form> : null}</CardContent></Card>)}</div>
    {page.nextCursor ? <Button asChild className="mt-4" variant="outline"><Link href={`/admin/payments/settlements?cursor=${encodeURIComponent(page.nextCursor)}${organizationId ? `&organizationId=${organizationId}` : ""}`}>Next</Link></Button> : null}
    <Card className="mt-6"><CardHeader><CardTitle>Recent Journals</CardTitle></CardHeader><CardContent>{journals.items.map((journal) => <p key={journal.id}>{journal.source} · {journal.debitTotal}/{journal.creditTotal} {journal.currency} · {journal.balanced ? "balanced" : "mismatch"}</p>)}</CardContent></Card>
  </>;
}
