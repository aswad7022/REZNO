import Link from "next/link";
import type { CommerceOrderStatus, FulfillmentStatus, PaymentStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";
import { listAdminOrders } from "@/features/commerce/services/admin-order-query-service";

const ORDER = new Set<CommerceOrderStatus>(["PENDING", "CONFIRMED", "COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"]);
const FULFILLMENT = new Set<FulfillmentStatus>(["UNFULFILLED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "PICKED_UP", "DELIVERY_FAILED", "CANCELLED"]);
const PAYMENT = new Set<PaymentStatus>(["UNPAID", "PAID", "VOIDED"]);

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const orderStatus = params.status && ORDER.has(params.status as CommerceOrderStatus) ? params.status as CommerceOrderStatus : undefined;
  const fulfillmentStatus = params.fulfillment && FULFILLMENT.has(params.fulfillment as FulfillmentStatus) ? params.fulfillment as FulfillmentStatus : undefined;
  const paymentStatus = params.payment && PAYMENT.has(params.payment as PaymentStatus) ? params.payment as PaymentStatus : undefined;
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_ORDERS_VIEW");
  const page = await listAdminOrders(context, { cursor: params.cursor, fulfillmentStatus, limit: 20, orderStatus, overdue: bool(params.overdue), paymentStatus, query: params.q });
  return <><AdminPageHeader title="إشراف الطلبات" description={`قائمة تشغيلية منقحة من بيانات العميل عند ${page.evaluationTime}.`} /><form className="mb-6 grid gap-2 md:grid-cols-5"><Input name="q" defaultValue={params.q} placeholder="رقم الطلب" maxLength={120} /><Select name="status" value={orderStatus} values={ORDER} label="كل حالات الطلب" /><Select name="fulfillment" value={fulfillmentStatus} values={FULFILLMENT} label="كل حالات التنفيذ" /><Select name="payment" value={paymentStatus} values={PAYMENT} label="كل حالات الدفع" /><Button type="submit">تصفية</Button></form><div className="space-y-4">{page.data.map((order) => <Card key={order.id}><CardHeader className="flex-row justify-between"><CardTitle>{order.orderNumber}</CardTitle><Badge>{order.status}</Badge></CardHeader><CardContent className="flex items-center justify-between"><p>{order.organization.name} · {order.store.name} · {order.fulfillmentStatus} · {order.paymentStatus}{order.overdue ? " · متأخر" : ""}</p><Button asChild variant="outline"><Link href={`/admin/commerce/orders/${order.id}`}>التفاصيل</Link></Button></CardContent></Card>)}</div>{page.pageInfo.nextCursor ? <Button asChild className="mt-6" variant="outline"><Link href={`?cursor=${encodeURIComponent(page.pageInfo.nextCursor)}`}>التالي</Link></Button> : null}</>;
}
function bool(value?: string) { return value === "true" ? true : value === "false" ? false : undefined; }
function Select<T extends string>({ label, name, value, values }: { label: string; name: string; value?: T; values: Set<T> }) { return <select name={name} defaultValue={value ?? ""} className="rounded-md border bg-background px-3"><option value="">{label}</option>{[...values].map((item) => <option key={item}>{item}</option>)}</select>; }
