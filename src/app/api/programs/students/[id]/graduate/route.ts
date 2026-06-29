import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getStudentBasicInfo,
  graduateStudent,
} from "@/lib/student-basic-info";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "teacher") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const existing = getStudentBasicInfo(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.graduatedAt) {
    return NextResponse.json({ error: "Already graduated" }, { status: 409 });
  }

  const graduated = graduateStudent(id, session.id);
  if (!graduated) {
    return NextResponse.json({ error: "Cannot graduate" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
