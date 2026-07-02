import { Skeleton } from "@/components/ui/skeleton";

export function CustomerDiscoverySkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-64 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
