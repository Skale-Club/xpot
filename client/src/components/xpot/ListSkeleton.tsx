/** Placeholder rows while a list loads, so an empty state never flashes first (same look as Visits history). */
export function ListSkeleton({ rows = 4, rowClassName = "h-16 rounded-2xl", className = "space-y-2", testId }: {
  rows?: number;
  rowClassName?: string;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={className} aria-busy="true" data-testid={testId}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={`${rowClassName} animate-pulse`}
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        />
      ))}
    </div>
  );
}
