import type { Role } from "@/lib/auth";
import NavLinks, { type NavGroup } from "./NavLinks";

const OWNER_NAV: NavGroup[] = [
  { label: "Overview", items: [{ href: "/", label: "Dashboard", icon: "dashboard" }] },
  {
    label: "Sales",
    items: [
      { href: "/pos", label: "Register", icon: "register" },
      { href: "/sales", label: "Transactions", icon: "sales" },
      { href: "/customers", label: "Credit Accounts", icon: "credit" },
    ],
  },
  {
    label: "Stock",
    items: [
      { href: "/products", label: "Products", icon: "products" },
      { href: "/inventory", label: "Inventory", icon: "inventory" },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/audit-log", label: "Audit Log", icon: "audit" },
      { href: "/scanner", label: "Scanner Check", icon: "scanner" },
    ],
  },
];

const CASHIER_NAV: NavGroup[] = [
  {
    label: "Sales",
    items: [
      { href: "/pos", label: "Register", icon: "register" },
      { href: "/sales", label: "Transactions", icon: "sales" },
      { href: "/customers", label: "Credit Accounts", icon: "credit" },
    ],
  },
];

function todayLabel() {
  return new Date().toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Signed-out pages render without the chrome (login is currently off).
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
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-sidebar px-3 py-5 text-white print:hidden">
        <div className="mb-7 flex items-center gap-3 px-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent font-serif text-lg font-bold text-sidebar">
            M
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Momikie&apos;s</div>
            <div className="text-xs text-white/55">General Merchandise</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks groups={role === "owner" ? OWNER_NAV : CASHIER_NAV} />
        </div>
        <div className="mt-4 border-t border-white/10 px-3 pt-4 text-xs text-white/55">
          Signed in as <span className="font-medium text-white/85">{name}</span>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-surface px-8 py-3 text-sm print:hidden">
          <span className="font-medium text-ink">Momikie&apos;s General Merchandise — Point of Sale</span>
          <span className="text-muted">{todayLabel()}</span>
        </header>
        <main className="min-w-0 flex-1 px-8 py-7 print:p-0">{children}</main>
      </div>
    </div>
  );
}
