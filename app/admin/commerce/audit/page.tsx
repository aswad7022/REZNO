import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { AdminCommerceDateFilterForm } from "@/features/commerce/components/admin-commerce-date-filter-form";
import {
  adminAuditNextHref,
  type AdminPageSearchParams,
  parseAdminAuditPageQuery,
} from "@/features/commerce/domain/admin-commerce-query";
import { listAdminCommerceAudit } from "@/features/commerce/services/admin-commerce-audit-service";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";

export default async function AdminCommerceAuditPage({ searchParams }: { searchParams: Promise<AdminPageSearchParams> }) {
  const query = parseAdminAuditPageQuery(await searchParams);
  const context = await requireAuthenticatedCommerceAdmin("AUDIT_LOG_VIEW");
  const page = await listAdminCommerceAudit(context, {
    action: query.action,
    adminUserId: query.adminUserId,
    cursor: query.cursor,
    from: query.from,
    limit: 30,
    targetId: query.targetId,
    targetType: query.targetType,
    to: query.to,
  });
  return <>
    <AdminPageHeader title="سجل إدارة التجارة" description="بيانات وصفية منقحة ومقسمة بمؤشر مربوط بالمشاهد ومحصورة دائمًا في commerce.*." />
    <AdminCommerceDateFilterForm
      className="mb-6 grid gap-2 md:grid-cols-4"
      dateFilters={[
        { initialCanonical: query.from?.toISOString(), label: "من", name: "from" },
        { initialCanonical: query.to?.toISOString(), label: "إلى", name: "to" },
      ]}
    >
      <Input name="action" defaultValue={query.action} placeholder="commerce.* action prefix" maxLength={120} />
      <Input name="targetType" defaultValue={query.targetType} placeholder="نوع الهدف" maxLength={80} />
      <Input name="targetId" defaultValue={query.targetId} placeholder="UUID الهدف" dir="ltr" />
      <Input name="adminUserId" defaultValue={query.adminUserId} placeholder="Admin User ID" dir="ltr" maxLength={200} />
      <Button type="submit">تصفية</Button>
    </AdminCommerceDateFilterForm>
    <div className="space-y-3">{page.data.map((entry) => <Card key={entry.id}>
      <CardHeader><CardTitle>{entry.action}</CardTitle></CardHeader>
      <CardContent className="text-sm"><p>{entry.targetType} · {entry.targetId}</p><p>{entry.admin.name} · {entry.createdAt}</p><pre className="mt-2 overflow-auto whitespace-pre-wrap">{JSON.stringify(entry.metadata, null, 2)}</pre></CardContent>
    </Card>)}</div>
    {page.pageInfo.nextCursor ? <Button asChild className="mt-6" variant="outline"><Link href={adminAuditNextHref(query, page.pageInfo.nextCursor)}>التالي</Link></Button> : null}
  </>;
}
