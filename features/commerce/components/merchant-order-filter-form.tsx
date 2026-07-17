"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";
import {
  canonicalMerchantOrderTimestampToLocal,
  localMerchantOrderTimestampToCanonical,
  type MerchantOrderDateFilterKey,
} from "@/features/commerce/domain/merchant-order-filter-policy";

interface DateFilter {
  initialCanonical?: string;
  label: string;
  name: MerchantOrderDateFilterKey;
}

export function MerchantOrderFilterForm({
  children,
  dateFilters,
  invalidDateMessage,
}: {
  children: ReactNode;
  dateFilters: readonly DateFilter[];
  invalidDateMessage: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    for (const filter of dateFilters) {
      const visible = form.querySelector<HTMLInputElement>(`[data-order-date-local="${filter.name}"]`);
      if (visible) visible.value = canonicalMerchantOrderTimestampToLocal(filter.initialCanonical);
    }
  }, [dateFilters]);

  function submit(event: FormEvent<HTMLFormElement>) {
    for (const filter of dateFilters) {
      const visible = event.currentTarget.querySelector<HTMLInputElement>(`[data-order-date-local="${filter.name}"]`);
      const canonical = event.currentTarget.elements.namedItem(filter.name);
      if (!(visible instanceof HTMLInputElement) || !(canonical instanceof HTMLInputElement)) continue;
      visible.setCustomValidity("");
      if (!visible.value) {
        canonical.value = "";
        canonical.disabled = true;
        continue;
      }
      const converted = localMerchantOrderTimestampToCanonical(visible.value);
      if (!converted) {
        event.preventDefault();
        visible.setCustomValidity(invalidDateMessage);
        visible.reportValidity();
        return;
      }
      canonical.value = converted;
      canonical.disabled = false;
    }
  }

  return <form className="grid gap-3 md:grid-cols-3" method="get" onSubmit={submit} ref={formRef}>
    {children}
    {dateFilters.map((filter) => <label className="grid gap-1 text-sm" key={filter.name}>
      <span>{filter.label}</span>
      <Input
        data-order-date-local={filter.name}
        onChange={(event) => event.currentTarget.setCustomValidity("")}
        step="0.001"
        type="datetime-local"
      />
      <input defaultValue={filter.initialCanonical} disabled={!filter.initialCanonical} name={filter.name} type="hidden" />
    </label>)}
  </form>;
}
