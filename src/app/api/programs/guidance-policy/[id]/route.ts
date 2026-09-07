import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getGuidancePolicySheet,
  updateGuidancePolicyText,
  userCanAccessGuidancePolicy,
} from "@/lib/guidance-policy";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
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

  const body = (await request.json()) as { policyText?: string };
  const ok = updateGuidancePolicyText(id, body.policyText ?? "");
  if (!ok) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
