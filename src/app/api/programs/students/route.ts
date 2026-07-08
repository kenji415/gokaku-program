import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createStudentBasicInfoTemplate,
  createStudentFromBasicInfo,
  getStudentBasicInfo,
  lookupStudentBasicInfoSummary,
  patchStudentBasicInfo,
  type StudentBasicInfoInput,
} from "@/lib/student-basic-info";
import { normalizeStudentName } from "@/lib/student-name";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  if (name !== null) {
    const summary = lookupStudentBasicInfoSummary(name);
    return NextResponse.json(summary);
  }

  return NextResponse.json(createStudentBasicInfoTemplate());
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as StudentBasicInfoInput;
  const name = normalizeStudentName(body.name ?? "");
  if (!name) {
    return NextResponse.json({ error: "氏名は必須です" }, { status: 400 });
  }

  const existing = lookupStudentBasicInfoSummary(name);
  if (existing) {
    return NextResponse.json(
      { error: "duplicate", student: existing },
      { status: 409 },
    );
  }

  const grade = body.grade?.trim() || "6年";
  const studentId = createStudentFromBasicInfo({
    name,
    gender: body.gender,
    grade,
    cramSchool: body.cramSchool,
    campus: body.campus,
    className: body.className,
    mockExamPattern: body.mockExamPattern,
    targetSchool: body.targetSchool,
    assignments: body.assignments,
  });

  if (body.classNameLocked) {
    patchStudentBasicInfo(studentId, { classNameLocked: true });
  }

  const info = getStudentBasicInfo(studentId);
  if (!info) {
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }

  return NextResponse.json(info);
}
