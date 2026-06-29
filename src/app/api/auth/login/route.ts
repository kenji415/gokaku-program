import { NextResponse } from "next/server";
import { setSessionCookie, verifyLogin } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    loginId: string;
    password: string;
  };

  const user = verifyLogin(body.loginId, body.password);
  if (!user) {
    return NextResponse.json({ error: "ログインIDまたはパスワードが違います" }, { status: 401 });
  }

  await setSessionCookie(user);
  return NextResponse.json({ user });
}
