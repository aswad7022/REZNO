"use client";

import { useState, useTransition } from "react";

import type {
  OutboundChannel,
  OutboundPreferencesDto,
} from "@/features/communications/domain/contracts";
import { campaignCategories, outboundChannels } from "@/features/communications/domain/contracts";
import { updateOutboundPreferencesAction } from "@/features/communications/actions/preferences";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function OutboundPreferences({ initial }: { initial: OutboundPreferencesDto }) {
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
      <CardHeader><CardTitle>Outbound channel preferences</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">These preferences belong to your Person profile and remain the same when you switch Businesses. Optional delivery requires explicit opt-in.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr><th className="p-2 text-start">Category</th>{outboundChannels.map((channel) => <th key={channel} className="p-2 text-start">{channel}<span className="block text-xs font-normal text-muted-foreground">{endpointLabel(value, channel)}</span></th>)}</tr></thead>
            <tbody>{campaignCategories.map((category) => (
              <tr key={category} className="border-t">
                <td className="p-2">{category}{category === "ACCOUNT" ? <span className="block text-xs text-muted-foreground">Mandatory Account events bypass opt-out only when a verified endpoint and provider exist.</span> : null}</td>
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
          if (!result.ok) return setMessage(`${result.code}: ${result.message}`);
          setValue(result.data);
          setMessage("Outbound preferences updated for future delivery eligibility.");
        })}>Save outbound preferences</Button>
        {message ? <p role="status" className="text-sm">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
function endpointLabel(value: OutboundPreferencesDto, channel: OutboundChannel) {
  const endpoint = value.endpoints[channel];
  return endpoint.eligible ? "verified endpoint available" : endpoint.reason.toLowerCase().replaceAll("_", " ");
}
