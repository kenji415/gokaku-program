import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bulkSaveStudents } from "@/lib/students";
import type { StudentSpreadsheetRow } from "@/lib/student-spreadsheet-utils";

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    rows: StudentSpreadsheetRow[];
    deletedIds?: string[];
  };

  const rows = bulkSaveStudents(body.rows ?? [], body.deletedIds ?? []);
  return NextResponse.json({ ok: true, rows });
}
