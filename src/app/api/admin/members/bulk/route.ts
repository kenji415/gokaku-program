import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bulkSaveMembers, type MemberInput } from "@/lib/members";
import { isMemberRole } from "@/lib/member-constants";

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    rows: MemberInput[];
    deletedIds?: string[];
  };

  try {
    const rows = (body.rows ?? []).map((row) => {
      if (!isMemberRole(row.memberRole)) {
        throw new Error(`不正な管理権限: ${row.memberRole}`);
      }
      return {
        ...row,
        memberRole: row.memberRole,
      };
    });

    const saved = bulkSaveMembers(rows, body.deletedIds ?? []);
    return NextResponse.json({ ok: true, rows: saved });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "保存に失敗しました",
      },
      { status: 400 },
    );
  }
}
