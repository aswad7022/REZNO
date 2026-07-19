"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import type {
  CampaignDetailDto,
  CampaignLocalizedContent,
  CampaignSummaryDto,
  CommunicationLocale,
} from "@/features/communications/domain/contracts";
import { communicationLocales } from "@/features/communications/domain/contracts";
import {
  cancelCampaignAction,
  createCampaignAction,
  previewCampaignAudienceAction,
  scheduleCampaignAction,
  searchCommunicationTargetsAction,
  sendCampaignNowAction,
  updateCampaignAction,
} from "@/features/communications/actions/admin-communications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const emptyContent = (): CampaignLocalizedContent => ({
  AR: { inApp: { title: "", body: "" } },
  EN: { inApp: { title: "", body: "" } },
  CKB: { inApp: { title: "", body: "" } },
});

export function CampaignEditor({ initial }: { initial?: CampaignDetailDto }) {
  const t = useTranslations("Stage4Communications");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [campaign, setCampaign] = useState<CampaignSummaryDto | null>(initial ? {
    ...initial,
    kind: "CAMPAIGN_SUMMARY",
  } : null);
  const [audience, setAudience] = useState(initial?.audience ?? "ALL");
  const [targetPersonId, setTargetPersonId] = useState(initial?.targetPersonId ?? "");
  const [targetOrganizationId, setTargetOrganizationId] = useState(initial?.targetOrganizationId ?? "");
  const [channels, setChannels] = useState<string[]>(initial?.channels ?? ["IN_APP"]);
  const [category, setCategory] = useState(initial?.category ?? "ADMIN_ANNOUNCEMENT");
  const [priority, setPriority] = useState(initial?.priority ?? "NORMAL");
  const [mandatory, setMandatory] = useState(initial?.mandatory ?? false);
  const [destinationKind, setDestinationKind] = useState(initial?.destinationKind ?? "NOTIFICATIONS");
  const [content, setContent] = useState<CampaignLocalizedContent>(initial?.localizedContent ?? emptyContent());
  const [scheduleAt, setScheduleAt] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [targets, setTargets] = useState<Array<{ id: string; label: string }>>([]);

  const editable = !campaign || campaign.status === "DRAFT" || campaign.status === "SCHEDULED";
  const definition = () => ({
    audience,
    targetPersonId: audience === "USER" ? targetPersonId || null : null,
    targetOrganizationId: audience === "BUSINESS" ? targetOrganizationId || null : null,
    channels,
    category,
    priority,
    mandatory,
    destinationKind,
    destinationTargetId: null,
    localizedContent: content,
  });

  function save() {
    startTransition(async () => {
      const result = campaign
        ? await updateCampaignAction({
            ...definition(),
            campaignId: campaign.id,
            expectedVersion: campaign.version,
            idempotencyKey: crypto.randomUUID(),
          })
        : await createCampaignAction({
            ...definition(),
            idempotencyKey: crypto.randomUUID(),
          });
      if (!result.ok) return setMessage(t("requestFailed", { code: result.code }));
      setCampaign(result.data);
      setMessage(t("draftSaved"));
    });
  }

  function preview() {
    startTransition(async () => {
      const result = await previewCampaignAudienceAction({
        audience,
        targetPersonId: audience === "USER" ? targetPersonId || null : null,
        targetOrganizationId: audience === "BUSINESS" ? targetOrganizationId || null : null,
        channels,
        category,
        mandatory,
      });
      if (!result.ok) return setMessage(t("requestFailed", { code: result.code }));
      const summary = `${JSON.stringify(result.data.channels)}${result.data.tooLarge ? " · SAFE_LIMIT" : ""}`;
      setMessage(t("previewResult", { evaluated: result.data.evaluated, summary }));
    });
  }

  function schedule() {
    if (!campaign || !scheduleAt) return;
    startTransition(async () => {
      const result = await scheduleCampaignAction({
        campaignId: campaign.id,
        expectedVersion: campaign.version,
        idempotencyKey: crypto.randomUUID(),
        scheduledAt: new Date(scheduleAt).toISOString(),
      });
      if (!result.ok) return setMessage(t("requestFailed", { code: result.code }));
      setCampaign(result.data);
      setMessage(t("scheduleSaved"));
    });
  }

  function sendNow() {
    if (!campaign) return;
    startTransition(async () => {
      const result = await sendCampaignNowAction({
        campaignId: campaign.id,
        expectedVersion: campaign.version,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!result.ok) return setMessage(t("requestFailed", { code: result.code }));
      setCampaign(result.data);
      setMessage(t("snapshotCreated"));
    });
  }

  function cancel() {
    if (!campaign) return;
    startTransition(async () => {
      const result = await cancelCampaignAction({
        campaignId: campaign.id,
        expectedVersion: campaign.version,
        idempotencyKey: crypto.randomUUID(),
        reason: "Cancelled by an authorized Admin",
      });
      if (!result.ok) return setMessage(t("requestFailed", { code: result.code }));
      setCampaign(result.data);
      setMessage(t("campaignCancelled"));
    });
  }

  function searchTargets() {
    if (audience !== "USER" && audience !== "BUSINESS") return;
    startTransition(async () => {
      const result = await searchCommunicationTargetsAction({
        kind: audience,
        query: targetQuery,
        limit: 10,
      });
      if (!result.ok) return setMessage(t("requestFailed", { code: result.code }));
      setTargets(result.data);
    });
  }

  return (
    <Card className="border-primary/10">
      <CardHeader>
        <CardTitle>{campaign ? t("campaign", { id: campaign.id }) : t("newCampaign")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {campaign ? <p className="text-sm">{t.rich("statusVersion", {
          status: campaign.status,
          version: campaign.version,
        })}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("audience")}>
            <select aria-label={t("audience")} className="h-10 w-full rounded-md border bg-background px-3" value={audience} disabled={!editable} onChange={(event) => {
              setAudience(event.target.value as typeof audience);
              setDestinationKind("NOTIFICATIONS");
              setTargets([]);
            }}>
              {[
                "ALL", "CUSTOMERS", "BUSINESS_OWNERS", "RESTAURANTS", "BUSINESS", "USER",
              ].map((value) => <option key={value}>{value}</option>)}
            </select>
          </Field>
          <Field label={t("category")}>
            <select aria-label={t("category")} className="h-10 w-full rounded-md border bg-background px-3" value={category} disabled={!editable} onChange={(event) => {
              setCategory(event.target.value as typeof category);
              if (event.target.value !== "ACCOUNT") setMandatory(false);
            }}>
              {["BOOKINGS", "RESTAURANT", "COMMERCE", "MESSAGES", "ACCOUNT", "ADMIN_ANNOUNCEMENT"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </Field>
        </div>

        {audience === "USER" || audience === "BUSINESS" ? (
          <div className="space-y-2 rounded-xl border p-3">
            <Label htmlFor="communication-target-search">{t("targetSearch", { audience })}</Label>
            <div className="flex gap-2">
              <Input id="communication-target-search" value={targetQuery} onChange={(event) => setTargetQuery(event.target.value)} placeholder={t("targetPlaceholder")} />
              <Button type="button" variant="outline" onClick={searchTargets} disabled={pending || targetQuery.trim().length < 2}>{t("search")}</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {targets.map((target) => (
                <Button key={target.id} type="button" size="sm" variant="secondary" onClick={() => audience === "USER" ? setTargetPersonId(target.id) : setTargetOrganizationId(target.id)}>
                  {target.label}
                </Button>
              ))}
            </div>
            <p className="break-all text-xs text-muted-foreground">{t("selected", { id: audience === "USER" ? targetPersonId : targetOrganizationId })}</p>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label>{t("channels")}</Label>
          <div className="flex flex-wrap gap-4">
            {["IN_APP", "EMAIL", "SMS", "PUSH"].map((channel) => (
              <label key={channel} className="flex items-center gap-2 text-sm">
                <input aria-label={`${t("channels")} ${channel}`} type="checkbox" checked={channels.includes(channel)} disabled={!editable} onChange={(event) => setChannels((current) => event.target.checked ? [...current, channel] : current.filter((item) => item !== channel))} />
                {channel}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("outboundPolicy")}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("priority")}>
            <select aria-label={t("priority")} className="h-10 w-full rounded-md border bg-background px-3" value={priority} disabled={!editable} onChange={(event) => setPriority(event.target.value as typeof priority)}>
              <option>NORMAL</option><option>IMPORTANT</option>
            </select>
          </Field>
          <Field label={t("typedDestination")}>
            <select aria-label={t("typedDestination")} className="h-10 w-full rounded-md border bg-background px-3" value={destinationKind} disabled={!editable} onChange={(event) => setDestinationKind(event.target.value as typeof destinationKind)}>
              <option>NOTIFICATIONS</option>
              {audience === "USER" ? <><option>CUSTOMER_MESSAGES</option><option>CUSTOMER_ACCOUNT</option></> : null}
              {audience === "BUSINESS" ? <><option>BUSINESS_MESSAGES</option><option>BUSINESS_NOTIFICATIONS</option></> : null}
            </select>
          </Field>
          <label className="flex items-center gap-2 pt-7 text-sm">
            <input aria-label={t("mandatoryAccount")} type="checkbox" checked={mandatory} disabled={!editable || category !== "ACCOUNT"} onChange={(event) => setMandatory(event.target.checked)} />
            {t("mandatoryAccount")}
          </label>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          {communicationLocales.map((locale) => (
            <LocaleEditor key={locale} locale={locale} channels={channels} content={content} disabled={!editable} setContent={setContent} t={t} />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={save} disabled={pending || !editable}>{campaign ? t("saveVersion") : t("createDraft")}</Button>
          <Button type="button" variant="outline" onClick={preview} disabled={pending}>{t("previewAudience")}</Button>
          {campaign && editable ? <Button type="button" variant="secondary" onClick={sendNow} disabled={pending}>{t("sendNow")}</Button> : null}
          {campaign && editable ? <Button type="button" variant="destructive" onClick={cancel} disabled={pending}>{t("cancel")}</Button> : null}
        </div>
        {campaign && editable ? (
          <div className="space-y-2 rounded-xl border p-3">
            <Label htmlFor="scheduleAt">{t("persistSchedule")}</Label>
            <div className="flex flex-wrap gap-2">
              <Input id="scheduleAt" type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} className="max-w-sm" />
              <Button type="button" variant="outline" onClick={schedule} disabled={pending || !scheduleAt}>{t("schedule")}</Button>
            </div>
            <p className="text-xs text-amber-700">{t("noScheduler")}</p>
          </div>
        ) : null}
        {message ? <p aria-live="polite" role="status" className="rounded-xl bg-muted p-3 text-sm">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
function LocaleEditor({
  locale,
  channels,
  content,
  disabled,
  setContent,
  t,
}: {
  locale: CommunicationLocale;
  channels: string[];
  content: CampaignLocalizedContent;
  disabled: boolean;
  setContent: React.Dispatch<React.SetStateAction<CampaignLocalizedContent>>;
  t: ReturnType<typeof useTranslations<"Stage4Communications">>;
}) {
  const copy = content[locale];
  function update(section: "inApp" | "email" | "sms" | "push", field: string, value: string) {
    setContent((current) => ({
      ...current,
      [locale]: {
        ...current[locale],
        [section]: { ...(current[locale][section] ?? {}), [field]: value },
      },
    }));
  }
  return (
    <section className="space-y-3 rounded-xl border p-4" dir={locale === "EN" ? "ltr" : "rtl"}>
      <h3 className="font-semibold">{locale}</h3>
      {channels.includes("IN_APP") ? <>
        <Input aria-label={`${locale} ${t("inAppTitle")}`} placeholder={t("inAppTitle")} value={copy.inApp?.title ?? ""} disabled={disabled} onChange={(event) => update("inApp", "title", event.target.value)} />
        <Textarea aria-label={`${locale} ${t("inAppBody")}`} placeholder={t("inAppBody")} value={copy.inApp?.body ?? ""} disabled={disabled} onChange={(event) => update("inApp", "body", event.target.value)} />
      </> : null}
      {channels.includes("EMAIL") ? <>
        <Input aria-label={`${locale} ${t("emailSubject")}`} placeholder={t("emailSubject")} value={copy.email?.subject ?? ""} disabled={disabled} onChange={(event) => update("email", "subject", event.target.value)} />
        <Textarea aria-label={`${locale} ${t("emailBody")}`} placeholder={t("emailBody")} value={copy.email?.plainText ?? ""} disabled={disabled} onChange={(event) => update("email", "plainText", event.target.value)} />
      </> : null}
      {channels.includes("SMS") ? <Textarea aria-label={`${locale} ${t("smsText")}`} placeholder={t("smsText")} value={copy.sms?.text ?? ""} disabled={disabled} onChange={(event) => update("sms", "text", event.target.value)} /> : null}
      {channels.includes("PUSH") ? <>
        <Input aria-label={`${locale} ${t("pushTitle")}`} placeholder={t("pushTitle")} value={copy.push?.title ?? ""} disabled={disabled} onChange={(event) => update("push", "title", event.target.value)} />
        <Textarea aria-label={`${locale} ${t("pushBody")}`} placeholder={t("pushBody")} value={copy.push?.body ?? ""} disabled={disabled} onChange={(event) => update("push", "body", event.target.value)} />
      </> : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
