import { randomUUID } from "node:crypto";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { AdminInventoryCorrectionForm } from "@/features/commerce/components/admin-commerce-forms";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";
import { getAdminInventoryDetail } from "@/features/commerce/services/admin-inventory-service";

export default async function AdminInventoryDetailPage({ params, searchParams }: { params: Promise<{ inventoryItemId: string }>; searchParams: Promise<{ cursor?: string }> }) {
  const { inventoryItemId } = await params; const query = await searchParams;
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_INVENTORY_VIEW");
  const detail = await getAdminInventoryDetail(context, inventoryItemId, { cursor: query.cursor, limit: 20 }); const item = detail.inventory;
  return <><AdminPageHeader title={item.product.name} description={`${item.organization.name} · ${item.store.name} · ${item.variant.sku}`} /><div className="grid gap-4 md:grid-cols-4">{[["المتاح", item.available], ["الموجود", item.onHand], ["المحجوز", item.reserved], ["حجوزات نشطة", detail.activeReservations]].map(([label, value]) => <Card key={label}><CardHeader><CardTitle>{label}</CardTitle></CardHeader><CardContent>{value}</CardContent></Card>)}</div>{detail.expectedVersion !== undefined ? <div className="mt-6"><AdminInventoryCorrectionForm expectedVersion={detail.expectedVersion} idempotencyKey={randomUUID()} inventoryItemId={inventoryItemId} /></div> : null}<Card className="mt-6"><CardHeader><CardTitle>حركات المخزون</CardTitle></CardHeader><CardContent className="space-y-2">{detail.movements.data.map((movement) => <p key={movement.id}>{movement.type} · {movement.onHandDelta} · {movement.actorType} · {movement.createdAt}</p>)}</CardContent></Card></>;
}
