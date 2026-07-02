import { Bot, ShieldCheck } from "lucide-react";

import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminPermission } from "@/features/admin/services/admin-auth";

export default async function AdminSettingsPage() {
  await requireAdminPermission("SETTINGS_VIEW");

  return (
    <>
      <AdminPageHeader
        title="إعدادات المنصة"
        description="إعدادات تشغيلية آمنة بدون أسرار أو مزودات مدفوعة."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-5 text-primary" />
              حالة المساعد الذكي
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Badge variant="secondary">Local recommendation mode active</Badge>
            <p className="text-muted-foreground">
              لا يوجد مزود خارجي مفعّل. التوصيات تعتمد على بيانات السوق محليًا.
            </p>
          </CardContent>
        </Card>
        <Card className="border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              الأمان
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Badge variant="secondary">Admin allowlist via environment</Badge>
            <p className="text-muted-foreground">
              الوصول الإداري لا يُفتح لكل المستخدمين ولا يعتمد على أدوار عامة.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
