import type { Role } from "@/lib/auth";
import NavLinks, { type NavItem } from "./NavLinks";

const OWNER_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/pos", label: "Register", icon: "register" },
  { href: "/sales", label: "Transactions", icon: "sales" },
  { href: "/products", label: "Products", icon: "products" },
  { href: "/inventory", label: "Inventory", icon: "inventory" },
  { href: "/scanner", label: "Scanner Check", icon: "scanner" },
  { href: "/audit-log", label: "Audit Log", icon: "audit" },
];

const CASHIER_NAV: NavItem[] = [
  { href: "/pos", label: "Register", icon: "register" },
  { href: "/sales", label: "Transactions", icon: "sales" },
];

// Signed-out pages (/login, /owner) render without the chrome.
export default function AppShell({
  role,
  name,
  children,
}: {
  role?: Role;
  name?: string;
  children: React.ReactNode;
}) {
  if (!role) return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-sidebar px-4 py-5 text-white print:hidden">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg font-bold text-sidebar">
            M
          </div>
          <div className="leading-tight">
            <div className="font-semibold">Momikie&apos;s</div>
            <div className="text-xs text-white/60">General Merchandise</div>
          </div>
        </div>
        <div className="flex-1">
          <NavLinks items={role === "owner" ? OWNER_NAV : CASHIER_NAV} />
        </div>
        <div className="border-t border-white/10 px-2 pt-4 text-sm text-white/70">{name}</div>
      </aside>
      <main className="min-w-0 flex-1 p-8 print:p-0">{children}</main>
    </div>
  );
}
