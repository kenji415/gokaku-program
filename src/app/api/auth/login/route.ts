import { NextResponse } from "next/server";
import { verifyLogin } from "@/lib/auth";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth-session";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    loginId: string;
    password: string;
  };

  const user = verifyLogin(body.loginId, body.password);
  if (!user) {
    return NextResponse.json({ error: "ログインIDまたはパスワードが違います" }, { status: 401 });
  }

  const response = NextResponse.json({ user });
  response.cookies.set(
    SESSION_COOKIE_NAME,
    await createSessionToken(user),
    sessionCookieOptions(),
  );
  return response;
}
