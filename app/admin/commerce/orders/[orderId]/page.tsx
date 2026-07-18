import { randomUUID } from "node:crypto";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { AdminOrderInterventionForm } from "@/features/commerce/components/admin-commerce-forms";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";
import { getAdminOrderDetail } from "@/features/commerce/services/admin-order-query-service";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_ORDERS_VIEW");
  const detail = await getAdminOrderDetail(context, orderId); const order = detail.order;
  return <><AdminPageHeader title={order.orderNumber} description={`${order.store.organization.name} · ${order.store.name}`} /><div className="grid gap-4 md:grid-cols-3"><Card><CardHeader><CardTitle>الحالة</CardTitle></CardHeader><CardContent><Badge>{order.status}</Badge><p>{order.fulfillmentStatus} · {order.paymentStatus}</p></CardContent></Card><Card><CardHeader><CardTitle>العميل التشغيلي</CardTitle></CardHeader><CardContent><p>{order.customer.displayName}</p><p dir="ltr">{order.customer.phone}</p></CardContent></Card><Card><CardHeader><CardTitle>المخزون</CardTitle></CardHeader><CardContent><p>حجوزات {order.reservations.length}</p><p>حركات {order.stockMovements.length}</p></CardContent></Card></div><Card className="mt-4"><CardHeader><CardTitle>بنود ثابتة</CardTitle></CardHeader><CardContent>{order.items.map((item) => <p key={`${item.sku}-${item.productName}`}>{item.productName} · {item.variantTitle} · {item.quantity}</p>)}</CardContent></Card>{detail.expectedVersion && detail.permittedActions ? <div className="mt-6 grid gap-3 md:grid-cols-2">{detail.permittedActions.expire ? <AdminOrderInterventionForm action="expire" expectedVersion={detail.expectedVersion} idempotencyKey={randomUUID()} orderId={orderId} /> : null}{detail.permittedActions.cancel ? <AdminOrderInterventionForm action="cancel" expectedVersion={detail.expectedVersion} idempotencyKey={randomUUID()} orderId={orderId} returnedStockRequired={detail.permittedActions.returnedStockRequired} /> : null}</div> : null}<Card className="mt-6"><CardHeader><CardTitle>سجل دورة الحياة</CardTitle></CardHeader><CardContent>{order.history.map((item) => <p key={item.id}>{item.actorType} · {item.newOrderStatus ?? item.newFulfillmentStatus} · {item.createdAt}</p>)}</CardContent></Card></>;
}
