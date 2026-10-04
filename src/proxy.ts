import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getBearerSession } from "@/lib/mobileAuth";

// Signed-out visitors go to /login. Staff (cashier logins) may open every
// page except the Audit Log and staff accounts, which are the owner's (pages
// also check this via rbac.ts).
const OWNER_ONLY = ["/audit-log", "/staff"];

export async function proxy(request: NextRequest) {
  // Browsers ask permission (an OPTIONS "preflight") before sending the app's
  // Bearer header; that request carries no credentials by design.
  if (request.method === "OPTIONS") return NextResponse.next();
  // The website uses the session cookie; the mobile app sends the same
  // signed token as a Bearer header (e.g. when loading product photos).
  const session =
    (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) ?? (await getBearerSession(request));
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  if (session.role === "cashier") {
    const { pathname } = request.nextUrl;
    if (OWNER_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return NextResponse.redirect(new URL("/pos", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Skips the login pages, Next.js assets, and files from public/ (paths
  // ending in a file extension, e.g. /newbgmomikie.mp4) so the login page's video
  // loads for signed-out visitors. The dot is written as [.] — a bare "."
  // would match any character and skip the guard on every page.
  // /api/mobile/* is skipped too: those routes check the app's Bearer token
  // themselves (lib/mobileAuth.ts) and answer cross-origin preflights.
  matcher: ["/((?!login|owner|api/mobile|_next/static|_next/image|favicon.ico|.*[.][A-Za-z0-9]+$).*)"],
};
