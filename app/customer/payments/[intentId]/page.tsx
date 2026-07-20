import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireCustomerIdentity } from "@/features/identity/server";
import { PaymentDomainError } from "@/features/payments/domain/errors";
import { getCustomerPaymentIntent } from "@/features/payments/services/payment-intents";

export default async function CustomerPaymentDetailPage({ params }: { params: Promise<{ intentId: string }> }) {
  const [{ person }, { intentId }] = await Promise.all([requireCustomerIdentity(), params]);
  let payment: Awaited<ReturnType<typeof getCustomerPaymentIntent>>;
  try { payment = await getCustomerPaymentIntent(person.id, intentId); }
  catch (error) { if (error instanceof PaymentDomainError && error.code === "NOT_FOUND") notFound(); throw error; }
  return <DashboardShell>
    <DashboardPageHeader title="Payment status" description="The state below comes from the server and verified provider events." actions={<Button asChild variant="outline"><Link href="/customer/payments">All payments</Link></Button>} />
    <Card>
      <CardHeader className="flex-row items-center justify-between"><CardTitle>{payment.target.kind}</CardTitle><Badge>{payment.status}</Badge></CardHeader>
      <CardContent className="space-y-3">
        <p>Total {payment.amount} {payment.currency}</p>
        <p>Captured {payment.capturedAmount} · Refunded {payment.refundedAmount} · Refundable {payment.refundableAmount}</p>
        {payment.action ? <div className="rounded-lg border p-3"><p className="font-medium">Provider action required</p><p className="text-sm text-muted-foreground">Use only the payment provider flow opened by the application. This page never marks a payment paid from a redirect.</p><p className="text-xs">Expires {payment.action.expiresAt}</p></div> : null}
        <div><p className="font-medium">Attempts</p>{payment.attempts.map((attempt) => <p className="text-sm" key={attempt.id}>#{attempt.number} · {attempt.status} · {attempt.createdAt}</p>)}</div>
        <div><p className="font-medium">Refunds</p>{payment.refunds.map((refund) => <p className="text-sm" key={refund.id}>{refund.amount} {refund.currency} · {refund.status}</p>)}</div>
      </CardContent>
    </Card>
  </DashboardShell>;
}
