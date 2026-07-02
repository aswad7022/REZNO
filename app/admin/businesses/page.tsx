import Link from "next/link";
import type { BusinessVertical, EntityStatus } from "@prisma/client";

import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { getAdminBusinesses } from "@/features/admin/services/admin-dashboard";
import { businessVerticals } from "@/features/businesses/config/verticals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default async function AdminBusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; vertical?: string; status?: string }>;
}) {
  const params = await searchParams;
  const vertical = businessVerticals.includes(params.vertical as BusinessVertical)
    ? (params.vertical as BusinessVertical)
    : undefined;
  const status =
    params.status === "ACTIVE" ||
    params.status === "INACTIVE" ||
    params.status === "ARCHIVED"
      ? (params.status as EntityStatus)
      : undefined;
  const businesses = await getAdminBusinesses({ q: params.q, vertical, status });

  return (
    <>
      <AdminPageHeader
        title="الأنشطة"
        description="بحث وتصفية جميع الأنشطة المسجلة في المنصة."
      />
      <Card className="mb-5 border-primary/10">
        <CardContent className="p-4">
          <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem_12rem_auto]">
            <Input name="q" defaultValue={params.q} placeholder="ابحث بالاسم" />
            <select
              name="vertical"
              defaultValue={vertical ?? ""}
              className="h-10 rounded-xl border bg-background px-3 text-sm"
            >
              <option value="">كل القطاعات</option>
              {businessVerticals.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={status ?? ""}
              className="h-10 rounded-xl border bg-background px-3 text-sm"
            >
              <option value="">كل الحالات</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
            <Button type="submit">تصفية</Button>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-3">
        {businesses.map((business) => {
          const owner = business.organizationMembers.find(
            (member) => member.role.systemRole === "OWNER",
          );
          return (
            <Card key={business.id} className="border-primary/10">
              <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <Link
                    href={`/admin/businesses/${business.id}`}
                    className="font-semibold hover:text-primary"
                  >
                    {business.name}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">
                    المالك:{" "}
                    {owner?.person.displayName ?? owner?.person.firstName ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {business._count.branches} فرع · {business._count.services} خدمة ·{" "}
                    {business._count.restaurantTables} طاولة ·{" "}
                    {business._count.menuItems} صنف
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{business.vertical}</Badge>
                  <Badge variant={business.isActive ? "default" : "secondary"}>
                    {business.status}
                  </Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/${business.slug}`} target="_blank">
                      الصفحة العامة
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
