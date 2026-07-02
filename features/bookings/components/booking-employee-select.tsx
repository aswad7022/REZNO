"use client";

import { CheckCircle2, Sparkles, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function BookingEmployeeSelect({
  employees,
  mode,
  selectedMemberId,
}: {
  employees: Array<{ id: string; name: string }>;
  mode: "OPTIONAL" | "REQUIRED";
  selectedMemberId?: string;
}) {
  const t = useTranslations("Bookings.employee");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const value =
    mode === "OPTIONAL" && !selectedMemberId
      ? "any"
      : selectedMemberId;

  function changeEmployee(nextValue: string) {
    const query = new URLSearchParams(searchParams.toString());
    if (nextValue === "any") {
      query.delete("memberId");
    } else {
      query.set("memberId", nextValue);
    }
    router.push(`${pathname}?${query.toString()}`);
  }

  return (
    <div className="space-y-3 rounded-3xl border border-primary/10 bg-muted/25 p-4">
      <Label
        className="flex items-center gap-2 text-base font-bold"
      >
        <UserRound className="size-4" />
        {t("label")}
      </Label>
      <p className="text-sm leading-6 text-muted-foreground">
        {t(mode === "OPTIONAL" ? "optionalHelp" : "requiredHelp")}
      </p>
      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        role="radiogroup"
        aria-label={t("label")}
      >
        {mode === "OPTIONAL" ? (
          <button
            type="button"
            role="radio"
            aria-checked={value === "any"}
            onClick={() => changeEmployee("any")}
            className={cn(
              "flex min-h-20 items-start gap-3 rounded-2xl border bg-card p-3 text-start shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/40",
              value === "any" &&
                "border-primary bg-primary/5 ring-2 ring-primary/20",
            )}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-semibold">
                {t("any")}
                {value === "any" ? (
                  <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                ) : null}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("recommended")}
              </span>
            </span>
          </button>
        ) : null}
        {employees.map((employee) => {
          const selected = value === employee.id;

          return (
            <button
              key={employee.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => changeEmployee(employee.id)}
              className={cn(
                "flex min-h-20 items-start gap-3 rounded-2xl border bg-card p-3 text-start shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/40",
                selected && "border-primary bg-primary/5 ring-2 ring-primary/20",
              )}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <UserRound className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold">
                  {employee.name}
                  {selected ? (
                    <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                  ) : null}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("availableHint")}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
