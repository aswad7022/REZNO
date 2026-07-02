import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  updateAdminUser,
  updateAdminUserStatus,
} from "@/features/admin/actions/manage-admin-entities";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import {
  canAdmin,
  getCurrentAdminAccess,
} from "@/features/admin/services/admin-auth";
import { getAdminUserDetails } from "@/features/admin/services/admin-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default async function AdminUserDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ adminAction?: string }>;
}) {
  const [{ id }, query, adminAccess, canManageUsers, t] = await Promise.all([
    params,
    searchParams,
    getCurrentAdminAccess(),
    canAdmin("USERS_MANAGE"),
    getTranslations("Admin"),
  ]);
  const user = await getAdminUserDetails(id);
  if (!user) notFound();

  const fullName =
    user.displayName ?? [user.firstName, user.lastName].filter(Boolean).join(" ");

  return (
    <>
      <AdminPageHeader
        title={fullName}
        description="إدارة بيانات المستخدم الأساسية وحالته بدون تغيير البريد أو كلمة المرور."
      />
      {query.adminAction ? (
        <div
          className={
            query.adminAction === "success"
              ? "mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              : "mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          }
        >
          {query.adminAction === "success"
            ? "تم تنفيذ إجراء الإدارة بنجاح."
            : "تعذر تنفيذ الإجراء. قد يكون الإجراء غير مسموح لهذا الحساب."}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        <Badge variant={user.status === "ACTIVE" ? "default" : "secondary"}>
          {user.status}
        </Badge>
        <Badge variant={user.isOnboarded ? "default" : "outline"}>
          {user.isOnboarded ? "مكتمل التسجيل" : "بانتظار الإكمال"}
        </Badge>
        <Badge variant="secondary">{user.preferredLanguage}</Badge>
        {adminAccess?.isSuperAdmin && user.authUser ? (
          <Button asChild size="sm" variant="outline">
            <Link
              href={`/admin/access?mode=add&userId=${user.authUser.id}#grant-admin`}
            >
              {user.authUser.adminAccess
                ? t("manageAdminAccess")
                : t("grantAdminAccess")}
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="border-primary/10 lg:col-span-2">
          <CardHeader>
            <CardTitle>الملف</CardTitle>
          </CardHeader>
          <CardContent>
            {canManageUsers ? (
              <form
                action={updateAdminUser.bind(null, user.id)}
                className="grid gap-4 md:grid-cols-2"
              >
                <Field label="الاسم الأول">
                  <Input name="firstName" defaultValue={user.firstName} required />
                </Field>
                <Field label="اسم العائلة">
                  <Input name="lastName" defaultValue={user.lastName ?? ""} />
                </Field>
                <Field label="اسم العرض">
                  <Input
                    name="displayName"
                    defaultValue={user.displayName ?? ""}
                  />
                </Field>
                <Field label="الهاتف">
                  <Input name="phone" defaultValue={user.phone ?? ""} />
                </Field>
                <div className="md:col-span-2">
                  <Button type="submit">حفظ بيانات المستخدم</Button>
                </div>
              </form>
            ) : (
              <div className="space-y-2 text-sm">
                <p>الاسم الأول: {user.firstName}</p>
                <p>اسم العائلة: {user.lastName ?? "—"}</p>
                <p>اسم العرض: {user.displayName ?? "—"}</p>
                <p>الهاتف: {user.phone ?? "—"}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {canManageUsers ? (
          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle>إجراءات الحالة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <form action={updateAdminUserStatus.bind(null, user.id)}>
                <input
                  type="hidden"
                  name="status"
                  value={user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"}
                />
                <Button
                  type="submit"
                  variant={user.status === "ACTIVE" ? "destructive" : "default"}
                  className="w-full"
                >
                  {user.status === "ACTIVE"
                    ? "تعليق المستخدم"
                    : "إعادة تفعيل المستخدم"}
                </Button>
              </form>
              <p className="text-xs text-muted-foreground">
                لا يمكن للمدير تعليق حسابه الحالي، ولا يتم حذف المستخدم صلبًا.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ListCard
          title="الأنشطة المرتبط بها"
          items={user.memberships.map((membership) => ({
            id: membership.id,
            title: membership.organization.name,
            meta: `${membership.role.name} · ${membership.organization.status}`,
            href: `/admin/businesses/${membership.organizationId}`,
          }))}
        />
        <Card className="border-primary/10">
          <CardHeader>
            <CardTitle>الأرقام</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="الحجوزات" value={user._count.customerBookings} />
            <Stat label="المراجعات" value={user._count.reviews} />
            <Stat label="المحادثات" value={user._count.customerConversations} />
            <Stat label="الإشعارات" value={user._count.notifications} />
          </CardContent>
        </Card>
        <ListCard
          title="آخر الحجوزات"
          items={user.customerBookings.map((booking) => ({
            id: booking.id,
            title: booking.serviceNameSnapshot,
            meta: `${booking.organization.name} · ${booking.status}`,
          }))}
        />
        <ListCard
          title="آخر الإشعارات"
          items={user.notifications.map((notification) => ({
            id: notification.id,
            title: notification.title,
            meta: notification.priority,
          }))}
        />
      </div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function ListCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; title: string; meta: string; href?: string }>;
}) {
  return (
    <Card className="border-primary/10">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد بيانات.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-2xl border p-3">
              {item.href ? (
                <Link href={item.href} className="font-medium hover:text-primary">
                  {item.title}
                </Link>
              ) : (
                <p className="font-medium">{item.title}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{item.meta}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
