import Link from "next/link";
import type { ProductStatus, StoreStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { listAdminProducts } from "@/features/commerce/services/admin-product-service";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";

const PRODUCTS = new Set<ProductStatus>(["DRAFT", "PUBLISHED", "SUSPENDED", "ARCHIVED"]);
const STORES = new Set<StoreStatus>(["DRAFT", "PENDING_REVIEW", "ACTIVE", "REJECTED", "SUSPENDED", "ARCHIVED"]);

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const status = params.status && PRODUCTS.has(params.status as ProductStatus) ? params.status as ProductStatus : undefined;
  const storeStatus = params.storeStatus && STORES.has(params.storeStatus as StoreStatus) ? params.storeStatus as StoreStatus : undefined;
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_CATALOG_VIEW");
  const page = await listAdminProducts(context, { cursor: params.cursor, limit: 20, readinessIssue: booleanParam(params.readinessIssue), search: params.q, status, storeStatus, unsafeMedia: booleanParam(params.unsafeMedia) });
  return <>
    <AdminPageHeader title="مراقبة المنتجات" description="عرض إداري للهوية والجاهزية والوسائط الآمنة دون تعديل بيانات التاجر." />
    <form className="mb-6 grid gap-2 md:grid-cols-4"><Input name="q" defaultValue={params.q} placeholder="منتج أو متجر" maxLength={120} /><select name="status" defaultValue={status ?? ""} className="rounded-md border bg-background px-3"><option value="">كل حالات المنتج</option>{[...PRODUCTS].map((value) => <option key={value}>{value}</option>)}</select><select name="storeStatus" defaultValue={storeStatus ?? ""} className="rounded-md border bg-background px-3"><option value="">كل حالات المتجر</option>{[...STORES].map((value) => <option key={value}>{value}</option>)}</select><Button type="submit">تصفية</Button></form>
    <div className="space-y-4">{page.data.map((product) => <Card key={product.id}><CardHeader className="flex-row items-center justify-between"><CardTitle>{product.name}</CardTitle><Badge>{product.status}</Badge></CardHeader><CardContent className="flex items-center justify-between gap-4"><p className="text-sm">{product.organization.name} · {product.store.name} · {product.category.name} · {product.publicVisible ? "ظاهر" : "غير ظاهر"}</p><Button asChild variant="outline"><Link href={`/admin/commerce/products/${product.id}`}>التفاصيل</Link></Button></CardContent></Card>)}</div>
    {page.pageInfo.nextCursor ? <Button asChild className="mt-6" variant="outline"><Link href={`?cursor=${encodeURIComponent(page.pageInfo.nextCursor)}`}>التالي</Link></Button> : null}
  </>;
}
function booleanParam(value?: string) { return value === "true" ? true : value === "false" ? false : undefined; }
