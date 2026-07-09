import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createTestSchedule } from "@/lib/tests";
import { deriveScheduleFields, testDateInputAllowedForYearMonth } from "@/lib/test-schedule-utils";

const UNDATED_YEAR_MONTH = "1899-12";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    grade: string;
    yearMonth: string;
    testName: string;
    testDate?: string;
    cramSchool?: string;
  };

  const testName = body.testName?.trim();
  const cramSchool = body.cramSchool?.trim();
  if (
    !body.grade?.trim() ||
    !body.yearMonth?.trim() ||
    !testName ||
    !cramSchool
  ) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const derived = deriveScheduleFields(testName, body.testDate?.trim() ?? "");
  if (!derived.displayText) {
    return NextResponse.json({ error: "Invalid test name" }, { status: 400 });
  }

  const targetYearMonth = body.yearMonth.trim();
  if (
    body.testDate?.trim() &&
    !testDateInputAllowedForYearMonth(body.testDate, targetYearMonth)
  ) {
    return NextResponse.json(
      { error: "日付の月がこの月ボックスと一致しません" },
      { status: 400 },
    );
  }

  const yearMonth =
    derived.yearMonth !== UNDATED_YEAR_MONTH
      ? derived.yearMonth
      : targetYearMonth;

  if (yearMonth !== targetYearMonth) {
    return NextResponse.json(
      { error: "日付の月がこの月ボックスと一致しません" },
      { status: 400 },
    );
  }

  const id = createTestSchedule({
    cramSchool,
    grade: body.grade.trim(),
    testName,
    testDate: derived.testDate || undefined,
    displayText: derived.displayText,
    yearMonth,
    inTestCourse: false,
  });

  return NextResponse.json({
    id,
    displayText: derived.displayText,
    yearMonth,
    cramSchool,
  });
}
