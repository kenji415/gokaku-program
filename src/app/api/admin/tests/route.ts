import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canViewTestSchedule } from "@/lib/test-schedule-access";
import { createTestSchedule, listTestSchedules } from "@/lib/tests";

export async function GET() {
  const session = await getSession();
  if (!session || !canViewTestSchedule(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(listTestSchedules());
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const id = createTestSchedule(body);
  return NextResponse.json({ id });
}
