import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DashboardPageHeader, DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MerchantOrderFilterForm } from "@/features/commerce/components/merchant-order-filter-form";
import { CommerceDomainError, commerceError } from "@/features/commerce/domain/errors";
import {
  merchantOrderDateRangeError,
  merchantOrderNextHref,
  parseCanonicalMerchantOrderTimestamp,
  type MerchantOrderDateFilterKey,
} from "@/features/commerce/domain/merchant-order-filter-policy";
import { requireAuthenticatedMerchantActor } from "@/features/commerce/services/authenticated-context";
import {
  listMerchantOrders,
  type MerchantOrderQuery,
} from "@/features/commerce/services/merchant-order-query-service";

const QUEUES = ["pending", "active", "ready", "delivery_issues", "completed", "closed", "all"] as const;
const ORDER_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"] as const;
const FULFILLMENT_STATUSES = ["UNFULFILLED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "PICKED_UP", "DELIVERY_FAILED", "CANCELLED"] as const;
const BUSINESS_QUERY_KEYS = new Set([
  "actionable", "createdFrom", "createdTo", "cursor", "fulfillmentMethod",
  "fulfillmentStatus", "overdue", "paymentStatus", "q", "queue", "status",
  "updatedFrom", "updatedTo",
]);

export default async function MerchantOrdersPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, params, t] = await Promise.all([
    requireAuthenticatedMerchantActor(),
    searchParams,
    getTranslations("Commerce"),
  ]);
  if (!actor.permissions.includes("ORDER_VIEW")) forbidden();
  let query: MerchantOrderQuery | null = null;
  let result: Awaited<ReturnType<typeof listMerchantOrders>> | null = null;
  let validationError = false;
  try {
    query = orderQuery(params);
    result = await listMerchantOrders(reference(actor), query);
  } catch (error) {
    if (error instanceof CommerceDomainError && error.code === "VALIDATION_ERROR") validationError = true;
    else if (error instanceof CommerceDomainError && error.code === "INVALID_CURSOR") notFound();
    else throw error;
  }
  const dateFilters = (["createdFrom", "createdTo", "updatedFrom", "updatedTo"] as const).map((name) => ({
    initialCanonical: query?.[name]?.toISOString() ?? rawSingle(params[name]),
    label: t(name),
    name,
  })) satisfies Array<{ initialCanonical?: string; label: string; name: MerchantOrderDateFilterKey }>;
  const selectedQueue = optionalDisplayEnum(params.queue, QUEUES) ?? "pending";
  return <DashboardShell>
    <DashboardPageHeader title={t("ordersTitle")} description={t("ordersDescription")} />
    <nav aria-label={t("orderQueues")} className="flex flex-wrap gap-2">
      {QUEUES.map((queueName) => <Button asChild key={queueName} variant={selectedQueue === queueName ? "default" : "outline"}>
        <Link href={`/business/commerce/orders?queue=${queueName}`}>{t(`orderQueue_${queueName}`)}</Link>
      </Button>)}
    </nav>
    <Card><CardContent className="pt-6">
      <MerchantOrderFilterForm
        dateFilters={dateFilters}
        invalidDateMessage={t("invalidOrderDate")}
      >
        <input name="queue" type="hidden" value={selectedQueue} />
        <Input defaultValue={rawSingle(params.q)} maxLength={80} name="q" placeholder={t("orderSearch")} />
        <Select defaultValue={rawSingle(params.status)} label={t("orderStatus")} name="status" values={ORDER_STATUSES} />
        <Select defaultValue={rawSingle(params.fulfillmentStatus)} label={t("fulfillmentStatus")} name="fulfillmentStatus" values={FULFILLMENT_STATUSES} />
        <Select defaultValue={rawSingle(params.fulfillmentMethod)} label={t("fulfillmentMethod")} name="fulfillmentMethod" values={["CUSTOMER_PICKUP", "STORE_DELIVERY"]} />
        <Select defaultValue={rawSingle(params.paymentStatus)} label={t("paymentStatus")} name="paymentStatus" values={["UNPAID", "PAID", "VOIDED"]} />
        <label className="flex items-center gap-2 text-sm"><input defaultChecked={rawSingle(params.actionable) === "true"} name="actionable" type="checkbox" value="true" />{t("actionableOnly")}</label>
        <label className="flex items-center gap-2 text-sm"><input defaultChecked={rawSingle(params.overdue) === "true"} name="overdue" type="checkbox" value="true" />{t("overdueOnly")}</label>
        <Button className="w-fit" type="submit">{t("filter")}</Button>
      </MerchantOrderFilterForm>
      {validationError ? <p className="mt-3 text-sm text-destructive" role="alert">{t("invalidOrderFilters")}</p> : null}
    </CardContent></Card>
    {result ? <>
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
      {result.pageInfo.nextCursor && query ? <Button asChild variant="outline"><Link href={merchantOrderNextHref(query, result.pageInfo.nextCursor)}>{t("next")}</Link></Button> : null}
    </> : null}
  </DashboardShell>;
}

