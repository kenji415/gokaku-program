import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  canViewTeacherOverview,
  getTeacherOverview,
} from "@/lib/teacher-overview";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canViewTeacherOverview(session.memberRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const startYearMonth = searchParams.get("startYearMonth")?.trim();
  if (!startYearMonth) {
    return NextResponse.json({ error: "startYearMonth is required" }, { status: 400 });
  }

  const teachers = getTeacherOverview(
    session.id,
    session.memberRole,
    startYearMonth,
  );

  return NextResponse.json({ teachers, startYearMonth });
}
