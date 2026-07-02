import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isCourseProposalSeason } from "@/lib/course-proposal-types";
import {
  canViewTeacherOverview,
  getCourseProposalTeacherOverview,
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
  const year = Number(searchParams.get("year"));
  const season = searchParams.get("season")?.trim() ?? "";

  if (!Number.isFinite(year) || !isCourseProposalSeason(season)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const teachers = getCourseProposalTeacherOverview(
    session.id,
    session.memberRole,
    year,
    season,
  );

  return NextResponse.json({ teachers, kind: "course-proposal", year, season });
}
