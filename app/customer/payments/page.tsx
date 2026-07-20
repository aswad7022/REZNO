import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireCustomerIdentity } from "@/features/identity/server";
import { listCustomerPayments } from "@/features/payments/services/queries";

export default async function CustomerPaymentsPage({ searchParams }: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const [{ person }, query] = await Promise.all([requireCustomerIdentity(), searchParams]);
  const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
  const page = await listCustomerPayments(person.id, { cursor, limit: 20 });
  return <DashboardShell>
    <DashboardPageHeader title="Payments" description="Server-verified payment, capture, and refund state." />
    <div className="space-y-4">
      {page.items.map((payment) => <Card key={payment.id}>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>{payment.target.kind}</CardTitle><Badge>{payment.status}</Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p>{payment.amount} {payment.currency} · captured {payment.capturedAmount} · refunded {payment.refundedAmount}</p>
          <Button asChild variant="outline"><Link href={`/customer/payments/${payment.id}`}>View payment</Link></Button>
        </CardContent>
      </Card>)}
      {page.items.length === 0 ? <p className="text-sm text-muted-foreground">No online payments yet.</p> : null}
    </div>
    {page.nextCursor ? <Button asChild variant="outline"><Link href={`/customer/payments?cursor=${encodeURIComponent(page.nextCursor)}`}>Next</Link></Button> : null}
  </DashboardShell>;
}
