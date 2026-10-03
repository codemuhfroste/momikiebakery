import { SHOW_DEMO_BANNER } from "@/lib/demo";

// Full-width notice across the top of every page while the site is used for
// the client demo. Turn off with SHOW_DEMO_BANNER in src/lib/demo.ts.
export default function DemoBanner() {
  if (!SHOW_DEMO_BANNER) return null;
  return (
    <div
      role="note"
      title="For demo purposes only. The data shown here is sample data and does not reflect real data from Momikie's General Merchandise."
      // Fixed height (= --banner-h set in layout.tsx) and pinned, so the
      // sidebar below can size itself to the rest of the screen.
      className="sticky top-0 z-40 flex h-[var(--banner-h)] items-center justify-center gap-2 overflow-hidden bg-amber-400 px-4 text-center text-sm text-amber-950 print:hidden"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
      <span className="truncate">
        <strong className="font-bold tracking-wide">FOR DEMO PURPOSES ONLY.</strong>{" "}
        <span className="hidden sm:inline">
          The data shown here is sample data and does not reflect real data from Momikie&apos;s General Merchandise.
        </span>
        <span className="sm:hidden">Sample data, not the store&apos;s real records.</span>
      </span>
    </div>
  );
}
