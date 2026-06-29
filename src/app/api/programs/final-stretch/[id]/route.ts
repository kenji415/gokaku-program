import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getFinalStretchSheet,
  saveFinalStretchSheet,
  userCanAccessFinalStretchSheet,
  type FinalStretchColumnWidths,
  type FinalStretchMonthKey,
} from "@/lib/final-stretch";

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
    !userCanAccessFinalStretchSheet(
      id,
      session.id,
      session.memberRole,
      session.role,
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = getFinalStretchSheet(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    campus: string;
    policy: string;
    examDaySimulation: string;
    columnWidths?: FinalStretchColumnWidths;
    rows: {
      id: string;
      monthKey: FinalStretchMonthKey;
      rowIndex: number;
      measure: string;
      unitTheme: string;
      detail: string;
    }[];
  };

  saveFinalStretchSheet(id, {
    campus: body.campus ?? existing.campus,
    policy: body.policy ?? existing.policy,
    examDaySimulation: body.examDaySimulation ?? existing.examDaySimulation,
    columnWidths: body.columnWidths ?? existing.columnWidths,
    rows: body.rows ?? existing.rows,
  });

  return NextResponse.json({ ok: true });
}
