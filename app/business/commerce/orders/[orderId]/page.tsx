import { randomUUID } from "node:crypto";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MerchantOrderForms } from "@/features/commerce/components/merchant-order-forms";
import { CommerceDomainError } from "@/features/commerce/domain/errors";
import { requireAuthenticatedMerchantActor } from "@/features/commerce/services/authenticated-context";
import { getMerchantOrderDetail } from "@/features/commerce/services/merchant-order-query-service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function MerchantOrderDetailPage({ params, searchParams }: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, route, query, t] = await Promise.all([
    requireAuthenticatedMerchantActor(), params, searchParams, getTranslations("Commerce"),
  ]);
  if (!actor.permissions.includes("ORDER_VIEW")) forbidden();
  if (!UUID_PATTERN.test(route.orderId)) notFound();
  let result;
  try {
    result = await getMerchantOrderDetail(reference(actor), route.orderId, single(query.historyCursor));
  } catch (error) {
    if (error instanceof CommerceDomainError && (error.code === "NOT_FOUND" || error.code === "INVALID_CURSOR")) notFound();
    throw error;
  }
  const order = result.order;
  const actions = order.mode === "management" ? order.allowedActions : [];
  return <DashboardShell>
    <DashboardPageHeader title={`${t("orderTitle")} ${order.orderNumber}`} description={t("orderDetailDescription")} actions={<Button asChild variant="outline"><Link href="/business/commerce/orders">{t("backToOrders")}</Link></Button>} />
    <div className="flex flex-wrap gap-2"><Badge>{order.status}</Badge><Badge variant="outline">{order.fulfillmentStatus}</Badge><Badge variant="secondary">{order.paymentStatus}</Badge><Badge>{order.mode === "management" ? t("managementMode") : t("readOnlyMode")}</Badge></div>
    <section className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>{t("orderLifecycle")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        <Line label={t("orderNumber")} value={order.orderNumber} />
        <Line label={t("fulfillmentMethod")} value={order.fulfillmentMethod} />
        <Line label={t("paymentStatus")} value={`${order.paymentMethod} · ${order.paymentStatus}`} />
        <Line label={t("reservationDeadline")} value={new Date(order.reservationExpiresAt).toLocaleString()} />
        <Line label={t("updatedAt")} value={new Date(order.updatedAt).toLocaleString()} />
        {order.cancellationReason ? <Line label={t("cancellationReason")} value={order.cancellationReason} /> : null}
        {order.rejectionReason ? <Line label={t("rejectionReason")} value={order.rejectionReason} /> : null}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{t("customerOperationalDetails")}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        <Line label={t("customerName")} value={order.customer.displayName} />
        <Line label={t("customerPhone")} value={order.customer.phone} />
        {order.delivery ? <><Line label={t("deliveryAddress")} value={`${order.delivery.city}، ${order.delivery.area}، ${order.delivery.street}، ${order.delivery.additionalDetails}`} /><Line label={t("recipient")} value={`${order.delivery.recipientName} · ${order.delivery.phone}`} /></> : null}
        {order.pickup ? <><Line label={t("pickupAddress")} value={order.pickup.address ?? "—"} /><Line label={t("pickupInstructions")} value={order.pickup.instructions ?? "—"} /></> : null}
        {order.customerInstructions ? <Line label={t("customerInstructions")} value={order.customerInstructions} /> : null}
      </CardContent></Card>
    </section>
    <Card><CardHeader><CardTitle>{t("orderItems")}</CardTitle></CardHeader><CardContent className="space-y-3">
      {order.items.map((item, index) => <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3 text-sm" key={`${item.sku}-${index}`}><div><p className="font-medium">{item.productName}</p><p className="text-muted-foreground">{item.variantTitle} · <span dir="ltr">{item.sku}</span> · {item.quantity}</p></div><p>{item.lineTotal} {item.currency}</p></div>)}
      <div className="space-y-1 text-sm"><Line label={t("subtotal")} value={`${order.subtotal} ${order.currency}`} /><Line label={t("deliveryFee")} value={`${order.deliveryFee} ${order.currency}`} /><Line label={t("orderTotal")} value={`${order.grandTotal} ${order.currency}`} /></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("orderHistory")}</CardTitle></CardHeader><CardContent className="space-y-3">
      {order.history.map((entry) => <div className="border-s-2 ps-3 text-sm" key={entry.id}><p className="font-medium">{entry.newOrderStatus ?? entry.newFulfillmentStatus ?? entry.newPaymentStatus}</p><p className="text-muted-foreground">{entry.actorType} · {new Date(entry.createdAt).toLocaleString()}</p>{entry.reason ? <p>{entry.reason}</p> : null}</div>)}
      {order.historyPageInfo.nextCursor ? <Button asChild variant="outline"><Link href={`/business/commerce/orders/${order.id}?historyCursor=${encodeURIComponent(order.historyPageInfo.nextCursor)}`}>{t("olderHistory")}</Link></Button> : null}
    </CardContent></Card>
    {order.mode === "management" && actions.length ? <MerchantOrderForms allowedActions={actions} expectedVersion={order.expectedVersion} fulfillmentStatus={order.fulfillmentStatus} idempotencyKeys={Object.fromEntries(actions.map((item) => [item, randomUUID()]))} orderId={order.id} /> : null}
  </DashboardShell>;
}

function Line({ label, value }: { label: string; value: string }) { return <p><span className="font-medium">{label}:</span> {value}</p>; }
function single(value: string | string[] | undefined) { return typeof value === "string" && value.length <= 2048 ? value : undefined; }
function reference(actor: { membershipId: string; organizationId: string; personId: string }) { return { contextOrganizationId: actor.organizationId, membershipId: actor.membershipId, personId: actor.personId }; }
