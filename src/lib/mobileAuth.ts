import { NextResponse } from "next/server";
import { verifySessionToken, type SessionPayload } from "./auth";

// The mobile app has no cookie jar shared with the browser, so it carries the
// same signed session token as a Bearer header instead.
export async function getBearerSession(request: Request): Promise<SessionPayload | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifySessionToken(header.slice(7).trim());
}

// The app talks to the API from its own origin (and, for the web build, from
// a browser), so the mobile routes allow cross-origin calls. Safe here
// because they use a Bearer token, never cookies.
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// Runs the handler with the caller's session, or answers 401 so the app asks
// the person to sign in again (queued offline work is kept on the phone).
export async function withMobileSession(
  request: Request,
  handler: (session: SessionPayload) => Promise<NextResponse>
): Promise<NextResponse> {
  const session = await getBearerSession(request);
  if (!session) return json({ error: "Please sign in again." }, 401);
  return handler(session);
}
