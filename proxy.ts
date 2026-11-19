import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth/token";

const AUTH_PAGES = new Set(["/login", "/register"]);

/**
 * Gate rute sebelum render:
 * - /dashboard tanpa sesi valid → /login
 * - /login & /register dengan sesi valid → /dashboard
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const user = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (!user && (pathname === "/dashboard" || pathname.startsWith("/dashboard/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && AUTH_PAGES.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Rute lain dibiarkan apa adanya.
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/login", "/register"],
};
