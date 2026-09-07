import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  findOrCreateGuidancePolicySheet,
  userCanAccessGuidancePolicy,
} from "@/lib/guidance-policy";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    studentId?: string;
    subject?: string;
    teacherId?: string;
  };

  const studentId = body.studentId?.trim() ?? "";
  const subject = body.subject?.trim() ?? "";
  const teacherId = body.teacherId?.trim() ?? "";
  if (!studentId || !subject || !teacherId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
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

  const assignment = db
    .select({ teacherId: schema.studentAssignments.teacherId })
    .from(schema.studentAssignments)
    .where(
      and(
        eq(schema.studentAssignments.studentId, studentId),
        eq(schema.studentAssignments.subject, subject),
      ),
    )
    .get();

  const sheetTeacherId = assignment?.teacherId ?? teacherId;

  if (
    !userCanAccessGuidancePolicy(
      studentId,
      subject,
      sheetTeacherId,
      session.id,
      session.memberRole,
      session.role,
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sheet = findOrCreateGuidancePolicySheet({
    studentId,
    subject,
    teacherId: sheetTeacherId,
  });

  return NextResponse.json({ sheet });
}
