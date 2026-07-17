import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";
import { listAdminInventory } from "@/features/commerce/services/admin-inventory-service";

export default async function AdminInventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_INVENTORY_VIEW");
  const page = await listAdminInventory(context, { availability: params.availability as "in_stock" | "out_of_stock" | undefined, cursor: params.cursor, limit: 20, lowStock: bool(params.lowStock), query: params.q, reserved: bool(params.reserved) });
  return <><AdminPageHeader title="إشراف المخزون" description="مخزون متعدد المتاجر دون بيانات العملاء." /><form className="mb-6 flex flex-wrap gap-2"><Input name="q" defaultValue={params.q} placeholder="منتج أو متغير أو SKU" maxLength={120} /><select name="availability" defaultValue={params.availability ?? ""} className="rounded-md border bg-background px-3"><option value="">كل التوفر</option><option value="in_stock">متوفر</option><option value="out_of_stock">نافد</option></select><select name="lowStock" defaultValue={params.lowStock ?? ""} className="rounded-md border bg-background px-3"><option value="">كل المستويات</option><option value="true">منخفض</option><option value="false">غير منخفض</option></select><Button type="submit">تصفية</Button></form><div className="space-y-4">{page.data.map((item) => <Card key={item.id}><CardHeader className="flex-row justify-between"><CardTitle>{item.product.name}</CardTitle>{item.lowStock ? <Badge variant="destructive">منخفض</Badge> : null}</CardHeader><CardContent className="flex items-center justify-between"><p>{item.variant.sku} · متاح {item.available} · محجوز {item.reserved}</p><Button asChild variant="outline"><Link href={`/admin/commerce/inventory/${item.id}`}>التفاصيل</Link></Button></CardContent></Card>)}</div>{page.pageInfo.nextCursor ? <Button asChild className="mt-6" variant="outline"><Link href={`?cursor=${encodeURIComponent(page.pageInfo.nextCursor)}`}>التالي</Link></Button> : null}</>;
}
function bool(value?: string) { return value === "true" ? true : value === "false" ? false : undefined; }
