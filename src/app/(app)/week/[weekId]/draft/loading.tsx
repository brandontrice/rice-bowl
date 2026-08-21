import { Shell } from "@/components/ui/Shell";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";

export default function DraftLoading() {
  return (
    <Shell width="wide">
      <div className="rounded-2xl border border-seam bg-surface p-5 text-center">
        <Skeleton className="mx-auto h-3 w-28" />
        <Skeleton className="mx-auto mt-3 h-8 w-64" />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)_220px]">
        <div className="rounded-2xl border border-seam bg-surface p-3">
          <SkeletonRows rows={8} />
        </div>
        <div className="rounded-2xl border border-seam bg-surface p-3">
          <SkeletonRows rows={12} />
        </div>
        <div className="rounded-2xl border border-seam bg-surface p-3">
          <SkeletonRows rows={8} />
        </div>
      </div>
    </Shell>
  );
}
