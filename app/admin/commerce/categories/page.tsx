import Link from "next/link";
import type { MarketplaceCategoryStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { listAdminCategories } from "@/features/commerce/services/admin-category-service";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";

const STATUSES = new Set<MarketplaceCategoryStatus>(["ACTIVE", "INACTIVE", "ARCHIVED"]);

export default async function AdminCategoriesPage({ searchParams }: { searchParams: Promise<{ cursor?: string; q?: string; status?: string }> }) {
  const params = await searchParams;
  const status = params.status && STATUSES.has(params.status as MarketplaceCategoryStatus) ? params.status as MarketplaceCategoryStatus : undefined;
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_CATALOG_VIEW");
  const page = await listAdminCategories(context, { cursor: params.cursor, limit: 20, search: params.q, status });
  const canModerate = context.isSuperAdmin || context.permissions.includes("COMMERCE_CATALOG_MODERATE");
  return <>
    <AdminPageHeader title="فئات السوق" description="دورة حياة الفئات وتأثيرها على الاكتشاف والسلة والدفع." />
    <div className="mb-6 flex flex-wrap gap-2">{canModerate ? <Button asChild><Link href="/admin/commerce/categories/new">فئة جديدة</Link></Button> : null}<form className="flex flex-wrap gap-2"><Input name="q" defaultValue={params.q} placeholder="بحث" maxLength={120} /><select name="status" defaultValue={status ?? ""} className="rounded-md border bg-background px-3"><option value="">كل الحالات</option>{[...STATUSES].map((value) => <option key={value}>{value}</option>)}</select><Button type="submit" variant="outline">تصفية</Button></form></div>
    <div className="space-y-4">{page.data.map((category) => <Card key={category.id}><CardHeader className="flex-row items-center justify-between"><CardTitle>{category.name}</CardTitle><Badge>{category.status}</Badge></CardHeader><CardContent className="flex items-center justify-between"><p className="text-sm">{category.slug} · {category.productCount} منتج</p><Button asChild variant="outline"><Link href={`/admin/commerce/categories/${category.id}`}>التفاصيل</Link></Button></CardContent></Card>)}</div>
    {page.pageInfo.nextCursor ? <Button asChild className="mt-6" variant="outline"><Link href={`?cursor=${encodeURIComponent(page.pageInfo.nextCursor)}`}>التالي</Link></Button> : null}
  </>;
}
