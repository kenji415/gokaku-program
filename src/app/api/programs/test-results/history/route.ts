import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getStudentTestResultHistory,
  teacherCanAccessStudent,
} from "@/lib/test-results";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId")?.trim() ?? "";
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  if (
    session.role === "teacher" &&
    !teacherCanAccessStudent(session.id, studentId)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    items: getStudentTestResultHistory(studentId),
  });
}
