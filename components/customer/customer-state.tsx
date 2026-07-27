import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  LoaderCircle,
  SearchX,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type CustomerStateTone =
  | "empty"
  | "error"
  | "info"
  | "loading"
  | "offline"
  | "permission"
  | "success";

const TONE_PRESENTATION: Record<
  CustomerStateTone,
  { icon: LucideIcon; surface: string }
> = {
  empty: {
    icon: SearchX,
    surface: "border-dashed border-primary/20 bg-card/82 text-primary",
  },
  error: {
    icon: AlertTriangle,
    surface: "border-destructive/30 bg-destructive/8 text-destructive",
  },
  info: {
    icon: CircleHelp,
    surface: "border-info/30 bg-info/8 text-info",
  },
  loading: {
    icon: LoaderCircle,
    surface: "border-primary/20 bg-primary/8 text-primary",
  },
  offline: {
    icon: WifiOff,
    surface: "border-warning/35 bg-warning/10 text-warning-text",
  },
  permission: {
    icon: ShieldAlert,
    surface: "border-warning/35 bg-warning/10 text-warning-text",
  },
  success: {
    icon: CheckCircle2,
    surface: "border-success/30 bg-success/8 text-success",
  },
};

export function CustomerState({
  action,
  className,
  description,
  reference,
  title,
  tone,
}: {
  action?: ReactNode;
  className?: string;
  description: string;
  reference?: string;
  title: string;
  tone: CustomerStateTone;
}) {
  const presentation = TONE_PRESENTATION[tone];
  const Icon = presentation.icon;
  const live = tone === "error" || tone === "offline" ? "assertive" : "polite";

  return (
    <Card
      aria-busy={tone === "loading" || undefined}
      aria-live={live}
      className={cn(
        "w-full min-w-0 max-w-full overflow-hidden border shadow-(--shadow-soft)",
        className,
      )}
      role={tone === "error" ? "alert" : "status"}
    >
      <CardContent className="flex min-h-72 min-w-0 flex-col items-center justify-center px-6 py-12 text-center">
        <span
          className={cn(
            "mb-5 grid size-14 place-items-center rounded-3xl border",
            presentation.surface,
          )}
        >
          <Icon
            aria-hidden="true"
            className={cn(
              "size-6",
              tone === "loading" && "animate-spin motion-reduce:animate-none",
            )}
          />
        </span>
        <h1 className="max-w-full text-balance text-xl font-bold tracking-tight">
          {title}
        </h1>
        <p className="mt-2 max-w-full text-pretty text-sm leading-7 break-words text-muted-foreground">
          {description}
        </p>
        {reference ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {reference}
          </p>
        ) : null}
        {action ? <div className="mt-6">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

export function CustomerStatusBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "error" | "info" | "success" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        tone === "error" && "rezno-status-error",
        tone === "info" && "rezno-status-info",
        tone === "success" && "rezno-status-success",
        tone === "warning" && "rezno-status-warning",
      )}
    >
      {children}
    </span>
  );
}
