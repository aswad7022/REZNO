import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { CommerceDomainError } from "@/features/commerce/domain/errors";
import { requireAuthenticatedMerchantActor } from "@/features/commerce/services/authenticated-context";
import {
  listMerchantOrders,
  type MerchantOrderQuery,
} from "@/features/commerce/services/merchant-order-query-service";

const QUEUES = ["pending", "active", "ready", "delivery_issues", "completed", "closed", "all"] as const;
const ORDER_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"] as const;
const FULFILLMENT_STATUSES = ["UNFULFILLED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "PICKED_UP", "DELIVERY_FAILED", "CANCELLED"] as const;

export default async function MerchantOrdersPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, params, t] = await Promise.all([
    requireAuthenticatedMerchantActor(),
    searchParams,
    getTranslations("Commerce"),
  ]);
  if (!actor.permissions.includes("ORDER_VIEW")) forbidden();
  let result;
  try {
    result = await listMerchantOrders(reference(actor), orderQuery(params));
  } catch (error) {
    if (error instanceof CommerceDomainError && (error.code === "INVALID_CURSOR" || error.code === "VALIDATION_ERROR")) notFound();
    throw error;
  }
  return <DashboardShell>
    <DashboardPageHeader title={t("ordersTitle")} description={t("ordersDescription")} />
    <nav aria-label={t("orderQueues")} className="flex flex-wrap gap-2">
      {QUEUES.map((queue) => <Button asChild key={queue} variant={result.data && single(params.queue) === queue ? "default" : "outline"}>
        <Link href={`/business/commerce/orders?queue=${queue}`}>{t(`orderQueue_${queue}`)}</Link>
      </Button>)}
    </nav>
    <Card><CardContent className="pt-6">
      <form className="grid gap-3 md:grid-cols-3" method="get">
        <input name="queue" type="hidden" value={single(params.queue) ?? "pending"} />
        <Input defaultValue={single(params.q)} maxLength={80} name="q" placeholder={t("orderSearch")} />
        <Select defaultValue={single(params.status)} label={t("orderStatus")} name="status" values={ORDER_STATUSES} />
        <Select defaultValue={single(params.fulfillmentStatus)} label={t("fulfillmentStatus")} name="fulfillmentStatus" values={FULFILLMENT_STATUSES} />
        <Select defaultValue={single(params.fulfillmentMethod)} label={t("fulfillmentMethod")} name="fulfillmentMethod" values={["CUSTOMER_PICKUP", "STORE_DELIVERY"]} />
        <Select defaultValue={single(params.paymentStatus)} label={t("paymentStatus")} name="paymentStatus" values={["UNPAID", "PAID", "VOIDED"]} />
        <Input defaultValue={single(params.createdFrom)} name="createdFrom" placeholder={t("createdFrom")} />
        <Input defaultValue={single(params.createdTo)} name="createdTo" placeholder={t("createdTo")} />
        <Input defaultValue={single(params.updatedFrom)} name="updatedFrom" placeholder={t("updatedFrom")} />
        <Input defaultValue={single(params.updatedTo)} name="updatedTo" placeholder={t("updatedTo")} />
        <label className="flex items-center gap-2 text-sm"><input defaultChecked={single(params.actionable) === "true"} name="actionable" type="checkbox" value="true" />{t("actionableOnly")}</label>
        <label className="flex items-center gap-2 text-sm"><input defaultChecked={single(params.overdue) === "true"} name="overdue" type="checkbox" value="true" />{t("overdueOnly")}</label>
        <Button className="w-fit" type="submit">{t("filter")}</Button>
      </form>
    </CardContent></Card>
    <div className="flex flex-wrap gap-2">
      {Object.entries(result.counts).map(([status, count]) => <Badge key={status} variant="secondary">{status}: {count}</Badge>)}
    </div>
    <section className="grid gap-4">
      {result.data.map((order) => <Card key={order.id}>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div><CardTitle dir="ltr">{order.orderNumber}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{order.customerDisplayName}</p></div>
          <div className="flex flex-wrap gap-2"><Badge>{order.status}</Badge><Badge variant="outline">{order.fulfillmentStatus}</Badge><Badge variant="secondary">{order.paymentStatus}</Badge></div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-4">
          <p>{t("fulfillmentMethod")}: {order.fulfillmentMethod}</p>
          <p>{t("orderItems")}: {order.itemCount} · {t("totalQuantity")}: {order.totalQuantity}</p>
          <p>{t("orderTotal")}: {order.grandTotal} {order.currency}</p>
          <p>{new Date(order.createdAt).toLocaleString()}</p>
          {order.overdue ? <Badge variant="destructive">{t("overdue")}</Badge> : null}
          <Button asChild className="w-fit" variant="outline"><Link href={`/business/commerce/orders/${order.id}`}>{t("open")}</Link></Button>
        </CardContent>
      </Card>)}
    </section>
    {!result.data.length ? <p className="text-sm text-muted-foreground">{t("noOrders")}</p> : null}
    {result.pageInfo.nextCursor ? <Button asChild variant="outline"><Link href={nextHref(params, result.pageInfo.nextCursor)}>{t("next")}</Link></Button> : null}
  </DashboardShell>;
}

