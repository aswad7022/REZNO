import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

export function DashboardEmpty({
  action,
  description,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Card className="border-dashed border-primary/20 bg-card/70 shadow-none">
      <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
        <span className="mb-4 grid size-14 place-items-center rounded-3xl bg-primary/10 text-primary shadow-sm">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        {action ? <div className="mt-5">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
