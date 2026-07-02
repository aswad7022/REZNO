import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export function DashboardLoading() {
  return (
    <DashboardShell aria-busy="true">
      <div>
        <Skeleton className="h-9 w-52" />
        <Skeleton className="mt-2 h-5 w-full max-w-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="mt-3 h-4 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </DashboardShell>
  );
}
