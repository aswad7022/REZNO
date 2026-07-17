import { randomUUID } from "node:crypto";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { AdminCategoryForm, AdminCategoryTransitionForm } from "@/features/commerce/components/admin-commerce-forms";
import { getAdminCategoryDetail } from "@/features/commerce/services/admin-category-service";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";

export default async function AdminCategoryDetailPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_CATALOG_VIEW");
  const detail = await getAdminCategoryDetail(context, categoryId);
  const category = detail.category;
  return <>
    <AdminPageHeader title={category.name} description={`الفئة ${category.slug}`} />
    <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle>الحالة</CardTitle></CardHeader><CardContent><Badge>{category.status}</Badge><p>الترتيب: {category.displayOrder}</p></CardContent></Card><Card><CardHeader><CardTitle>الأثر</CardTitle></CardHeader><CardContent className="text-sm"><p>المنتجات: {detail.impact.products}</p><p>المنشورة: {detail.impact.publishedProducts}</p><p>أسطر سلة نشطة: {detail.impact.activeCartItems}</p><p>طلبات غير نهائية: {detail.impact.nonterminalOrders}</p></CardContent></Card></div>
    {detail.expectedVersion && detail.permittedActions ? <div className="mt-6 space-y-4">{detail.permittedActions.update ? <AdminCategoryForm categoryId={category.id} displayOrder={category.displayOrder} expectedVersion={detail.expectedVersion} idempotencyKey={randomUUID()} name={category.name} slug={category.slug} /> : null}<div className="grid gap-3 md:grid-cols-3">{detail.permittedActions.deactivate ? <AdminCategoryTransitionForm action="deactivate" categoryId={category.id} expectedVersion={detail.expectedVersion} idempotencyKey={randomUUID()} publishedImpact={detail.impact.publishedProducts > 0} /> : null}{detail.permittedActions.reactivate ? <AdminCategoryTransitionForm action="reactivate" categoryId={category.id} expectedVersion={detail.expectedVersion} idempotencyKey={randomUUID()} publishedImpact={false} /> : null}{detail.permittedActions.archive ? <AdminCategoryTransitionForm action="archive" categoryId={category.id} expectedVersion={detail.expectedVersion} idempotencyKey={randomUUID()} publishedImpact={detail.impact.publishedProducts > 0} /> : null}</div></div> : null}
  </>;
}
