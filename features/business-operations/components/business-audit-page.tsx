import { ShieldCheck } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { currentBusinessOperationReference } from "@/features/business-operations/services/identity-adapter";
import { readBusinessAudit } from "@/features/business-operations/services/audit-view";

export async function BusinessAuditPage() {
  const [data, t, format] = await Promise.all([
    readBusinessAudit(await currentBusinessOperationReference("AUDIT_READ")),
    getTranslations("BusinessAudit"),
    getFormatter(),
  ]);
  return (
    <div className="space-y-5">
      <Card className="shadow-none">
        <CardContent className="pt-6 text-sm">
          <span className="text-muted-foreground">{t("activeBusiness")}:</span>{" "}
          <strong>{data.organizationName}</strong>
        </CardContent>
      </Card>
      {data.records.length ? (
        <div className="grid gap-3">
          {data.records.map((record) => (
            <Card key={record.id}>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  <span dir="ltr">{record.action}</span>
                </CardTitle>
                <Badge variant="outline">{record.targetType}</Badge>
              </CardHeader>
              <CardContent className="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
                <span>{format.dateTime(new Date(record.createdAt), { dateStyle: "medium", timeStyle: "medium" })}</span>
                <span>{t("actor")}: <span dir="ltr" className="font-mono">{record.actorMembershipId}</span></span>
                <span dir="ltr" className="font-mono">{record.targetId}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</CardContent></Card>
      )}
    </div>
  );
}
