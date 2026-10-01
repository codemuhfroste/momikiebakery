// Shown instantly while a page's data loads, so a click always gets a
// visible response.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-6 border-b border-line pb-5">
        <div className="skeleton h-7 w-48" />
        <div className="skeleton mt-2 h-4 w-80 max-w-full" />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-line bg-surface p-5">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton mt-3 h-7 w-32" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-line bg-surface p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton mb-3 h-5 last:mb-0" style={{ width: `${90 - i * 8}%` }} />
        ))}
      </div>
    </div>
  );
}
