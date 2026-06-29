import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { teacherCanAccessSheet } from "@/lib/programs";
import {
  saveStudentTestResult,
  getRecentStudentTestResults,
  teacherCanAccessStudent,
  type StudentTestResultInput,
} from "@/lib/test-results";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    studentId: string;
    testScheduleId: string;
    sheetId?: string;
    result: StudentTestResultInput;
  };

  if (!body.studentId || !body.testScheduleId || !body.result) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const db = getDb();
  const student = db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(eq(schema.students.id, body.studentId))
    .get();
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const test = db
    .select({ id: schema.testSchedules.id })
    .from(schema.testSchedules)
    .where(eq(schema.testSchedules.id, body.testScheduleId))
    .get();
  if (!test) {
    return NextResponse.json({ error: "Test not found" }, { status: 404 });
  }

  if (session.role === "teacher") {
    const viaSheet =
      body.sheetId != null && teacherCanAccessSheet(body.sheetId, session.id);
    const viaStudent = teacherCanAccessStudent(session.id, body.studentId);
    if (!viaSheet && !viaStudent) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  saveStudentTestResult(body.studentId, body.testScheduleId, body.result);

  return NextResponse.json({
    ok: true,
    result: body.result,
    recentTestResults: getRecentStudentTestResults(body.studentId),
  });
}
