import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listMakerStudentSummaries } from "@/lib/programs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const includeGraduated = searchParams.get("includeGraduated") === "1";
  const graduatedOnly = searchParams.get("graduated") === "1";
  const teacherId = session.memberRole || session.role === "teacher"
    ? session.id
    : null;
  const students = listMakerStudentSummaries(teacherId, q, {
    includeGraduated,
    graduatedOnly,
  });

  return NextResponse.json({ students });
}
