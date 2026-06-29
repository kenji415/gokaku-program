import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./db/schema";
import {
  createSessionToken,
  parseSessionToken,
  SESSION_COOKIE_NAME,
  type SessionUser,
} from "./auth-session";
import { memberRoleToAccessRole, isMemberRole } from "./member-constants";

export type { SessionUser } from "./auth-session";

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return parseSessionToken(token);
}

export async function setSessionCookie(user: SessionUser) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, await createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export function verifyLogin(loginId: string, password: string): SessionUser | null {
  const db = getDb();
  const user = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.loginId, loginId))
    .get();

  if (!user || user.password !== password) return null;

  const memberRole = isMemberRole(user.memberRole ?? "")
    ? user.memberRole!
    : user.role === "admin"
      ? "管理者"
      : "社員";

  return {
    id: user.id,
    name: user.name,
    loginId: user.loginId,
    role: memberRoleToAccessRole(memberRole),
    memberRole,
  };
}
