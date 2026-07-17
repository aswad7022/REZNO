import Link from "next/link";
import type { StoreStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { listAdminStores } from "@/features/commerce/services/admin-store-query-service";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";

const STATUSES = new Set<StoreStatus>(["DRAFT", "PENDING_REVIEW", "ACTIVE", "REJECTED", "SUSPENDED", "ARCHIVED"]);

export default async function AdminStoresPage({ searchParams }: {
  searchParams: Promise<{ cursor?: string; q?: string; status?: string; submittedFrom?: string; submittedTo?: string }>;
}) {
  const params = await searchParams;
  const status = params.status && STATUSES.has(params.status as StoreStatus) ? params.status as StoreStatus : undefined;
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_STORES_VIEW");
  const submittedFrom = dateParam(params.submittedFrom);
  const submittedTo = dateParam(params.submittedTo, true);
  const page = await listAdminStores(context, { cursor: params.cursor, limit: 20, search: params.q, status, submittedFrom, submittedTo });
  return <>
    <AdminPageHeader title="متاجر التجارة" description="قائمة محدودة ومقسمة بمؤشر لمراجعة حالة المتاجر." />
    <form className="mb-6 flex flex-wrap gap-2" method="get">
      <Input name="q" defaultValue={params.q} placeholder="اسم المتجر أو النشاط" className="max-w-sm" />
      <select name="status" defaultValue={status ?? ""} className="rounded-md border bg-background px-3">
        <option value="">كل الحالات</option>
        {[...STATUSES].map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <Input name="submittedFrom" type="date" defaultValue={params.submittedFrom} aria-label="تاريخ الإرسال من" className="w-auto" />
      <Input name="submittedTo" type="date" defaultValue={params.submittedTo} aria-label="تاريخ الإرسال إلى" className="w-auto" />
      <Button type="submit">تصفية</Button>
    </form>
    <div className="space-y-4">
      {page.data.map((store) => <Card key={store.id}>
        <CardHeader className="flex-row items-center justify-between"><CardTitle>{store.name}</CardTitle><Badge>{store.status}</Badge></CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">{store.organization.name}</p>
          <Button asChild variant="outline"><Link href={`/admin/commerce/stores/${store.id}`}>التفاصيل</Link></Button>
        </CardContent>
      </Card>)}
      {page.data.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد متاجر مطابقة.</p> : null}
    </div>
    {page.pageInfo.nextCursor ? <Button asChild className="mt-6" variant="outline"><Link href={`/admin/commerce/stores?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(status ? { status } : {}), ...(params.submittedFrom ? { submittedFrom: params.submittedFrom } : {}), ...(params.submittedTo ? { submittedTo: params.submittedTo } : {}), cursor: page.pageInfo.nextCursor }).toString()}`}>التالي</Link></Button> : null}
  </>;
}

function dateParam(value: string | undefined, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
