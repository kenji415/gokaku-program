import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  findOrCreateCourseProposalSheet,
  getCourseProposalSheetForUser,
  isCourseProposalSeason,
} from "@/lib/course-proposal";
import { teacherCanAccessStudent } from "@/lib/test-results";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    studentId: string;
    teacherId: string;
    year: number;
    season: string;
  };

  const studentId = body.studentId?.trim() ?? "";
  const teacherId = body.teacherId?.trim() ?? "";
  const year = Number(body.year);
  const season = body.season?.trim() ?? "";

  if (!studentId || !teacherId || !Number.isFinite(year) || year < 2000) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!isCourseProposalSeason(season)) {
    return NextResponse.json({ error: "Invalid season" }, { status: 400 });
  }

  if (
    session.role === "teacher" &&
    teacherId !== session.id &&
    session.memberRole !== "管理者" &&
    session.memberRole !== "校長"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const student = db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(eq(schema.students.id, studentId))
    .get();

  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  if (
    session.role === "teacher" &&
    session.memberRole !== "管理者" &&
    session.memberRole !== "校長" &&
    !teacherCanAccessStudent(session.id, studentId)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sheet = findOrCreateCourseProposalSheet({
    studentId,
    teacherId,
    year,
    season,
  });

  const sheetForUser = getCourseProposalSheetForUser(
    sheet.id,
    session.id,
    session.memberRole,
    session.role,
  );
  if (!sheetForUser) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ sheet: sheetForUser });
}
