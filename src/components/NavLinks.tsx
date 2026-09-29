"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, string> = {
  dashboard: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10",
  register: "M4 6h16v12H4zM4 10h16M8 15h3",
  sales: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
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

export default function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 shrink-0"
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
    </nav>
  );
}
