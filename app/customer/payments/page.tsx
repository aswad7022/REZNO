import { CreditCard, ExternalLink } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import {
  CustomerState,
  CustomerStatusBadge,
} from "@/components/customer/customer-state";
import { customerPaymentTone } from "@/components/customer/customer-payment-status";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireCustomerIdentity } from "@/features/identity/server";
import { listCustomerPayments } from "@/features/payments/services/queries";

export default async function CustomerPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const [{ person }, query, t] = await Promise.all([
    requireCustomerIdentity(),
    searchParams,
    getTranslations("CustomerPayments"),
  ]);
  const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
  const page = await listCustomerPayments(person.id, { cursor, limit: 20 });

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("title")}
        description={t("description")}
      />
      {page.items.length === 0 ? (
        <CustomerState
          action={
            <Button asChild variant="outline">
              <Link href="/marketplace">{t("explore")}</Link>
            </Button>
          }
          description={t("emptyDescription")}
          title={t("emptyTitle")}
          tone="empty"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {page.items.map((payment) => (
            <Card
              className="rezno-card-hover border-primary/10 bg-card/95"
              key={payment.id}
            >
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <CreditCard aria-hidden="true" className="size-5" />
                  </span>
                  <CardTitle className="truncate">
                    {t(`target.${payment.target.kind}`)}
                  </CardTitle>
                </div>
                <CustomerStatusBadge tone={customerPaymentTone(payment.status)}>
                  {t(`status.${payment.status}`)}
                </CustomerStatusBadge>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/60 p-4 text-sm">
                  <PaymentAmount
                    label={t("total")}
                    value={`${payment.amount} ${payment.currency}`}
                  />
                  <PaymentAmount
                    label={t("captured")}
                    value={`${payment.capturedAmount} ${payment.currency}`}
                  />
                  <PaymentAmount
                    label={t("refunded")}
                    value={`${payment.refundedAmount} ${payment.currency}`}
                  />
                </div>
                <Button asChild className="w-full" variant="outline">
                  <Link href={`/customer/payments/${payment.id}`}>
                    {t("viewPayment")}
                    <ExternalLink aria-hidden="true" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {page.nextCursor ? (
        <Button asChild variant="outline">
          <Link
            href={`/customer/payments?cursor=${encodeURIComponent(page.nextCursor)}`}
          >
            {t("next")}
          </Link>
        </Button>
      ) : null}
    </DashboardShell>
  );
}

function PaymentAmount({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-semibold" dir="ltr">
        {value}
      </p>
    </div>
  );
}
