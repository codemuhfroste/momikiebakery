import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Signed-out visitors go to /login. Cashiers only get the register,
// transactions, credit accounts and the scan lookup; everything else is
// owner-only (pages also check this themselves via rbac.ts).
const CASHIER_ALLOWED_PREFIXES = ["/pos", "/sales", "/customers", "/api/scan"];
// Owner-only pages inside an allowed section.
const CASHIER_BLOCKED = ["/customers/new"];

export async function proxy(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  if (session.role === "cashier") {
    const { pathname } = request.nextUrl;
    const allowed = CASHIER_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!allowed || CASHIER_BLOCKED.includes(pathname)) return NextResponse.redirect(new URL("/pos", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skips the login pages, Next.js assets, and files from public/ (paths
  // ending in a file extension, e.g. /vidbg.mp4) so the login page's video
  // loads for signed-out visitors. The dot is written as [.] — a bare "."
  // would match any character and skip the guard on every page.
  matcher: ["/((?!login|owner|_next/static|_next/image|favicon.ico|.*[.][A-Za-z0-9]+$).*)"],
};
