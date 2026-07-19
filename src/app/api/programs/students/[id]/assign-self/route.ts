import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { assignSelfToStudentSubject } from "@/lib/student-basic-info";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as { subject?: string; force?: boolean };
  const subject = body.subject?.trim() ?? "";

  if (!subject) {
    return NextResponse.json({ error: "科目が不正です" }, { status: 400 });
  }

  const result = assignSelfToStudentSubject(
    id,
    session.id,
    subject,
    body.force === true,
  );

  if (result.status === "not-found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (result.status === "taken") {
    return NextResponse.json(
      { error: "taken", teacherName: result.teacherName },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
