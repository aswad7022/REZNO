import { CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BookingSlot } from "@/features/bookings/types";

export type BookingStepKey = "service" | "staff" | "time" | "confirm";
export type SlotPeriod = "morning" | "afternoon" | "evening";

export function BookingProgress({
  activeStep,
  labels,
  staffSkipped = false,
}: {
  activeStep: BookingStepKey;
  labels: Record<BookingStepKey, string>;
  staffSkipped?: boolean;
}) {
  const steps: BookingStepKey[] = ["service", "staff", "time", "confirm"];
  const activeIndex = steps.indexOf(activeStep);

  return (
    <nav aria-label={labels.confirm} className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-center gap-2 rounded-full border bg-card/80 p-1 shadow-sm">
        {steps.map((step, index) => {
          const complete = index < activeIndex || (step === "staff" && staffSkipped);
          const active = index === activeIndex;

          return (
            <li key={step} className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors",
                  active && "bg-primary text-primary-foreground shadow-sm",
                  complete && !active && "bg-primary/10 text-primary",
                  !active && !complete && "text-muted-foreground",
                )}
                aria-current={active ? "step" : undefined}
              >
                {complete ? (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                ) : (
                  <span className="grid size-5 place-items-center rounded-full bg-current/10 text-xs">
                    {index + 1}
                  </span>
                )}
                {labels[step]}
              </span>
              {index < steps.length - 1 ? (
                <span className="h-px w-5 bg-border" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function getSlotPeriod(startsAt: string, timeZone: string): SlotPeriod {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(new Date(startsAt)),
  );
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function groupSlotsByPeriod(slots: BookingSlot[], timeZone: string) {
  return (["morning", "afternoon", "evening"] as const)
    .map((period) => ({
      period,
      slots: slots.filter(
        (slot) => getSlotPeriod(slot.startsAt, timeZone) === period,
      ),
    }))
    .filter((group) => group.slots.length > 0);
}
