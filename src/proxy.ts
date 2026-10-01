import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Signed-out visitors go to /login. Cashiers only get the register,
// transactions, credit accounts and the scan lookup; everything else is
// owner-only (pages also check this themselves via rbac.ts).
const CASHIER_ALLOWED_PREFIXES = ["/pos", "/sales", "/customers", "/api/scan"];

export async function proxy(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  if (session.role === "cashier") {
    const { pathname } = request.nextUrl;
    const allowed = CASHIER_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!allowed) return NextResponse.redirect(new URL("/pos", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|owner|_next/static|_next/image|favicon.ico).*)"],
};
