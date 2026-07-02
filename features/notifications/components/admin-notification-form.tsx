"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAdminNotification } from "@/features/notifications/actions/admin-notifications";
import { initialAdminNotificationActionState } from "@/features/notifications/types";

export function AdminNotificationForm({
  businesses,
  users,
}: {
  businesses: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    createAdminNotification,
    initialAdminNotificationActionState,
  );

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="title">العنوان</Label>
        <Input id="title" name="title" required maxLength={160} />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="body">النص</Label>
        <textarea
          id="body"
          name="body"
          required
          maxLength={2000}
          className="min-h-28 w-full rounded-xl border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="audience">الجمهور</Label>
        <select
          id="audience"
          name="audience"
          className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
          defaultValue="ALL"
        >
          <option value="ALL">كل المستخدمين</option>
          <option value="CUSTOMERS">العملاء</option>
          <option value="BUSINESS_OWNERS">أصحاب الأنشطة</option>
          <option value="RESTAURANTS">المطاعم والكافيهات</option>
          <option value="BUSINESS">نشاط محدد</option>
          <option value="USER">مستخدم محدد</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="priority">الأولوية</Label>
        <select
          id="priority"
          name="priority"
          className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
          defaultValue="NORMAL"
        >
          <option value="NORMAL">عادي</option>
          <option value="IMPORTANT">مهم</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="businessId">نشاط محدد</Label>
        <select
          id="businessId"
          name="businessId"
          className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
          defaultValue=""
        >
          <option value="">بدون</option>
          {businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="recipientPersonId">مستخدم محدد</Label>
        <select
          id="recipientPersonId"
          name="recipientPersonId"
          className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
          defaultValue=""
        >
          <option value="">بدون</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={pending}>
          <Send />
          {pending ? "جارٍ الإرسال…" : "إرسال الإشعار"}
        </Button>
        {state.message ? (
          <p
            className={
              state.status === "error"
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
