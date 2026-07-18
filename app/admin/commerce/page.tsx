import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { getAdminCommerceOverview } from "@/features/commerce/services/admin-commerce-overview-service";
import { requireAuthenticatedCommerceAdminHub } from "@/features/commerce/services/authenticated-context";

export default async function AdminCommercePage() {
  const context = await requireAuthenticatedCommerceAdminHub();
  const overview = await getAdminCommerceOverview(context);
  const cards = [
    overview.stores && { href: "/admin/commerce/stores", title: "المتاجر", value: `بانتظار المراجعة ${overview.stores.pendingReview} · معلقة ${overview.stores.suspended}` },
    overview.categories && { href: "/admin/commerce/categories", title: "الفئات", value: `نشطة ${overview.categories.active} · غير نشطة/مؤرشفة ${overview.categories.inactiveOrArchived}` },
    overview.products && { href: "/admin/commerce/products", title: "المنتجات", value: `معلقة ${overview.products.suspended}` },
    overview.inventory && { href: "/admin/commerce/inventory", title: "المخزون", value: `بحاجة متابعة ${overview.inventory.lowStock}` },
    overview.orders && { href: "/admin/commerce/orders", title: "الطلبات", value: `متأخرة ${overview.orders.overduePending} · فشل توصيل ${overview.orders.deliveryFailures}` },
    overview.audit && { href: "/admin/commerce/audit", title: "سجل التجارة", value: `إجراءات 7 أيام ${overview.audit.recentActions}` },
  ].filter(Boolean) as Array<{ href: string; title: string; value: string }>;
  return <>
    <AdminPageHeader title="عمليات إدارة التجارة" description={`نظرة تشغيلية مقيدة بالصلاحيات عند ${overview.evaluatedAt}.`} />
    <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => <Card key={card.href}><CardHeader><CardTitle>{card.title}</CardTitle></CardHeader><CardContent className="space-y-3"><p>{card.value}</p><Button asChild><Link href={card.href}>فتح</Link></Button></CardContent></Card>)}
    </section>
  </>;
}
