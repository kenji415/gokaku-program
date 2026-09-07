import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  deleteGuidancePolicyMemo,
  getGuidancePolicySheet,
  updateGuidancePolicyMemo,
  userCanAccessGuidancePolicy,
} from "@/lib/guidance-policy";

type Params = { params: Promise<{ id: string; memoId: string }> };

async function requireAccessibleSheet(id: string, session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  const sheet = getGuidancePolicySheet(id);
  if (!sheet) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
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
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { sheet };
}

export async function PUT(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, memoId } = await params;
  const access = await requireAccessibleSheet(id, session);
  if ("error" in access && access.error) return access.error;

  const body = (await request.json()) as {
    memoDate?: string;
    body?: string;
  };

  const memo = updateGuidancePolicyMemo({
    sheetId: id,
    memoId,
    memoDate: body.memoDate ?? "",
    body: body.body ?? "",
  });
  if (!memo) {
    return NextResponse.json({ error: "Invalid memo" }, { status: 400 });
  }

  return NextResponse.json({ memo });
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, memoId } = await params;
  const access = await requireAccessibleSheet(id, session);
  if ("error" in access && access.error) return access.error;

  const ok = deleteGuidancePolicyMemo(id, memoId);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
