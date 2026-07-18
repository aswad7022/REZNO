import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { canAdmin, requireAdminPermission } from "@/features/admin/services/admin-auth";
import { CampaignEditor } from "@/features/communications/components/campaign-editor";
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
  const deliveryCursor = typeof query.deliveryCursor === "string"
    ? query.deliveryCursor
    : typeof query.cursor === "string" ? query.cursor : null;
  const deliveryStatus = typeof query.deliveryStatus === "string" && query.deliveryStatus.length > 0
    ? query.deliveryStatus
    : null;
  const deliveryId = typeof query.deliveryId === "string" ? query.deliveryId : null;
  const attemptCursor = typeof query.attemptCursor === "string" ? query.attemptCursor : null;
  const [campaign, deliveries, canSend] = await Promise.all([
    getCampaignDetail(context, campaignId),
    getDeliveryPage(context, {
      campaignId,
      cursor: deliveryCursor,
      pageSize: 20,
      status: deliveryStatus,
    }),
    canAdmin("NOTIFICATIONS_SEND"),
  ]);
  const attempts = deliveryId
    ? await getAttemptPage(context, { deliveryId, cursor: attemptCursor, pageSize: 20 })
    : null;

  return (
    <>
      <AdminPageHeader title="Campaign detail" description="Immutable snapshot, provider-acceptance reporting, and sanitized attempt evidence." />
      <Button asChild variant="outline" className="mb-4"><Link href={campaignBackHref(query.campaignStatus, query.campaignCursor)}>Back to campaigns</Link></Button>
      {canSend ? <CampaignEditor initial={campaign} /> : (
        <Card><CardContent className="pt-6"><p className="font-mono text-sm">{campaign.id}</p><Badge>{campaign.status}</Badge></CardContent></Card>
      )}
      <Card className="mt-6">
        <CardHeader><CardTitle>Outbound deliveries</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">No email, phone, token, raw payload, credential, or provider error is exposed.</p>
          {deliveries.items.map((delivery) => (
            <article key={delivery.id} className="rounded-xl border p-3 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-mono">{delivery.id}</span>
                <Badge variant={delivery.status === "PERMANENT_FAILURE" ? "destructive" : "secondary"}>{delivery.status}</Badge>
              </div>
              <p className="mt-2">Person {delivery.personId} · {delivery.channel} · locale {delivery.locale} · attempts {delivery.attemptCount}</p>
              <p className="mt-1">Provider {delivery.providerName ?? "—"} · code {delivery.safeProviderCode ?? "—"} · suppression {delivery.suppressionReason ?? "—"}</p>
              <Link className="mt-2 inline-block underline" href={detailPageHref(campaignId, {
                campaignCursor: query.campaignCursor,
                campaignStatus: query.campaignStatus,
                deliveryCursor,
                deliveryId: delivery.id,
                deliveryStatus,
              })}>Inspect sanitized attempts</Link>
            </article>
          ))}
          {deliveries.nextCursor ? <Button asChild variant="outline"><Link href={detailPageHref(campaignId, {
            attemptCursor,
            campaignCursor: query.campaignCursor,
            campaignStatus: query.campaignStatus,
            deliveryCursor: deliveries.nextCursor,
            deliveryId,
            deliveryStatus,
          })}>Next deliveries</Link></Button> : null}
        </CardContent>
      </Card>
      {attempts ? (
        <Card className="mt-6">
          <CardHeader><CardTitle>Delivery attempts</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {attempts.items.length === 0 ? <p className="text-sm text-muted-foreground">No provider call was made for this delivery.</p> : attempts.items.map((attempt) => (
              <article key={attempt.id} className="rounded-xl border p-3 text-xs">
                Attempt {attempt.attemptNumber} · {attempt.outcome ?? "IN_PROGRESS"} · {attempt.providerName ?? "—"} · {attempt.safeProviderCode ?? "—"} · retryable {String(attempt.retryable)}
              </article>
            ))}
            {attempts.nextCursor && deliveryId ? <Button asChild variant="outline"><Link href={detailPageHref(campaignId, {
              attemptCursor: attempts.nextCursor,
              campaignCursor: query.campaignCursor,
              campaignStatus: query.campaignStatus,
              deliveryCursor,
              deliveryId,
              deliveryStatus,
            })}>Next attempts</Link></Button> : null}
          </CardContent>
        </Card>
      ) : null}
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
