import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getStudentBasicInfo,
  patchStudentBasicInfo,
  type StudentBasicInfoInput,
} from "@/lib/student-basic-info";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const info = getStudentBasicInfo(id);
  if (!info) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(info);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const body = (await request.json()) as StudentBasicInfoInput;
  const existing = getStudentBasicInfo(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  patchStudentBasicInfo(id, body);
  return NextResponse.json(getStudentBasicInfo(id));
}
