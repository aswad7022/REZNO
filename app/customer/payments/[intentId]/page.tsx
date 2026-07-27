import { ArrowLeft, ExternalLink, ReceiptText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { CustomerStatusBadge } from "@/components/customer/customer-state";
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
import { PaymentDomainError } from "@/features/payments/domain/errors";
import { getCustomerPaymentIntent } from "@/features/payments/services/payment-intents";

export default async function CustomerPaymentDetailPage({
  params,
}: {
  params: Promise<{ intentId: string }>;
}) {
  const [{ person }, { intentId }, t, format] = await Promise.all([
    requireCustomerIdentity(),
    params,
    getTranslations("CustomerPayments"),
    getFormatter(),
  ]);
  let payment: Awaited<ReturnType<typeof getCustomerPaymentIntent>>;
  try {
    payment = await getCustomerPaymentIntent(person.id, intentId);
  } catch (error) {
    if (error instanceof PaymentDomainError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <DashboardShell>
      <DashboardPageHeader
        actions={
          <Button asChild variant="outline">
            <Link href="/customer/payments">
              <ArrowLeft
                aria-hidden="true"
                className="rtl:rotate-180"
              />
              {t("allPayments")}
            </Link>
          </Button>
        }
        title={t("detailTitle")}
        description={t("detailDescription")}
      />
      <Card className="overflow-hidden border-primary/10">
        <CardHeader className="flex-row items-start justify-between gap-3 border-b bg-muted/35">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              <ReceiptText aria-hidden="true" className="size-5" />
            </span>
            <CardTitle>{t(`target.${payment.target.kind}`)}</CardTitle>
          </div>
          <CustomerStatusBadge tone={customerPaymentTone(payment.status)}>
            {t(`status.${payment.status}`)}
          </CustomerStatusBadge>
        </CardHeader>
        <CardContent className="space-y-6 p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AmountCard
              label={t("total")}
              value={`${payment.amount} ${payment.currency}`}
            />
            <AmountCard
              label={t("captured")}
              value={`${payment.capturedAmount} ${payment.currency}`}
            />
            <AmountCard
              label={t("refunded")}
              value={`${payment.refundedAmount} ${payment.currency}`}
            />
            <AmountCard
              label={t("refundable")}
              value={`${payment.refundableAmount} ${payment.currency}`}
            />
          </div>
          {payment.action ? (
            <section className="rezno-status-warning rounded-2xl border p-4">
              <h2 className="font-bold">{t("providerActionTitle")}</h2>
              <p className="mt-1 text-sm leading-6">
                {t("providerActionDescription")}
              </p>
              <p className="mt-2 text-xs" dir="ltr">
                {t("expires", {
                  value: format.dateTime(new Date(payment.action.expiresAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                })}
              </p>
            </section>
          ) : null}
          <div className="grid gap-5 lg:grid-cols-2">
            <PaymentHistory
              empty={t("noAttempts")}
              title={t("attempts")}
              rows={payment.attempts.map((attempt) => ({
                id: attempt.id,
                label: t("attempt", { number: attempt.number }),
                meta: attempt.createdAt,
                status: t(`attemptStatus.${attempt.status}`),
              }))}
            />
            <PaymentHistory
              empty={t("noRefunds")}
              title={t("refunds")}
              rows={payment.refunds.map((refund) => ({
                id: refund.id,
                label: `${refund.amount} ${refund.currency}`,
                status: t(`refundStatus.${refund.status}`),
              }))}
            />
          </div>
        </CardContent>
      </Card>
      <p className="flex items-center gap-2 text-xs leading-6 text-muted-foreground">
        <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
        {t("providerActionDescription")}
      </p>
    </DashboardShell>
  );
}

function AmountCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-primary/10 bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-bold" dir="ltr">
        {value}
      </p>
    </div>
  );
}

function PaymentHistory({
  empty,
  rows,
  title,
}: {
  empty: string;
  rows: { id: string; label: string; meta?: string; status: string }[];
  title: string;
}) {
  return (
    <section>
      <h2 className="font-bold">{title}</h2>
      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">
            {empty}
          </p>
        ) : (
          rows.map((row) => (
            <div
              className="flex items-start justify-between gap-3 rounded-2xl border p-3 text-sm"
              key={row.id}
            >
              <div className="min-w-0">
                <p className="font-semibold">{row.label}</p>
                {row.meta ? (
                  <p
                    className="mt-1 truncate text-xs text-muted-foreground"
                    dir="ltr"
                  >
                    {row.meta}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {row.status}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
