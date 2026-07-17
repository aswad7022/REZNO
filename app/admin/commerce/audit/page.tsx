import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { parseCanonicalInstant } from "@/features/commerce/domain/admin-commerce";
import { listAdminCommerceAudit } from "@/features/commerce/services/admin-commerce-audit-service";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";

export default async function AdminCommerceAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams; const context = await requireAuthenticatedCommerceAdmin("AUDIT_LOG_VIEW");
  const page = await listAdminCommerceAudit(context, { action: params.action, adminUserId: params.adminUserId, cursor: params.cursor, from: parseCanonicalInstant(params.from, "from"), limit: 30, targetId: params.targetId, targetType: params.targetType, to: parseCanonicalInstant(params.to, "to") });
  return <><AdminPageHeader title="سجل إدارة التجارة" description="بيانات وصفية منقحة ومقسمة بمؤشر مربوط بالمشاهد." /><form className="mb-6 grid gap-2 md:grid-cols-4"><Input name="action" defaultValue={params.action} placeholder="الإجراء" /><Input name="targetType" defaultValue={params.targetType} placeholder="نوع الهدف" /><Input name="targetId" defaultValue={params.targetId} placeholder="UUID الهدف" dir="ltr" /><Button type="submit">تصفية</Button></form><div className="space-y-3">{page.data.map((entry) => <Card key={entry.id}><CardHeader><CardTitle>{entry.action}</CardTitle></CardHeader><CardContent className="text-sm"><p>{entry.targetType} · {entry.targetId}</p><p>{entry.admin.name} · {entry.createdAt}</p><pre className="mt-2 overflow-auto whitespace-pre-wrap">{JSON.stringify(entry.metadata, null, 2)}</pre></CardContent></Card>)}</div></>;
}
