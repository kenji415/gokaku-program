import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, type SessionUser } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { createBulkPdfExportStream } from "@/lib/bulk-pdf-spawn";
import { getBulkPdfStudentStatuses } from "@/lib/programs";
import { resolvePdfBaseUrl } from "@/lib/pdf-export";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 300;

type BulkPdfRequest = {
  startYearMonth: string;
  subject: string;
  studentIds: string[];
};

/** メーカー利用者（講師・メンバーアカウント）。管理者は role が admin になる */
function canUseBulkPdf(session: SessionUser): boolean {
  return session.role === "teacher" || Boolean(session.memberRole);
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseBulkPdf(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const startYearMonth = searchParams.get("startYearMonth")?.trim();
  const subject = searchParams.get("subject")?.trim();

  if (!startYearMonth || !subject) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const statuses = getBulkPdfStudentStatuses(
    session.id,
    startYearMonth,
    subject,
  );

  return NextResponse.json({ statuses });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canUseBulkPdf(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as BulkPdfRequest;
  const startYearMonth = body.startYearMonth?.trim();
  const subject = body.subject?.trim();
  const studentIds = [...new Set(body.studentIds ?? [])];

  if (!startYearMonth || !subject || studentIds.length === 0) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const teacher = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.id))
    .get();
  if (!teacher) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  const stream = createBulkPdfExportStream({
    startYearMonth,
    subject,
    studentIds,
    teacherId: session.id,
    teacherName: teacher.name,
    sessionToken,
    baseUrl: resolvePdfBaseUrl(request),
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
