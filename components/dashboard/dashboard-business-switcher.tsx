"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { selectActiveBusiness } from "@/features/business-context/actions/select-active-business";

export function DashboardBusinessSwitcher({
  activeBusinessId,
  businesses,
}: {
  activeBusinessId?: string;
  businesses: Array<{ id: string; name: string }>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const next = `${pathname || "/business"}${queryString ? `?${queryString}` : ""}`;

  if (businesses.length <= 1) return null;

  return (
    <form action={selectActiveBusiness}>
      <input type="hidden" name="next" value={next} />
      <label className="sr-only" htmlFor="dashboard-business-switcher">
        النشاط النشط
      </label>
      <select
        id="dashboard-business-switcher"
        name="businessId"
        defaultValue={activeBusinessId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-9 max-w-36 rounded-xl border border-primary/15 bg-background px-2 text-sm font-medium text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring sm:max-w-48 sm:px-3"
      >
        {businesses.map((business) => (
          <option key={business.id} value={business.id}>
            {business.name}
          </option>
        ))}
      </select>
    </form>
  );
}
