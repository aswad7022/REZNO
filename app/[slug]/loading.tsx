import { Skeleton } from "@/components/ui/skeleton";

export default function PublicBusinessLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6">
      <Skeleton className="aspect-[16/6] min-h-44 w-full rounded-2xl" />
      <div className="flex items-end gap-4">
        <Skeleton className="size-28 rounded-3xl" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-72 rounded-2xl" />
        ))}
      </div>
    </main>
  );
}
