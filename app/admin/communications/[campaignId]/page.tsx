import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { canAdmin, requireAdminPermission } from "@/features/admin/services/admin-auth";
import { CampaignEditor } from "@/features/communications/components/campaign-editor";
import { CommunicationDomainError } from "@/features/communications/domain/errors";
import { communicationAdminContext } from "@/features/communications/services/admin-actor";
import { getCampaignDetail } from "@/features/communications/services/campaigns";
import { getAttemptPage, getDeliveryPage } from "@/features/communications/services/reporting";

export default async function AdminCommunicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{
    attemptCursor?: string;
    campaignCursor?: string;
    campaignStatus?: string;
    cursor?: string;
    deliveryCursor?: string;
    deliveryId?: string;
    deliveryStatus?: string;
  }>;
}) {
  const [{ campaignId }, query, access] = await Promise.all([
    params,
    searchParams,
    requireAdminPermission("NOTIFICATIONS_VIEW"),
  ]);
  const context = communicationAdminContext(access);
  const t = await getTranslations("Stage4Communications");
  const deliveryCursor = typeof query.deliveryCursor === "string"
    ? query.deliveryCursor
    : typeof query.cursor === "string" ? query.cursor : null;
  const deliveryStatus = typeof query.deliveryStatus === "string" && query.deliveryStatus.length > 0
    ? query.deliveryStatus
    : null;
  const deliveryId = typeof query.deliveryId === "string" ? query.deliveryId : null;
  const attemptCursor = typeof query.attemptCursor === "string" ? query.attemptCursor : null;
  let campaign: Awaited<ReturnType<typeof getCampaignDetail>>;
  let deliveries: Awaited<ReturnType<typeof getDeliveryPage>>;
  let canSend: boolean;
  let attempts: Awaited<ReturnType<typeof getAttemptPage>> | null;
  try {
    [campaign, deliveries, canSend] = await Promise.all([
      getCampaignDetail(context, campaignId),
      getDeliveryPage(context, {
        campaignId,
        cursor: deliveryCursor,
        pageSize: 20,
        status: deliveryStatus,
      }),
      canAdmin("NOTIFICATIONS_SEND"),
    ]);
    attempts = deliveryId
      ? await getAttemptPage(context, { deliveryId, cursor: attemptCursor, pageSize: 20 })
      : null;
  } catch (error) {
    if (error instanceof CommunicationDomainError && error.code === "INVALID_CURSOR") {
      return <InvalidCommunicationCursor />;
    }
    throw error;
  }

  return (
    <>
      <AdminPageHeader title={t("campaignDetail")} description={t("campaignDetailDescription")} />
      <Button asChild variant="outline" className="mb-4"><Link href={campaignBackHref(query.campaignStatus, query.campaignCursor)}>{t("backCampaigns")}</Link></Button>
      {canSend ? <CampaignEditor initial={campaign} /> : (
        <Card><CardContent className="pt-6"><p className="font-mono text-sm">{campaign.id}</p><Badge>{campaign.status}</Badge></CardContent></Card>
      )}
      <Card className="mt-6">
        <CardHeader><CardTitle>{t("outboundDeliveries")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("noContactExposed")}</p>
          {deliveries.items.map((delivery) => (
            <article key={delivery.id} className="rounded-xl border p-3 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-mono">{delivery.id}</span>
                <Badge variant={delivery.status === "PERMANENT_FAILURE" ? "destructive" : "secondary"}>{delivery.status}</Badge>
              </div>
              <p className="mt-2">{t("person")} {delivery.personId} · {delivery.channel} · {t("locale")} {delivery.locale} · {t("attempts")} {delivery.attemptCount}</p>
              <p className="mt-1">{t("provider")} {delivery.providerName ?? "—"} · {t("code")} {delivery.safeProviderCode ?? "—"} · {t("suppression")} {delivery.suppressionReason ?? "—"}</p>
              <Link className="mt-2 inline-block underline" href={detailPageHref(campaignId, {
                campaignCursor: query.campaignCursor,
                campaignStatus: query.campaignStatus,
                deliveryCursor,
                deliveryId: delivery.id,
                deliveryStatus,
              })}>{t("inspectAttempts")}</Link>
            </article>
          ))}
          {deliveries.nextCursor ? <Button asChild variant="outline"><Link href={detailPageHref(campaignId, {
            attemptCursor,
            campaignCursor: query.campaignCursor,
            campaignStatus: query.campaignStatus,
            deliveryCursor: deliveries.nextCursor,
            deliveryId,
            deliveryStatus,
          })}>{t("nextDeliveries")}</Link></Button> : null}
        </CardContent>
      </Card>
      {attempts ? (
        <Card className="mt-6">
          <CardHeader><CardTitle>{t("deliveryAttempts")}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {attempts.items.length === 0 ? <p className="text-sm text-muted-foreground">{t("noProviderCall")}</p> : attempts.items.map((attempt) => (
              <article key={attempt.id} className="rounded-xl border p-3 text-xs">
                {t("attempt")} {attempt.attemptNumber} · {attempt.outcome ?? "IN_PROGRESS"} · {attempt.providerName ?? "—"} · {attempt.safeProviderCode ?? "—"} · {t("retryable")} {String(attempt.retryable)}
              </article>
            ))}
            {attempts.nextCursor && deliveryId ? <Button asChild variant="outline"><Link href={detailPageHref(campaignId, {
              attemptCursor: attempts.nextCursor,
              campaignCursor: query.campaignCursor,
              campaignStatus: query.campaignStatus,
              deliveryCursor,
              deliveryId,
              deliveryStatus,
            })}>{t("nextAttempts")}</Link></Button> : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

async function InvalidCommunicationCursor() {
  const t = await getTranslations("Stage4Communications");
  return (
    <>
      <AdminPageHeader
        title={t("campaignDetail")}
        description={t("campaignDetailDescription")}
      />
      <Card className="border-destructive/20" data-stage4-communications-cursor-error="true">
        <CardHeader><CardTitle>{t("invalidTitle")}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("invalidDescription")}</p>
        </CardContent>
      </Card>
    </>
  );
}

type DetailQuery = {
  attemptCursor?: string | null;
  campaignCursor?: string | null;
  campaignStatus?: string | null;
  deliveryCursor?: string | null;
  deliveryId?: string | null;
  deliveryStatus?: string | null;
};

function detailPageHref(campaignId: string, values: DetailQuery) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) query.set(key, value);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `/admin/communications/${campaignId}${suffix}`;
}

function campaignBackHref(status?: string, cursor?: string) {
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (cursor) query.set("cursor", cursor);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `/admin/communications${suffix}`;
}
