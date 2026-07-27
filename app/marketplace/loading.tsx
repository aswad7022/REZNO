import { PublicHeader } from "@/components/public-site/public-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function MarketplaceLoading() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <main
        id="main-content"
        className="rezno-premium-surface mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6 sm:py-14"
        aria-busy="true"
        data-customer-surface="marketplace-loading"
      >
        <span className="sr-only">Loading</span>
        <div className="mx-auto space-y-3 text-center">
          <Skeleton className="mx-auto h-5 w-28 rounded-full" />
          <Skeleton className="mx-auto h-12 w-full max-w-md" />
          <Skeleton className="mx-auto h-5 w-full max-w-xl" />
        </div>
        <Skeleton className="h-28 rounded-3xl" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-72 rounded-2xl" />
          ))}
        </div>
      </main>
    </div>
  );
}
