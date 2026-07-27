import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

type WorkspaceTone = "error" | "info" | "success" | "warning";

const toneClasses: Record<WorkspaceTone, string> = {
  error: "rezno-status-error",
  info: "rezno-status-info",
  success: "rezno-status-success",
  warning: "rezno-status-warning",
};

const toneIcons = {
  error: AlertCircle,
  info: Info,
  success: CheckCircle2,
  warning: ShieldAlert,
} satisfies Record<WorkspaceTone, typeof Info>;

export function WorkspaceState({
  children,
  className,
  description,
  title,
  tone = "info",
}: {
  children?: ReactNode;
  className?: string;
  description?: string;
  title: string;
  tone?: WorkspaceTone;
}) {
  const Icon = toneIcons[tone];

  return (
    <section
      className={cn(
        "rounded-2xl border p-4 shadow-[var(--shadow-soft)]",
        toneClasses[tone],
        className,
      )}
      role={tone === "error" ? "alert" : "status"}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-bold">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-6">{description}</p>
          ) : null}
          {children ? <div className="mt-3">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}

export function WorkspaceScrollRegion({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto overscroll-x-contain rounded-2xl border bg-card shadow-[var(--shadow-soft)] focus-visible:ring-3 focus-visible:ring-ring/45",
        className,
      )}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

export function WorkspaceMetricGrid({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  );
}
