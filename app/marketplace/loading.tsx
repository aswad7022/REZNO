import { PublicHeader } from "@/components/public-site/public-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function MarketplaceLoading() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main
        className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6 sm:py-14"
        aria-busy="true"
      >
        <div className="space-y-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-72 rounded-2xl" />
          ))}
        </div>
      </main>
    </div>
  );
}
