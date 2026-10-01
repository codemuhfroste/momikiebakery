"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS = {
  dashboard: "M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-3H4z",
  register: "M4 6h16v12H4zM4 10h16M8 15h3",
  sales: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  credit: "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15.5c.6-.3 1.3-.5 2-.5 3 0 6 2 6 5",
  products: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8",
  inventory: "M3 7h18M5 7v13h14V7M9 11h6",
  scanner: "M4 7V5h3M17 5h3v2M20 17v2h-3M7 19H4v-2M7 9v6M10 9v6M14 9v6M17 9v6",
  audit: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4",
};

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export default function NavLinks({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            {g.label}
          </div>
          <div className="flex flex-col gap-0.5">
            {g.items.map((n) => {
              const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm transition ${
                    active
                      ? "border-accent bg-white/10 font-medium text-white"
                      : "border-transparent text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-[18px] w-[18px] shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={ICONS[n.icon]} />
                  </svg>
                  {n.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
