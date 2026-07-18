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
  searchParams: Promise<{ cursor?: string; deliveryId?: string }>;
}) {
  const [{ campaignId }, query, access] = await Promise.all([
    params,
    searchParams,
    requireAdminPermission("NOTIFICATIONS_VIEW"),
  ]);
  const context = communicationAdminContext(access);
  const [campaign, deliveries, canSend] = await Promise.all([
    getCampaignDetail(context, campaignId),
    getDeliveryPage(context, {
      campaignId,
      cursor: typeof query.cursor === "string" ? query.cursor : null,
      pageSize: 20,
      status: null,
    }),
    canAdmin("NOTIFICATIONS_SEND"),
  ]);
  const attempts = query.deliveryId
    ? await getAttemptPage(context, { deliveryId: query.deliveryId, cursor: null, pageSize: 20 })
    : null;

  return (
    <>
      <AdminPageHeader title="Campaign detail" description="Immutable snapshot, provider-acceptance reporting, and sanitized attempt evidence." />
      <Button asChild variant="outline" className="mb-4"><Link href="/admin/communications">Back to campaigns</Link></Button>
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
              <Link className="mt-2 inline-block underline" href={`/admin/communications/${campaignId}?deliveryId=${delivery.id}`}>Inspect sanitized attempts</Link>
            </article>
          ))}
          {deliveries.nextCursor ? <Button asChild variant="outline"><Link href={`/admin/communications/${campaignId}?cursor=${encodeURIComponent(deliveries.nextCursor)}`}>Next deliveries</Link></Button> : null}
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
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
