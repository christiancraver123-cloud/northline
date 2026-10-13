// Shown while a page's data loads: the page's shape, not a spinner.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid gap-6">
      <div className="grid gap-2"><div className="skeleton h-11 w-72" /><div className="skeleton h-4 w-96 max-w-full" /></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[78px]" />)}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton aspect-[4/5]" />)}</div>
    </div>
  );
}
