import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  findOrCreateProgramSheet,
  getAllTestsForYearMonths,
} from "@/lib/programs";
import { userCanViewProgramSheet } from "@/lib/teacher-overview";
import { buildMonthSlots } from "@/lib/months";
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
    startYearMonth: string;
  };

  if (
    session.role === "teacher" &&
    body.teacherId !== session.id &&
    session.memberRole !== "管理者" &&
    session.memberRole !== "校長"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
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

  const sheet = findOrCreateProgramSheet({
    studentId: body.studentId,
    subject: body.subject,
    teacherId: sheetTeacherId,
    startYearMonth: body.startYearMonth,
  });

  if (
    !userCanViewProgramSheet(
      sheet.id,
      session.id,
      session.memberRole,
      session.role,
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const student = db
    .select()
    .from(schema.students)
    .where(eq(schema.students.id, body.studentId))
    .get();

  const slots = buildMonthSlots(body.startYearMonth);
  const allTestsForMonth: Record<string, { id: string; displayText: string }[]> =
    student
      ? getAllTestsForYearMonths(slots.map((slot) => slot.yearMonth))
      : {};

  return NextResponse.json({ sheet, allTestsForMonth });
}
