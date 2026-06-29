import type { SessionUser } from "@/lib/auth-session";

export function canViewTestSchedule(
  session: Pick<SessionUser, "role" | "memberRole"> | null | undefined,
): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  return session.memberRole === "校長" || session.memberRole === "社員";
}

export function canEditTestSchedule(
  session: Pick<SessionUser, "role"> | null | undefined,
): boolean {
  return session?.role === "admin";
}