function orderQuery(params: Record<string, string | string[] | undefined>): MerchantOrderQuery {
  for (const key of Object.keys(params)) {
    if (!BUSINESS_QUERY_KEYS.has(key)) commerceError("VALIDATION_ERROR", "Order filter is invalid.");
  }
  const query: MerchantOrderQuery = {
    actionableOnly: bool(unique(params, "actionable"), "actionable"),
    createdFrom: date(unique(params, "createdFrom"), "createdFrom"),
    createdTo: date(unique(params, "createdTo"), "createdTo"),
    cursor: bounded(unique(params, "cursor"), 2048),
    fulfillmentMethod: optionalEnum(unique(params, "fulfillmentMethod"), ["CUSTOMER_PICKUP", "STORE_DELIVERY"]),
    fulfillmentStatus: optionalEnum(unique(params, "fulfillmentStatus"), FULFILLMENT_STATUSES),
    limit: 20,
    overduePending: bool(unique(params, "overdue"), "overdue"),
    paymentStatus: optionalEnum(unique(params, "paymentStatus"), ["UNPAID", "PAID", "VOIDED"]),
    query: bounded(unique(params, "q")?.trim(), 80) || undefined,
    queue: optionalEnum(unique(params, "queue"), QUEUES) ?? "pending",
    status: optionalEnum(unique(params, "status"), ORDER_STATUSES),
    updatedFrom: date(unique(params, "updatedFrom"), "updatedFrom"),
    updatedTo: date(unique(params, "updatedTo"), "updatedTo"),
  };
  for (const [from, to] of [[query.createdFrom, query.createdTo], [query.updatedFrom, query.updatedTo]]) {
    if (merchantOrderDateRangeError(from, to)) commerceError("VALIDATION_ERROR", "Order date range is invalid.");
  }
  return query;
}

function Select({ defaultValue, label, name, values }: { defaultValue?: string; label: string; name: string; values: readonly string[] }) {
  return <select className="h-9 rounded-md border bg-background px-3 text-sm" defaultValue={defaultValue} name={name}><option value="">{label}</option>{values.map((value) => <option key={value} value={value}>{value}</option>)}</select>;
}
function rawSingle(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }
function unique(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  if (Array.isArray(value)) commerceError("VALIDATION_ERROR", `Duplicate Order filter: ${key}.`);
  return value;
}
function bounded(value: string | undefined, max: number) {
  if (value && value.length > max) commerceError("VALIDATION_ERROR", "Order filter is too long.");
  return value || undefined;
}
function date(value: string | undefined, name: string) {
  if (value === undefined) return undefined;
  const parsed = parseCanonicalMerchantOrderTimestamp(value);
  if (!parsed) commerceError("VALIDATION_ERROR", `${name} must include an ISO timezone.`);
  return parsed;
}
function bool(value: string | undefined, name: string) {
  if (value === undefined) return undefined;
  if (value !== "true" && value !== "false") commerceError("VALIDATION_ERROR", `${name} is invalid.`);
  return value === "true";
}
function optionalEnum<const T extends string>(item: string | undefined, values: readonly T[]) {
  if (!item) return undefined;
  if (!values.includes(item as T)) commerceError("VALIDATION_ERROR", "Order filter is invalid.");
  return item as T;
}
function optionalDisplayEnum<const T extends string>(value: string | string[] | undefined, values: readonly T[]) {
  const item = rawSingle(value);
  return item && values.includes(item as T) ? item as T : undefined;
}
function reference(actor: { membershipId: string; organizationId: string; personId: string }) { return { contextOrganizationId: actor.organizationId, membershipId: actor.membershipId, personId: actor.personId }; }
