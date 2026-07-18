import { randomUUID } from "node:crypto";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { AdminProductModerationForm } from "@/features/commerce/components/admin-commerce-forms";
import { getAdminProductDetail } from "@/features/commerce/services/admin-product-service";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";

export default async function AdminProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_CATALOG_VIEW");
  const detail = await getAdminProductDetail(context, productId);
  const product = detail.product;
  return <>
    <AdminPageHeader title={product.name} description={`${product.organization.name} · ${product.store.name}`} />
    <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader><CardTitle>الحالة</CardTitle></CardHeader><CardContent><Badge>{product.status}</Badge><p>ظاهر: {product.publicVisible ? "نعم" : "لا"}</p></CardContent></Card><Card><CardHeader><CardTitle>الجاهزية</CardTitle></CardHeader><CardContent>{product.readiness.ready ? "جاهز" : product.readiness.missing.join(", ")}</CardContent></Card><Card><CardHeader><CardTitle>الأثر</CardTitle></CardHeader><CardContent><p>السلال: {detail.impact.activeCartItems}</p><p>الطلبات: {detail.impact.nonterminalOrders}</p></CardContent></Card></div>
    <Card className="mt-4"><CardHeader><CardTitle>المتغيرات</CardTitle></CardHeader><CardContent className="space-y-2">{product.variants.map((variant) => <p key={variant.id}>{variant.sku} · {variant.title} · {variant.price} IQD · {variant.status}</p>)}</CardContent></Card>
    {detail.expectedVersion && detail.permittedActions ? <div className="mt-6 grid gap-3 md:grid-cols-2">{detail.permittedActions.suspend ? <AdminProductModerationForm action="suspend" expectedVersion={detail.expectedVersion} idempotencyKey={randomUUID()} productId={productId} /> : null}{detail.permittedActions.clear ? <AdminProductModerationForm action="clear" expectedVersion={detail.expectedVersion} idempotencyKey={randomUUID()} productId={productId} /> : null}</div> : null}
  </>;
}
