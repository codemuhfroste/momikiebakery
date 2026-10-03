import { logoutAction } from "@/app/actions";
import type { Role } from "@/lib/auth";
import NavLinks, { type NavGroup } from "./NavLinks";
import SubmitButton from "./SubmitButton";
import { STAFF_SEES_OWNER_TABS } from "@/lib/demo";

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
    label: "Reports",
    items: [
      { href: "/reports", label: "End of Day", icon: "eod" },
      { href: "/reports/sales", label: "Sales Report", icon: "report" },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/audit-log", label: "Audit Log", icon: "audit" },
      { href: "/staff", label: "Staff", icon: "staff" },
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

// Demo (STAFF_SEES_OWNER_TABS): staff get every owner tab except the Audit Log.
const STAFF_DEMO_NAV: NavGroup[] = OWNER_NAV.map((g) => ({
  ...g,
  items: g.items.filter((i) => i.href !== "/audit-log" && i.href !== "/staff"),
})).filter((g) => g.items.length > 0);

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
    <div className="flex min-h-[calc(100dvh-var(--banner-h))]">
      <aside className="sticky top-[var(--banner-h)] flex h-[calc(100dvh-var(--banner-h))] w-60 shrink-0 flex-col bg-sidebar px-3 py-5 text-white print:hidden">
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
          <NavLinks groups={role === "owner" ? OWNER_NAV : STAFF_SEES_OWNER_TABS ? STAFF_DEMO_NAV : CASHIER_NAV} />
        </div>
        <form action={logoutAction} className="mt-4 border-t border-white/10 px-3 pt-4">
          <div className="text-xs text-white/55">
            Signed in as <span className="font-medium text-white/85">{name}</span>
          </div>
          <SubmitButton
            pendingLabel="Signing out…"
            className="mt-2 flex w-full items-center gap-2 rounded-md border border-white/15 px-3 py-1.5 text-left text-sm text-white/80 transition hover:bg-white/10 hover:text-white active:scale-[0.98]"
          >
            Sign out
          </SubmitButton>
        </form>
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
