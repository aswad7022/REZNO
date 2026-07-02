import { Skeleton } from "@/components/ui/skeleton";

export default function PublicProfileManagementLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-44 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}
