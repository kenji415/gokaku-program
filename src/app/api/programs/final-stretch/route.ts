import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  findOrCreateFinalStretchSheet,
  isFinalStretchGrade,
  userCanAccessFinalStretchByStudentSubject,
} from "@/lib/final-stretch";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    studentId: string;
    subject: string;
    teacherId: string;
  };

  if (!body.studentId?.trim() || !body.subject?.trim()) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (
    session.role === "teacher" &&
    body.teacherId !== session.id &&
    session.memberRole !== "管理者" &&
    session.memberRole !== "校長"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const student = db
    .select()
    .from(schema.students)
    .where(eq(schema.students.id, body.studentId))
    .get();

  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  if (!isFinalStretchGrade(student.grade)) {
    return NextResponse.json({ error: "直前期シートは6年生のみです" }, { status: 400 });
  }

  const assignment = db
    .select({ teacherId: schema.studentAssignments.teacherId })
    .from(schema.studentAssignments)
    .where(
      and(
        eq(schema.studentAssignments.studentId, body.studentId),
        eq(schema.studentAssignments.subject, body.subject),
      ),
    )
    .get();

  const sheetTeacherId = assignment?.teacherId ?? body.teacherId;

  if (
    !userCanAccessFinalStretchByStudentSubject(
      body.studentId,
      body.subject,
      sheetTeacherId,
      session.id,
      session.memberRole,
      session.role,
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sheet = findOrCreateFinalStretchSheet({
    studentId: body.studentId,
    subject: body.subject,
    teacherId: sheetTeacherId,
  });

  return NextResponse.json({ sheet });
}
