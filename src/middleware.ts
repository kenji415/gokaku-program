import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  parseSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth-session";
import { canViewTestSchedule } from "@/lib/test-schedule-access";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

function withRefreshedSession(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await parseSessionToken(token) : null;

  if (!session || !token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin") && session.role !== "admin") {
    const isTestSchedulePage =
      pathname === "/admin/tests" || pathname.startsWith("/admin/tests/");
    if (isTestSchedulePage && canViewTestSchedule(session)) {
      return withRefreshedSession(NextResponse.next(), token);
    }
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return withRefreshedSession(
      NextResponse.redirect(new URL("/maker", request.url)),
      token,
    );
  }

  return withRefreshedSession(NextResponse.next(), token);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
