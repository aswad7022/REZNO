"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import type {
  OutboundChannel,
  OutboundPreferencesDto,
} from "@/features/communications/domain/contracts";
import { campaignCategories, outboundChannels } from "@/features/communications/domain/contracts";
import { updateOutboundPreferencesAction } from "@/features/communications/actions/preferences";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function OutboundPreferences({ initial }: { initial: OutboundPreferencesDto }) {
  const t = useTranslations("Stage4Communications");
  const [value, setValue] = useState(initial);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function toggle(channel: OutboundChannel, category: (typeof campaignCategories)[number]) {
    setValue((current) => {
      const selected = new Set(current.categories[channel]);
      if (selected.has(category)) selected.delete(category);
      else selected.add(category);
      return {
        ...current,
        categories: {
          ...current.categories,
          [channel]: campaignCategories.filter((item) => selected.has(item)),
        },
      };
    });
  }

  return (
    <Card>
      <CardHeader><CardTitle>{t("outboundPreferences")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("outboundPreferencesDescription")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr><th className="p-2 text-start">{t("category")}</th>{outboundChannels.map((channel) => <th key={channel} className="p-2 text-start">{channel}<span className="block text-xs font-normal text-muted-foreground">{endpointLabel(value, channel, t)}</span></th>)}</tr></thead>
            <tbody>{campaignCategories.map((category) => (
              <tr key={category} className="border-t">
                <td className="p-2">{category}{category === "ACCOUNT" ? <span className="block text-xs text-muted-foreground">{t("mandatoryPreference")}</span> : null}</td>
                {outboundChannels.map((channel) => (
                  <td key={channel} className="p-2"><input aria-label={`${channel} ${category}`} type="checkbox" checked={value.categories[channel].includes(category)} onChange={() => toggle(channel, category)} /></td>
                ))}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <Button type="button" disabled={pending} onClick={() => startTransition(async () => {
          const result = await updateOutboundPreferencesAction({
            expectedVersion: value.version,
            idempotencyKey: crypto.randomUUID(),
            categories: value.categories,
          });
          if (!result.ok) return setMessage(t("requestFailed", { code: result.code }));
          setValue(result.data);
          setMessage(t("outboundPreferencesSaved"));
        })}>{t("saveOutboundPreferences")}</Button>
        {message ? <p role="status" className="text-sm">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
function endpointLabel(
  value: OutboundPreferencesDto,
  channel: OutboundChannel,
  t: ReturnType<typeof useTranslations<"Stage4Communications">>,
) {
  const endpoint = value.endpoints[channel];
  return endpoint.eligible
    ? t("endpointAvailable")
    : t("endpointUnavailable", { reason: endpoint.reason.toLowerCase().replaceAll("_", " ") });
}
