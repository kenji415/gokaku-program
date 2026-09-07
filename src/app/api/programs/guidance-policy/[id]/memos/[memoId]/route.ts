import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  deleteGuidancePolicyMemo,
  getGuidancePolicySheet,
  userCanAccessGuidancePolicy,
} from "@/lib/guidance-policy";

type Params = { params: Promise<{ id: string; memoId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, memoId } = await params;
  const sheet = getGuidancePolicySheet(id);
  if (!sheet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (
    !userCanAccessGuidancePolicy(
      sheet.studentId,
      sheet.subject,
      sheet.teacherId,
      session.id,
      session.memberRole,
      session.role,
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ok = deleteGuidancePolicyMemo(id, memoId);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
