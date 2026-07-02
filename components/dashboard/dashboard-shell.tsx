import type { ReactNode } from "react";

import { DashboardPageMotion } from "@/components/dashboard/dashboard-page-motion";

export function DashboardShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <DashboardPageMotion className={className}>
      {children}
    </DashboardPageMotion>
  );
}

export function DashboardPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="bg-gradient-to-l from-slate-950 via-primary to-violet-700 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl dark:from-white dark:via-violet-200 dark:to-indigo-200">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
