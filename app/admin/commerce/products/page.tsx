import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { AdminCommerceDateFilterForm } from "@/features/commerce/components/admin-commerce-date-filter-form";
import {
  ADMIN_PRODUCT_STATUSES,
  ADMIN_STORE_STATUSES,
  adminProductNextHref,
  type AdminPageSearchParams,
  parseAdminProductPageQuery,
} from "@/features/commerce/domain/admin-commerce-query";
import { listAdminProducts } from "@/features/commerce/services/admin-product-service";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<AdminPageSearchParams> }) {
  const query = parseAdminProductPageQuery(await searchParams);
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_CATALOG_VIEW");
  const page = await listAdminProducts(context, {
    categoryId: query.categoryId,
    cursor: query.cursor,
    limit: 20,
    readinessIssue: query.readinessIssue,
    search: query.q,
    status: query.status,
    storeStatus: query.storeStatus,
    unsafeMedia: query.unsafeMedia,
    updatedFrom: query.updatedFrom,
    updatedTo: query.updatedTo,
  });
  return <>
    <AdminPageHeader title="مراقبة المنتجات" description="عرض إداري للهوية والجاهزية والوسائط الآمنة دون تعديل بيانات التاجر." />
    <AdminCommerceDateFilterForm
      className="mb-6 grid gap-2 md:grid-cols-4"
      dateFilters={[
        { initialCanonical: query.updatedFrom?.toISOString(), label: "محدّث من", name: "updatedFrom" },
        { initialCanonical: query.updatedTo?.toISOString(), label: "محدّث إلى", name: "updatedTo" },
      ]}
    >
      <Input name="q" defaultValue={query.q} placeholder="منتج أو متجر" maxLength={120} />
      <Select name="status" value={query.status} values={ADMIN_PRODUCT_STATUSES} label="كل حالات المنتج" />
      <Select name="storeStatus" value={query.storeStatus} values={ADMIN_STORE_STATUSES} label="كل حالات المتجر" />
      <Input name="categoryId" defaultValue={query.categoryId} placeholder="Category UUID" dir="ltr" />
      <BooleanSelect name="readinessIssue" value={query.readinessIssue} trueLabel="به مشكلة جاهزية" falseLabel="جاهز" />
      <BooleanSelect name="unsafeMedia" value={query.unsafeMedia} trueLabel="وسائط غير آمنة" falseLabel="وسائط آمنة" />
      <Button type="submit">تصفية</Button>
    </AdminCommerceDateFilterForm>
    <div className="space-y-4">{page.data.map((product) => <Card key={product.id}>
      <CardHeader className="flex-row items-center justify-between"><CardTitle>{product.name}</CardTitle><Badge>{product.status}</Badge></CardHeader>
      <CardContent className="flex items-center justify-between gap-4"><p className="text-sm">{product.organization.name} · {product.store.name} · {product.category.name} · {product.publicVisible ? "ظاهر" : "غير ظاهر"}</p><Button asChild variant="outline"><Link href={`/admin/commerce/products/${product.id}`}>التفاصيل</Link></Button></CardContent>
    </Card>)}</div>
    {page.pageInfo.nextCursor ? <Button asChild className="mt-6" variant="outline"><Link href={adminProductNextHref(query, page.pageInfo.nextCursor)}>التالي</Link></Button> : null}
  </>;
}

function Select<T extends string>({ label, name, value, values }: { label: string; name: string; value?: T; values: readonly T[] }) {
  return <select name={name} defaultValue={value ?? ""} className="rounded-md border bg-background px-3"><option value="">{label}</option>{values.map((item) => <option key={item}>{item}</option>)}</select>;
}

function BooleanSelect({ falseLabel, name, trueLabel, value }: { falseLabel: string; name: string; trueLabel: string; value?: boolean }) {
  return <select name={name} defaultValue={value === undefined ? "" : String(value)} className="rounded-md border bg-background px-3"><option value="">الكل</option><option value="true">{trueLabel}</option><option value="false">{falseLabel}</option></select>;
}
