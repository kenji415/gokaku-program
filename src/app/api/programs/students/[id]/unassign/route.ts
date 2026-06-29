import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getStudentBasicInfo,
  unassignTeacherFromStudent,
} from "@/lib/student-basic-info";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = getStudentBasicInfo(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const removed = unassignTeacherFromStudent(id, session.id);
  if (!removed) {
    return NextResponse.json({ error: "Not assigned" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
