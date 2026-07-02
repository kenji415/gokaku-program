import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  canViewTeacherOverview,
  getFinalStretchTeacherOverview,
} from "@/lib/teacher-overview";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canViewTeacherOverview(session.memberRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teachers = getFinalStretchTeacherOverview(
    session.id,
    session.memberRole,
  );

  return NextResponse.json({ teachers, kind: "final-stretch" });
}
