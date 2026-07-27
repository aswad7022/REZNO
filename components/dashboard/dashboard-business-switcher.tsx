"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("Dashboard");
  const queryString = searchParams.toString();
  const next = `${pathname || "/business"}${queryString ? `?${queryString}` : ""}`;

  if (businesses.length <= 1) return null;

  return (
    <form
      action={selectActiveBusiness}
      className="w-28 min-w-0 shrink sm:w-48"
    >
      <input type="hidden" name="next" value={next} />
      <label className="sr-only" htmlFor="dashboard-business-switcher">
        {t("activeBusiness")}
      </label>
      <select
        id="dashboard-business-switcher"
        name="businessId"
        defaultValue={activeBusinessId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-11 w-full min-w-0 max-w-full rounded-xl border border-primary/15 bg-background px-2 text-sm font-medium text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
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
