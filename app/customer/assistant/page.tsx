import { Bot, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import {
  DashboardPageHeader,
  DashboardShell,
} from "@/components/dashboard/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerDiscoveryAssistant } from "@/features/ai/components/customer-discovery-assistant";
import { getAiGateBCapability } from "@/features/ai/gate-b";
import type { AiLocale } from "@/features/ai/contracts";
import { requireCustomerIdentity } from "@/features/identity/server";

const AI_FOUNDATION_ITEMS = [
  { icon: ShieldCheck, key: "safety" },
  { icon: LockKeyhole, key: "privacy" },
  { icon: Sparkles, key: "grounding" },
] as const;

export default async function CustomerAssistantPage() {
  await requireCustomerIdentity();
  const [t, locale] = await Promise.all([
    getTranslations("CustomerAssistant"),
    getLocale(),
  ]);
  const capability = getAiGateBCapability();

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("title")}
        description={t("description")}
        actions={<Badge variant="outline">{t("badge")}</Badge>}
      />
      {capability.enabled ? (
        <CustomerDiscoveryAssistant
          locale={toAiLocale(locale)}
          copy={{
            inputLabel: t("discovery.inputLabel"),
            inputPlaceholder: t("discovery.inputPlaceholder"),
            submit: t("discovery.submit"),
            cancel: t("discovery.cancel"),
            retry: t("discovery.retry"),
            loading: t("discovery.loading"),
            automated: t("discovery.automated"),
            citations: t("discovery.citations"),
            unavailable: t("discovery.unavailable"),
          }}
        />
      ) : (
        <DashboardEmpty
          icon={Bot}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {AI_FOUNDATION_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.key} className="border-primary/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="size-4 text-primary" />
                  {t(`foundation.${item.key}.title`)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {t(`foundation.${item.key}.description`)}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </DashboardShell>
  );
}

function toAiLocale(locale: string): AiLocale {
  return locale === "ar" || locale === "ckb" ? locale : "en";
}
