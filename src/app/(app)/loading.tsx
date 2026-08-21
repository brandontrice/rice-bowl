import { Shell } from "@/components/ui/Shell";
import { Skeleton, SkeletonCard, SkeletonRows } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <Shell>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
      <SkeletonCard />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-seam bg-surface p-4">
          <Skeleton className="h-5 w-28" />
          <div className="mt-3">
            <SkeletonRows rows={8} />
          </div>
        </div>
        <div className="rounded-2xl border border-seam bg-surface p-4">
          <Skeleton className="h-5 w-28" />
          <div className="mt-3">
            <SkeletonRows rows={8} />
          </div>
        </div>
      </div>
    </Shell>
  );
}
