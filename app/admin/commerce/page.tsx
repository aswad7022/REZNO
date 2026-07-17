import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { requireAuthenticatedCommerceAdmin } from "@/features/commerce/services/authenticated-context";
import { listAdminStores } from "@/features/commerce/services/admin-store-query-service";

export default async function AdminCommercePage() {
  const context = await requireAuthenticatedCommerceAdmin("COMMERCE_STORES_VIEW");
  const queue = await listAdminStores(context, { limit: 10, status: "PENDING_REVIEW" });
  return <>
    <AdminPageHeader title="إدارة متاجر التجارة" description="مراجعة دورة حياة المتاجر فقط ضمن Gate 3A." />
    <p className="mb-4 text-sm">بانتظار المراجعة: {queue.pageInfo.total}</p>
    <Button asChild><Link href="/admin/commerce/stores?status=PENDING_REVIEW">فتح قائمة المتاجر</Link></Button>
  </>;
}
