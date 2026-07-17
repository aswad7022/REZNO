import Link from "next/link";
import type { StoreStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { parseCanonicalInstant } from "@/features/commerce/domain/admin-commerce";
import { listAdminStores } from "@/features/commerce/services/admin-store-query-service";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";

const STATUSES = new Set<StoreStatus>(["DRAFT", "PENDING_REVIEW", "ACTIVE", "REJECTED", "SUSPENDED", "ARCHIVED"]);

export default async function AdminStoresPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (key: string) => typeof params[key] === "string" ? params[key] : undefined;
  const rawStatus = one("status");
  const status = rawStatus && STATUSES.has(rawStatus as StoreStatus) ? rawStatus as StoreStatus : undefined;
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_STORES_VIEW");
  const page = await listAdminStores(context, {
    cursor: one("cursor"), limit: 20, publicVisible: bool(one("publicVisible")), readinessIssue: bool(one("readinessIssue")),
    search: one("q"), status, submittedFrom: parseCanonicalInstant(one("submittedFrom"), "submittedFrom"),
    submittedTo: parseCanonicalInstant(one("submittedTo"), "submittedTo"),
    updatedFrom: parseCanonicalInstant(one("updatedFrom"), "updatedFrom"), updatedTo: parseCanonicalInstant(one("updatedTo"), "updatedTo"),
  });
  return <>
    <AdminPageHeader title="متاجر التجارة" description="قائمة إدارية محدودة بعقود عرض منفصلة عن واجهة المالك." />
    <form className="mb-6 grid gap-2 md:grid-cols-3" method="get">
      <Input name="q" defaultValue={one("q")} placeholder="اسم المتجر أو النشاط" maxLength={120} />
      <select name="status" defaultValue={status ?? ""} className="rounded-md border bg-background px-3"><option value="">كل الحالات</option>{[...STATUSES].map((value) => <option key={value}>{value}</option>)}</select>
      <select name="readinessIssue" defaultValue={one("readinessIssue") ?? ""} className="rounded-md border bg-background px-3"><option value="">كل الجاهزية</option><option value="true">به مشكلة جاهزية</option><option value="false">جاهز</option></select>
      <Input name="submittedFrom" defaultValue={one("submittedFrom")} placeholder="submittedFrom ISO" dir="ltr" />
      <Input name="submittedTo" defaultValue={one("submittedTo")} placeholder="submittedTo ISO" dir="ltr" />
      <Button type="submit">تصفية</Button>
    </form>
    <div className="space-y-4">{page.data.map((store) => <Card key={store.id}><CardHeader className="flex-row items-center justify-between"><CardTitle>{store.name}</CardTitle><Badge>{store.status}</Badge></CardHeader><CardContent className="flex items-center justify-between gap-4"><p className="text-sm">{store.organization.name} · {store.publicVisible ? "ظاهر" : "غير ظاهر"}</p><Button asChild variant="outline"><Link href={`/admin/commerce/stores/${store.id}`}>التفاصيل</Link></Button></CardContent></Card>)}</div>
    {page.pageInfo.nextCursor ? <Button asChild className="mt-6" variant="outline"><Link href={`?${nextParams(params, page.pageInfo.nextCursor)}`}>التالي</Link></Button> : null}
  </>;
}

function bool(value?: string) { return value === "true" ? true : value === "false" ? false : undefined; }
function nextParams(params: Record<string, string | string[] | undefined>, cursor: string) { const output = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (typeof value === "string" && key !== "cursor") output.set(key, value); output.set("cursor", cursor); return output.toString(); }
