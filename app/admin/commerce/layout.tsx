import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { AdminPermission } from "@/features/admin/config/permissions";
import { requireAuthenticatedCommerceAdminHub } from "@/features/commerce/services/authenticated-context";

const links: Array<[string, string, AdminPermission]> = [
  ["/admin/commerce/stores", "المتاجر", "COMMERCE_STORES_VIEW"],
  ["/admin/commerce/categories", "الفئات", "COMMERCE_CATALOG_VIEW"],
  ["/admin/commerce/products", "المنتجات", "COMMERCE_CATALOG_VIEW"],
  ["/admin/commerce/inventory", "المخزون", "COMMERCE_INVENTORY_VIEW"],
  ["/admin/commerce/orders", "الطلبات", "COMMERCE_ORDERS_VIEW"],
  ["/admin/commerce/audit", "سجل التجارة", "AUDIT_LOG_VIEW"],
];

export default async function AdminCommerceLayout({ children }: { children: React.ReactNode }) {
  const context = await requireAuthenticatedCommerceAdminHub();
  return <div dir="rtl">
    <nav aria-label="تنقل إدارة التجارة" className="mb-6 flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline"><Link href="/admin/commerce">الرئيسية</Link></Button>
      {links.filter(([, , permission]) => context.isSuperAdmin || context.permissions.includes(permission)).map(([href, label]) =>
        <Button asChild key={href} size="sm" variant="outline"><Link href={href}>{label}</Link></Button>)}
    </nav>
    {children}
  </div>;
}
