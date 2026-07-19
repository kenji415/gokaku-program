import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getCourseProposalSheetForUser,
  saveCourseProposalSheet,
  userCanAccessCourseProposalSheet,
  type CourseProposalSubjects,
  type CourseProposalSubject,
} from "@/lib/course-proposal";

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
    !userCanAccessCourseProposalSheet(
      id,
      session.id,
      session.memberRole,
      session.role,
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = getCourseProposalSheetForUser(
    id,
    session.id,
    session.memberRole,
    session.role,
  );
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    subjects: CourseProposalSubjects;
    subjectSlots: CourseProposalSubject[];
  };

  if (
    !body.subjects ||
    typeof body.subjects !== "object" ||
    !Array.isArray(body.subjectSlots)
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const saved = saveCourseProposalSheet(
    id,
    body.subjects,
    body.subjectSlots,
    {
      userId: session.id,
      memberRole: session.memberRole,
      accessRole: session.role,
    },
  );
  if (!saved) {
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  const sheet = getCourseProposalSheetForUser(
    id,
    session.id,
    session.memberRole,
    session.role,
  );
  if (!sheet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ sheet });
}
