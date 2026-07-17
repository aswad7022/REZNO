import { randomUUID } from "node:crypto";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { AdminStoreModerationForm } from "@/features/commerce/components/admin-store-moderation-form";
import { getAdminStoreDetail } from "@/features/commerce/services/admin-store-query-service";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";

export default async function AdminStoreDetailPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_STORES_VIEW");
  const store = await getAdminStoreDetail(context, storeId);
  return <>
    <AdminPageHeader title={store.profile.name} description={`متجر ${store.organization.name}`} />
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><CardTitle>الحالة</CardTitle></CardHeader><CardContent><Badge>{store.profile.status}</Badge><p className="mt-2 text-sm">ظاهر للعامة: {store.publicVisible ? "نعم" : "لا"}</p></CardContent></Card>
      <Card><CardHeader><CardTitle>الجاهزية</CardTitle></CardHeader><CardContent>{store.profile.readiness.ready ? "جاهز" : store.profile.readiness.missing.join(", ")}</CardContent></Card>
      <Card><CardHeader><CardTitle>العلاقات</CardTitle></CardHeader><CardContent className="text-sm"><p>المنتجات: {store.counts.products}</p><p>المخزون: {store.counts.inventory}</p><p>الطلبات: {store.counts.orders}</p></CardContent></Card>
    </div>
    <section className="mt-6 space-y-3">
      {Object.entries(store.permittedActions).filter(([, enabled]) => enabled).map(([action]) => <AdminStoreModerationForm key={action} action={action as "approve" | "reactivate" | "reject" | "suspend"} expectedVersion={store.expectedVersion} idempotencyKey={randomUUID()} storeId={storeId} />)}
    </section>
    <Card className="mt-6"><CardHeader><CardTitle>سجل المراجعة</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{store.audit.map((item) => <p key={item.id}>{item.action} · {item.createdAt}</p>)}</CardContent></Card>
  </>;
}
