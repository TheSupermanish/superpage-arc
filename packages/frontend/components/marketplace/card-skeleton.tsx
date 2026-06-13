/**
 * Loading placeholder that mirrors the ProductCard layout (4:3 cover, title,
 * meta, price chip). Uses the shared `.skeleton` shimmer from globals.css.
 */
export function CardSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl bg-card border border-border overflow-hidden">
      <div className="skeleton aspect-[4/3] w-full" />
      <div className="flex flex-col gap-2 p-4">
        <div className="skeleton h-4 w-4/5 rounded-md" />
        <div className="skeleton h-3 w-2/5 rounded-md" />
        <div className="mt-3 flex items-center justify-between">
          <div className="skeleton h-7 w-16 rounded-lg" />
          <div className="skeleton h-3 w-12 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** A grid of N card skeletons, used while the catalog is loading. */
export function CardSkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
