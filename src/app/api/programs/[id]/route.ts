import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getProgramSheet,
  saveProgramSheet,
  teacherCanAccessSheet,
} from "@/lib/programs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const sheet = getProgramSheet(id);

  if (!sheet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    session.role === "teacher" &&
    !teacherCanAccessSheet(id, session.id)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ sheet });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (
    session.role === "teacher" &&
    !teacherCanAccessSheet(id, session.id)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    campus: string;
    goal: string;
    initialMockExams: string;
    initialChallenges: string;
    months: {
      id: string;
      monthTitle: string;
      content: string;
      testIds: string[];
    }[];
  };

  const existing = getProgramSheet(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  saveProgramSheet(id, {
    campus: body.campus ?? existing.campus,
    goal: body.goal ?? existing.goal,
    initialMockExams: body.initialMockExams ?? existing.initialMockExams,
    initialChallenges: body.initialChallenges ?? existing.initialChallenges,
    months: body.months,
  });
  return NextResponse.json({ ok: true });
}
