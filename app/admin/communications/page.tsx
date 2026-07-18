import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/features/admin/components/admin-shell";
import { canAdmin, requireAdminPermission } from "@/features/admin/services/admin-auth";
import { CampaignEditor } from "@/features/communications/components/campaign-editor";
import { CommunicationDomainError } from "@/features/communications/domain/errors";
import { ManualDispatch } from "@/features/communications/components/manual-dispatch";
import { communicationAdminContext } from "@/features/communications/services/admin-actor";
import { getCampaignPage } from "@/features/communications/services/campaigns";

export default async function AdminCommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; status?: string }>;
}) {
  const access = await requireAdminPermission("NOTIFICATIONS_VIEW");
  const params = await searchParams;
  const status = typeof params.status === "string" && params.status.length > 0 ? params.status : null;
  const cursor = typeof params.cursor === "string" ? params.cursor : null;
  let page: Awaited<ReturnType<typeof getCampaignPage>>;
  let canSend: boolean;
  let canDispatch: boolean;
  try {
    [page, canSend, canDispatch] = await Promise.all([
      getCampaignPage(communicationAdminContext(access), {
        cursor,
        pageSize: 20,
        status,
      }),
      canAdmin("NOTIFICATIONS_SEND"),
      canAdmin("COMMUNICATIONS_DISPATCH"),
    ]);
  } catch (error) {
    if (error instanceof CommunicationDomainError && error.code === "INVALID_CURSOR") {
      return <InvalidCommunicationCursor />;
    }
    throw error;
  }

  return (
    <>
      <AdminPageHeader
        title="الاتصالات والتسليم الخارجي"
        description="حملات موحدة داخل التطبيق مع أساس تسليم خارجي آمن وقابل للتدقيق. قبول المزوّد لا يعني وصول الرسالة إلى إنسان."
      />
      {canDispatch ? <ManualDispatch /> : null}
      {canSend ? <div className="mt-6"><CampaignEditor /></div> : null}
      <Card className="mt-6 border-primary/10">
        <CardHeader><CardTitle>Campaign history</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {page.items.length === 0 ? <p className="text-sm text-muted-foreground">No campaigns yet.</p> : page.items.map((campaign) => (
            <article key={campaign.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link className="font-mono text-sm font-semibold underline" href={campaignDetailHref(campaign.id, status, cursor)}>{campaign.id}</Link>
                  <p className="mt-1 text-xs text-muted-foreground">{campaign.audience} · {campaign.category} · {campaign.channels.join(", ")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Created {campaign.createdAt}{campaign.scheduledAt ? ` · scheduled ${campaign.scheduledAt}` : ""}</p>
                </div>
                <Badge variant={campaign.status === "FAILED" ? "destructive" : "secondary"}>{campaign.status}</Badge>
              </div>
              <p className="mt-3 text-xs">Accepted {campaign.counts.accepted} · retry {campaign.counts.retryScheduled} · failed {campaign.counts.permanentFailure} · suppressed {campaign.counts.suppressed}</p>
            </article>
          ))}
          {page.nextCursor ? <Button asChild variant="outline"><Link href={campaignPageHref(page.nextCursor, status)}>Next page</Link></Button> : null}
        </CardContent>
      </Card>
    </>
  );
}

function InvalidCommunicationCursor() {
  return (
    <>
      <AdminPageHeader
        title="الاتصالات والتسليم الخارجي"
        description="حملات موحدة داخل التطبيق مع أساس تسليم خارجي آمن وقابل للتدقيق."
      />
      <Card className="border-destructive/20">
        <CardHeader><CardTitle>Communications reporting request was rejected safely.</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Refresh the current reporting scope and try again.</p>
        </CardContent>
      </Card>
    </>
  );
}

function campaignPageHref(cursor: string, status: string | null) {
  const query = new URLSearchParams({ cursor });
  if (status) query.set("status", status);
  return `/admin/communications?${query.toString()}`;
}

function campaignDetailHref(campaignId: string, status: string | null, cursor: string | null) {
  const query = new URLSearchParams();
  if (status) query.set("campaignStatus", status);
  if (cursor) query.set("campaignCursor", cursor);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `/admin/communications/${campaignId}${suffix}`;
}
