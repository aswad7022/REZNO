import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { AdminCommerceDateFilterForm } from "@/features/commerce/components/admin-commerce-date-filter-form";
import {
  ADMIN_FULFILLMENT_METHODS,
  ADMIN_FULFILLMENT_STATUSES,
  ADMIN_ORDER_STATUSES,
  ADMIN_PAYMENT_STATUSES,
  adminOrderNextHref,
  type AdminPageSearchParams,
  parseAdminOrderPageQuery,
} from "@/features/commerce/domain/admin-commerce-query";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";
import { listAdminOrders } from "@/features/commerce/services/admin-order-query-service";

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<AdminPageSearchParams> }) {
  const query = parseAdminOrderPageQuery(await searchParams);
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_ORDERS_VIEW");
  const page = await listAdminOrders(context, {
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
    cursor: query.cursor,
    deliveryFailure: query.deliveryFailure,
    fulfillmentMethod: query.fulfillmentMethod,
    fulfillmentStatus: query.fulfillment,
    limit: 20,
    orderStatus: query.status,
    organizationId: query.organizationId,
    overdue: query.overdue,
    paymentStatus: query.payment,
    query: query.q,
    storeId: query.storeId,
    updatedFrom: query.updatedFrom,
    updatedTo: query.updatedTo,
  });
  return <>
    <AdminPageHeader title="إشراف الطلبات" description={`قائمة تشغيلية منقحة من بيانات العميل عند ${page.evaluationTime}.`} />
    <AdminCommerceDateFilterForm
      className="mb-6 grid gap-2 md:grid-cols-4"
      dateFilters={[
        { initialCanonical: query.createdFrom?.toISOString(), label: "منشأ من", name: "createdFrom" },
        { initialCanonical: query.createdTo?.toISOString(), label: "منشأ إلى", name: "createdTo" },
        { initialCanonical: query.updatedFrom?.toISOString(), label: "محدّث من", name: "updatedFrom" },
        { initialCanonical: query.updatedTo?.toISOString(), label: "محدّث إلى", name: "updatedTo" },
      ]}
    >
      <Input name="q" defaultValue={query.q} placeholder="رقم الطلب" maxLength={120} />
      <Select name="status" value={query.status} values={ADMIN_ORDER_STATUSES} label="كل حالات الطلب" />
      <Select name="fulfillment" value={query.fulfillment} values={ADMIN_FULFILLMENT_STATUSES} label="كل حالات التنفيذ" />
      <Select name="payment" value={query.payment} values={ADMIN_PAYMENT_STATUSES} label="كل حالات الدفع" />
      <Select name="fulfillmentMethod" value={query.fulfillmentMethod} values={ADMIN_FULFILLMENT_METHODS} label="كل طرق التنفيذ" />
      <Input name="organizationId" defaultValue={query.organizationId} placeholder="Organization UUID" dir="ltr" />
      <Input name="storeId" defaultValue={query.storeId} placeholder="Store UUID" dir="ltr" />
      <select name="overdue" defaultValue={query.overdue === undefined ? "" : String(query.overdue)} className="rounded-md border bg-background px-3">
        <option value="">دون تصنيف موعد</option>
        <option value="true">PENDING المتأخر فقط</option>
        <option value="false">PENDING غير المتأخر فقط</option>
      </select>
      <BooleanSelect name="deliveryFailure" value={query.deliveryFailure} trueLabel="فشل التسليم فقط" falseLabel="دون فشل تسليم" />
      <Button type="submit">تصفية</Button>
    </AdminCommerceDateFilterForm>
    <div className="space-y-4">{page.data.map((order) => <Card key={order.id}>
      <CardHeader className="flex-row justify-between"><CardTitle>{order.orderNumber}</CardTitle><Badge>{order.status}</Badge></CardHeader>
      <CardContent className="flex items-center justify-between"><p>{order.organization.name} · {order.store.name} · {order.fulfillmentStatus} · {order.paymentStatus}{order.overdue ? " · متأخر" : ""}</p><Button asChild variant="outline"><Link href={`/admin/commerce/orders/${order.id}`}>التفاصيل</Link></Button></CardContent>
    </Card>)}</div>
    {page.pageInfo.nextCursor ? <Button asChild className="mt-6" variant="outline"><Link href={adminOrderNextHref(query, page.pageInfo.nextCursor)}>التالي</Link></Button> : null}
  </>;
}

function Select<T extends string>({ label, name, value, values }: { label: string; name: string; value?: T; values: readonly T[] }) {
  return <select name={name} defaultValue={value ?? ""} className="rounded-md border bg-background px-3"><option value="">{label}</option>{values.map((item) => <option key={item}>{item}</option>)}</select>;
}

function BooleanSelect({ falseLabel, name, trueLabel, value }: { falseLabel: string; name: string; trueLabel: string; value?: boolean }) {
  return <select name={name} defaultValue={value === undefined ? "" : String(value)} className="rounded-md border bg-background px-3"><option value="">الكل</option><option value="true">{trueLabel}</option><option value="false">{falseLabel}</option></select>;
}
