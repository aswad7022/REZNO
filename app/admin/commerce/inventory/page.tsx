import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import {
  ADMIN_PRODUCT_STATUSES,
  ADMIN_VARIANT_STATUSES,
  adminInventoryNextHref,
  type AdminPageSearchParams,
  parseAdminInventoryPageQuery,
} from "@/features/commerce/domain/admin-commerce-query";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";
import { listAdminInventory } from "@/features/commerce/services/admin-inventory-service";

export default async function AdminInventoryPage({ searchParams }: { searchParams: Promise<AdminPageSearchParams> }) {
  const query = parseAdminInventoryPageQuery(await searchParams);
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_INVENTORY_VIEW");
  const page = await listAdminInventory(context, {
    availability: query.availability,
    cursor: query.cursor,
    limit: 20,
    lowStock: query.lowStock,
    organizationId: query.organizationId,
    productStatus: query.productStatus,
    query: query.q,
    reserved: query.reserved,
    storeId: query.storeId,
    variantStatus: query.variantStatus,
  });
  return <>
    <AdminPageHeader title="إشراف المخزون" description="مخزون متعدد المتاجر دون بيانات العملاء." />
    <form className="mb-6 grid gap-2 md:grid-cols-4" method="get">
      <Input name="q" defaultValue={query.q} placeholder="منتج أو متغير أو SKU" maxLength={120} />
      <Select name="availability" value={query.availability} values={["in_stock", "out_of_stock"]} label="كل التوفر" />
      <BooleanSelect name="lowStock" value={query.lowStock} trueLabel="منخفض" falseLabel="غير منخفض" />
      <BooleanSelect name="reserved" value={query.reserved} trueLabel="به حجز" falseLabel="دون حجز" />
      <Input name="organizationId" defaultValue={query.organizationId} placeholder="Organization UUID" dir="ltr" />
      <Input name="storeId" defaultValue={query.storeId} placeholder="Store UUID" dir="ltr" />
      <Select name="productStatus" value={query.productStatus} values={ADMIN_PRODUCT_STATUSES} label="كل حالات المنتج" />
      <Select name="variantStatus" value={query.variantStatus} values={ADMIN_VARIANT_STATUSES} label="كل حالات المتغير" />
      <Button type="submit">تصفية</Button>
    </form>
    <div className="space-y-4">{page.data.map((item) => <Card key={item.id}>
      <CardHeader className="flex-row justify-between"><CardTitle>{item.product.name}</CardTitle>{item.lowStock ? <Badge variant="destructive">منخفض</Badge> : null}</CardHeader>
      <CardContent className="flex items-center justify-between"><p>{item.variant.sku} · متاح {item.available} · محجوز {item.reserved}</p><Button asChild variant="outline"><Link href={`/admin/commerce/inventory/${item.id}`}>التفاصيل</Link></Button></CardContent>
    </Card>)}</div>
    {page.pageInfo.nextCursor ? <Button asChild className="mt-6" variant="outline"><Link href={adminInventoryNextHref(query, page.pageInfo.nextCursor)}>التالي</Link></Button> : null}
  </>;
}

function Select<T extends string>({ label, name, value, values }: { label: string; name: string; value?: T; values: readonly T[] }) {
  return <select name={name} defaultValue={value ?? ""} className="rounded-md border bg-background px-3"><option value="">{label}</option>{values.map((item) => <option key={item}>{item}</option>)}</select>;
}

function BooleanSelect({ falseLabel, name, trueLabel, value }: { falseLabel: string; name: string; trueLabel: string; value?: boolean }) {
  return <select name={name} defaultValue={value === undefined ? "" : String(value)} className="rounded-md border bg-background px-3"><option value="">الكل</option><option value="true">{trueLabel}</option><option value="false">{falseLabel}</option></select>;
}