function orderQuery(params: Record<string, string | string[] | undefined>): MerchantOrderQuery {
  return {
    actionableOnly: bool(params.actionable),
    createdFrom: date(single(params.createdFrom)),
    createdTo: date(single(params.createdTo)),
    cursor: bounded(single(params.cursor), 2048),
    fulfillmentMethod: optionalEnum(params.fulfillmentMethod, ["CUSTOMER_PICKUP", "STORE_DELIVERY"]),
    fulfillmentStatus: optionalEnum(params.fulfillmentStatus, FULFILLMENT_STATUSES),
    limit: 20,
    overduePending: bool(params.overdue),
    paymentStatus: optionalEnum(params.paymentStatus, ["UNPAID", "PAID", "VOIDED"]),
    query: bounded(single(params.q)?.trim(), 80),
    queue: optionalEnum(params.queue, QUEUES) ?? "pending",
    status: optionalEnum(params.status, ORDER_STATUSES),
    updatedFrom: date(single(params.updatedFrom)),
    updatedTo: date(single(params.updatedTo)),
  };
}

function nextHref(params: Record<string, string | string[] | undefined>, cursor: string) {
  const output = new URLSearchParams();
  for (const key of ["queue", "q", "status", "fulfillmentStatus", "fulfillmentMethod", "paymentStatus", "createdFrom", "createdTo", "updatedFrom", "updatedTo", "actionable", "overdue"]) {
    const value = single(params[key]);
    if (value) output.set(key, value);
  }
  output.set("cursor", cursor);
  return `/business/commerce/orders?${output}`;
}

function Select({ defaultValue, label, name, values }: { defaultValue?: string; label: string; name: string; values: readonly string[] }) {
  return <select className="h-9 rounded-md border bg-background px-3 text-sm" defaultValue={defaultValue} name={name}><option value="">{label}</option>{values.map((value) => <option key={value} value={value}>{value}</option>)}</select>;
}
function single(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }
function bounded(value: string | undefined, max: number) { return value && value.length <= max ? value : undefined; }
function date(value: string | undefined) { if (!value) return undefined; const parsed = new Date(value); return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value ? parsed : undefined; }
function bool(value: string | string[] | undefined) { const item = single(value); return item === "true" ? true : item === undefined ? undefined : undefined; }
function optionalEnum<const T extends string>(value: string | string[] | undefined, values: readonly T[]) { const item = single(value); return item && values.includes(item as T) ? item as T : undefined; }
function reference(actor: { membershipId: string; organizationId: string; personId: string }) { return { contextOrganizationId: actor.organizationId, membershipId: actor.membershipId, personId: actor.personId }; }
