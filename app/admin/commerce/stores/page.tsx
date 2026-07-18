import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { AdminCommerceDateFilterForm } from "@/features/commerce/components/admin-commerce-date-filter-form";
import {
  ADMIN_STORE_STATUSES,
  adminStoreNextHref,
  type AdminPageSearchParams,
  parseAdminStorePageQuery,
} from "@/features/commerce/domain/admin-commerce-query";
import { listAdminStores } from "@/features/commerce/services/admin-store-query-service";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";

export default async function AdminStoresPage({ searchParams }: { searchParams: Promise<AdminPageSearchParams> }) {
  const query = parseAdminStorePageQuery(await searchParams);
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_STORES_VIEW");
  const page = await listAdminStores(context, {
    cursor: query.cursor,
    limit: 20,
    publicVisible: query.publicVisible,
    readinessIssue: query.readinessIssue,
    search: query.q,
    status: query.status,
    submittedFrom: query.submittedFrom,
    submittedTo: query.submittedTo,
    updatedFrom: query.updatedFrom,
    updatedTo: query.updatedTo,
  });
  return <>
    <AdminPageHeader title="متاجر التجارة" description="قائمة إدارية محدودة بعقود عرض منفصلة عن واجهة المالك." />
    <AdminCommerceDateFilterForm
      className="mb-6 grid gap-2 md:grid-cols-3"
      dateFilters={[
        { initialCanonical: query.submittedFrom?.toISOString(), label: "مقدّم من", name: "submittedFrom" },
        { initialCanonical: query.submittedTo?.toISOString(), label: "مقدّم إلى", name: "submittedTo" },
        { initialCanonical: query.updatedFrom?.toISOString(), label: "محدّث من", name: "updatedFrom" },
        { initialCanonical: query.updatedTo?.toISOString(), label: "محدّث إلى", name: "updatedTo" },
      ]}
    >
      <Input name="q" defaultValue={query.q} placeholder="اسم المتجر أو النشاط" maxLength={120} />
      <select name="status" defaultValue={query.status ?? ""} className="rounded-md border bg-background px-3"><option value="">كل الحالات</option>{ADMIN_STORE_STATUSES.map((value) => <option key={value}>{value}</option>)}</select>
      <BooleanSelect name="readinessIssue" value={query.readinessIssue} trueLabel="به مشكلة جاهزية" falseLabel="جاهز" />
      <BooleanSelect name="publicVisible" value={query.publicVisible} trueLabel="ظاهر للعامة" falseLabel="غير ظاهر" />
      <Button type="submit">تصفية</Button>
    </AdminCommerceDateFilterForm>
    <div className="space-y-4">{page.data.map((store) => <Card key={store.id}>
      <CardHeader className="flex-row items-center justify-between"><CardTitle>{store.name}</CardTitle><Badge>{store.status}</Badge></CardHeader>
      <CardContent className="flex items-center justify-between gap-4"><p className="text-sm">{store.organization.name} · {store.publicVisible ? "ظاهر" : "غير ظاهر"}</p><Button asChild variant="outline"><Link href={`/admin/commerce/stores/${store.id}`}>التفاصيل</Link></Button></CardContent>
    </Card>)}</div>
    {page.pageInfo.nextCursor ? <Button asChild className="mt-6" variant="outline"><Link href={adminStoreNextHref(query, page.pageInfo.nextCursor)}>التالي</Link></Button> : null}
  </>;
}

function BooleanSelect({ falseLabel, name, trueLabel, value }: { falseLabel: string; name: string; trueLabel: string; value?: boolean }) {
  return <select name={name} defaultValue={value === undefined ? "" : String(value)} className="rounded-md border bg-background px-3"><option value="">الكل</option><option value="true">{trueLabel}</option><option value="false">{falseLabel}</option></select>;
}
