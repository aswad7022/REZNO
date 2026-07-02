import { Skeleton } from "@/components/ui/skeleton";

export default function RootLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-12 sm:px-6">
      <Skeleton className="h-12 w-full max-w-xl" />
      <Skeleton className="h-6 w-full max-w-2xl" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-56 rounded-xl" />
        ))}
      </div>
    </main>
  );
}
