import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  updateAdminBusiness,
  updateAdminBusinessStatus,
  updateAdminBusinessVerification,
} from "@/features/admin/actions/manage-admin-entities";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { canAdmin } from "@/features/admin/services/admin-auth";
import { getAdminBusinessDetails } from "@/features/admin/services/admin-dashboard";
import { isRestaurantVertical } from "@/features/businesses/config/verticals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default async function AdminBusinessDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ adminAction?: string }>;
}) {
  const { id } = await params;
  const result = (await searchParams).adminAction;
  const [business, canManage, t, headerList] = await Promise.all([
    getAdminBusinessDetails(id),
    canAdmin("BUSINESSES_MANAGE"),
    getTranslations("Admin"),
    headers(),
  ]);
  if (!business) notFound();
  const restaurant = isRestaurantVertical(business.vertical);
  const owner = business.organizationMembers.find(
    (member) => member.role.systemRole === "OWNER",
  );
  const publicPath = `/${business.slug}`;
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const publicUrl = host ? `${protocol}://${host}${publicPath}` : publicPath;

  return (
    <>
      <AdminPageHeader
        title={business.name}
        description="تفاصيل النشاط للمتابعة والدعم بدون إجراءات مدمرة."
      />
      {result ? (
        <div
          className={
            result === "success"
              ? "mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              : "mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          }
        >
          {result === "success"
            ? "تم تنفيذ إجراء الإدارة بنجاح."
            : "تعذر تنفيذ الإجراء. تحقق من البيانات وحاول مرة أخرى."}
        </div>
      ) : null}
      <div className="mb-5 flex flex-wrap gap-2">
        <Badge variant="secondary">{business.vertical}</Badge>
        <Badge variant={business.isActive ? "default" : "secondary"}>
          {business.status}
        </Badge>
        <Badge variant={business.isVerified ? "default" : "outline"}>
          {business.isVerified ? "موثق" : "غير موثق"}
        </Badge>
        <Button asChild size="sm" variant="outline">
          <Link href={publicPath} target="_blank">
            {t("viewPublicPage")}
          </Link>
        </Button>
      </div>
      <Card className="mb-5 border-primary/10 bg-primary/5">
        <CardHeader>
          <CardTitle>{t("publicBusinessPage")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {t("businessSlug")}: <span dir="ltr">{business.slug}</span>
            </p>
            <Link
              className="mt-1 block break-all font-semibold text-primary underline-offset-4 hover:underline"
              href={publicPath}
              target="_blank"
            >
              {publicUrl}
            </Link>
          </div>
          <Button asChild size="sm">
            <Link href={publicPath} target="_blank">
              {t("viewPublicPage")}
            </Link>
          </Button>
        </CardContent>
      </Card>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="border-primary/10 lg:col-span-2">
          <CardHeader>
            <CardTitle>الملف والمالك</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>المالك: {owner?.person.displayName ?? owner?.person.firstName ?? "—"}</p>
            <p>التصنيف: {business.profile?.businessCategory ?? "—"}</p>
            <p>الهاتف: {business.profile?.businessPhone ?? "—"}</p>
            <p>الوصف: {business.profile?.description ?? "—"}</p>
          </CardContent>
        </Card>
        {canManage ? (
          <Card className="border-primary/10">
            <CardHeader>
              <CardTitle>إجراءات الحالة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <form action={updateAdminBusinessStatus.bind(null, business.id)}>
                <input
                  type="hidden"
                  name="status"
                  value={business.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"}
                />
                <Button
                  type="submit"
                  variant={
                    business.status === "ACTIVE" ? "destructive" : "default"
                  }
                  className="w-full"
                >
                  {business.status === "ACTIVE"
                    ? "تعليق النشاط"
                    : "إعادة تفعيل النشاط"}
                </Button>
              </form>
              <form
                action={updateAdminBusinessVerification.bind(null, business.id)}
              >
                <input
                  type="hidden"
                  name="verified"
                  value={business.isVerified ? "false" : "true"}
                />
                <Button type="submit" variant="outline" className="w-full">
                  {business.isVerified ? "إلغاء التوثيق" : "توثيق النشاط"}
                </Button>
              </form>
              <p className="text-xs text-muted-foreground">
                لا يتم حذف النشاط صلبًا. التعليق يوقف ظهوره واستخدامه بأمان.
              </p>
            </CardContent>
          </Card>
        ) : null}
        <Card className="border-primary/10">
          <CardHeader>
            <CardTitle>الأرقام</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="الفروع" value={business.branches.length} />
            <Stat label="الحجوزات" value={business.bookings.length} />
            <Stat label="المراجعات" value={business.reviews.length} />
            <Stat
              label={restaurant ? "الطاولات" : "الخدمات"}
              value={restaurant ? business.restaurantTables.length : business.services.length}
            />
          </CardContent>
        </Card>
      </div>
      {canManage ? (
        <Card className="mt-5 border-primary/10">
          <CardHeader>
            <CardTitle>تعديل بيانات آمنة</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={updateAdminBusiness.bind(null, business.id)}
              className="grid gap-4 md:grid-cols-2"
            >
            <Field label="اسم النشاط">
              <Input name="name" defaultValue={business.name} required />
            </Field>
            <Field label="الرابط العام">
              <Input value={business.slug} readOnly aria-readonly="true" />
            </Field>
            <Field label="القطاع">
              <select
                name="vertical"
                defaultValue={business.vertical}
                className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
              >
                {[
                  "BARBER",
                  "BEAUTY",
                  "CLINIC",
                  "DENTIST",
                  "SPA",
                  "GYM",
                  "CONSULTANT",
                  "RESTAURANT",
                  "CAFE",
                  "OTHER",
                ].map((vertical) => (
                  <option key={vertical} value={vertical}>
                    {vertical}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="تصنيف/وصف مختصر">
              <Input
                name="businessCategory"
                defaultValue={business.profile?.businessCategory ?? ""}
              />
            </Field>
            <Field label="هاتف التواصل">
              <Input
                name="businessPhone"
                defaultValue={business.profile?.businessPhone ?? ""}
              />
            </Field>
            <Field label="بريد النشاط">
              <Input
                name="businessEmail"
                type="email"
                defaultValue={business.profile?.businessEmail ?? ""}
              />
            </Field>
            <label className="flex items-center gap-2 rounded-xl border p-3 text-sm md:col-span-2">
              <input
                type="checkbox"
                name="marketplaceVisible"
                defaultChecked={business.settings?.marketplaceVisible ?? true}
              />
              ظاهر في السوق والصفحات العامة
            </label>
            <Field label="الوصف العام" className="md:col-span-2">
              <Textarea
                name="description"
                defaultValue={business.profile?.description ?? ""}
                rows={4}
              />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit">حفظ التعديلات</Button>
            </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ListCard
          title="الفروع"
          items={business.branches.map((branch) => ({
            id: branch.id,
            title: branch.name,
            meta: [branch.city, branch.status].filter(Boolean).join(" · "),
          }))}
        />
        {restaurant ? (
          <>
            <ListCard
              title="الطاولات"
              items={business.restaurantTables.map((table) => ({
                id: table.id,
                title: table.name,
                meta: `${table.capacity} أشخاص · ${table.isActive ? "نشطة" : "مخفية"}`,
              }))}
            />
            <ListCard
              title="القائمة"
              items={business.menuCategories.flatMap((category) =>
                category.items.map((item) => ({
                  id: item.id,
                  title: item.name,
                  meta: `${category.name} · ${Number(item.price).toLocaleString("ar-IQ")} ${item.currency}`,
                })),
              )}
            />
          </>
        ) : (
          <ListCard
            title="الخدمات"
            items={business.services.map((service) => ({
              id: service.id,
              title: service.name,
              meta: service.category.name,
            }))}
          />
        )}
        <ListCard
          title="آخر الحجوزات"
          items={business.bookings.map((booking) => ({
            id: booking.id,
            title: booking.serviceNameSnapshot,
            meta: `${booking.customerNameSnapshot} · ${booking.status}`,
          }))}
        />
      </div>
    </>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
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
  items: Array<{ id: string; title: string; meta: string }>;
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
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.meta}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
