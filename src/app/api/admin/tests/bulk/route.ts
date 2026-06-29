import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bulkSaveTestSchedules } from "@/lib/tests";
import type { SpreadsheetRow } from "@/lib/test-schedule-utils";

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    rows: SpreadsheetRow[];
    deletedIds?: string[];
  };

  const rows = bulkSaveTestSchedules(body.rows ?? [], body.deletedIds ?? []);
  return NextResponse.json({ ok: true, rows });
}
