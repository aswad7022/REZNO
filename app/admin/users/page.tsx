import Link from "next/link";

import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { getAdminUsers } from "@/features/admin/services/admin-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdminUsersPage() {
  const users = await getAdminUsers();

  return (
    <>
      <AdminPageHeader
        title="المستخدمون"
        description="قائمة الأشخاص والعملاء وأعضاء الأنشطة المتاحين في النظام."
      />
      <div className="grid gap-3">
        {users.map((user) => (
          <Card key={user.id} className="border-primary/10">
            <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <Link
                  href={`/admin/users/${user.id}`}
                  className="font-semibold hover:text-primary"
                >
                  {user.displayName ??
                    [user.firstName, user.lastName].filter(Boolean).join(" ")}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {user.phone ?? "لا يوجد هاتف"} · {user.preferredLanguage}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={user.isOnboarded ? "default" : "secondary"}>
                  {user.isOnboarded ? "Onboarded" : "Pending"}
                </Badge>
                <Badge variant="secondary">{user.status}</Badge>
                {user.memberships.map((membership) => (
                  <Badge key={membership.id} variant="outline">
                    {membership.organization.name} / {membership.role.name}
                  </Badge>
                ))}
                <Button asChild size="sm" variant="outline">
                  <Link href={`/admin/users/${user.id}`}>إدارة</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
