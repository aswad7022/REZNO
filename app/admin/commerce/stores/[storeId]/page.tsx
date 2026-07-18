import { randomUUID } from "node:crypto";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { AdminStoreModerationForm } from "@/features/commerce/components/admin-store-moderation-form";
import {
  adminStoreAuditNextHref,
  type AdminPageSearchParams,
  parseAdminDetailCursor,
} from "@/features/commerce/domain/admin-commerce-query";
import { getAdminStoreDetail } from "@/features/commerce/services/admin-store-query-service";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";

export default async function AdminStoreDetailPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<AdminPageSearchParams> }) {
  const { storeId } = await params;
  const auditCursor = parseAdminDetailCursor(await searchParams, "auditCursor");
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_STORES_VIEW");
  const store = await getAdminStoreDetail(context, storeId, { auditCursor });
  return <>
    <AdminPageHeader title={store.profile.name} description={`متجر ${store.organization.name}`} />
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><CardTitle>الحالة</CardTitle></CardHeader><CardContent><Badge>{store.profile.status}</Badge><p className="mt-2 text-sm">ظاهر: {store.publicVisible ? "نعم" : "لا"}</p></CardContent></Card>
      <Card><CardHeader><CardTitle>الجاهزية</CardTitle></CardHeader><CardContent>{store.readiness.ready ? "جاهز" : store.readiness.missing.join(", ")}</CardContent></Card>
      <Card><CardHeader><CardTitle>العلاقات</CardTitle></CardHeader><CardContent className="text-sm"><p>المنتجات: {store.counts.products}</p><p>المخزون: {store.counts.inventory}</p><p>الطلبات: {store.counts.orders}</p><p>طلبات نشطة: {store.activeOrderBlockers.activeOrders}</p></CardContent></Card>
    </div>
    {store.permittedActions && store.expectedVersion ? <section className="mt-6 space-y-3">{Object.entries(store.permittedActions).filter(([, enabled]) => enabled).map(([action]) => <AdminStoreModerationForm key={action} action={action as "approve" | "reactivate" | "reject" | "suspend"} expectedVersion={store.expectedVersion!} idempotencyKey={randomUUID()} storeId={storeId} />)}</section> : null}
    <Card className="mt-6"><CardHeader><CardTitle>سجل المراجعة</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{store.audit.data.map((item) => <p key={item.id}>{item.action} · {item.createdAt}</p>)}{store.audit.pageInfo.nextCursor ? <Button asChild variant="outline"><a href={adminStoreAuditNextHref(storeId, store.audit.pageInfo.nextCursor)}>أقدم</a></Button> : null}</CardContent></Card>
  </>;
}
