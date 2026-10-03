import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { STAFF_SEES_OWNER_TABS } from "@/lib/demo";

// Signed-out visitors go to /login. Cashiers only get the register,
// transactions, credit accounts, the scan lookup and product photos;
// everything else is owner-only (pages also check this via rbac.ts).
const CASHIER_ALLOWED_PREFIXES = ["/pos", "/sales", "/customers", "/api/scan", "/api/products"];
// Owner-only pages inside an allowed section.
const CASHIER_BLOCKED = ["/customers/new"];

export async function proxy(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  if (session.role === "cashier") {
    const { pathname } = request.nextUrl;
    // Demo: staff may open everything except the audit log.
    const allowed = STAFF_SEES_OWNER_TABS
      ? !(pathname === "/audit-log" || pathname.startsWith("/audit-log/"))
      : CASHIER_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) &&
        !CASHIER_BLOCKED.includes(pathname);
    if (!allowed) return NextResponse.redirect(new URL("/pos", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skips the login pages, Next.js assets, and files from public/ (paths
  // ending in a file extension, e.g. /newbgmomikie.mp4) so the login page's video
  // loads for signed-out visitors. The dot is written as [.] — a bare "."
  // would match any character and skip the guard on every page.
  matcher: ["/((?!login|owner|_next/static|_next/image|favicon.ico|.*[.][A-Za-z0-9]+$).*)"],
};
