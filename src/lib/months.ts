import {
  COURSE_PROPOSAL_SEASON_LABELS,
  type CourseProposalSeason,
} from "./course-proposal-types";

export type MonthSlot = {
  index: number;
  yearMonth: string;
  monthLabel: string;
  timelineLabel: string;
};

export function parseYearMonth(value: string): { year: number; month: number } {
  const [y, m] = value.split("-").map(Number);
  return { year: y, month: m };
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftYearMonth(value: string, delta: number): string {
  const { year, month } = parseYearMonth(value);
  let y = year;
  let m = month + delta;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return formatYearMonth(y, m);
}

export function buildMonthSlots(startYearMonth: string): MonthSlot[] {
  const { year, month } = parseYearMonth(startYearMonth);
  const slots: MonthSlot[] = [];

  for (let i = 0; i < 6; i++) {
    let y = year;
    let m = month + i;
    while (m > 12) {
      m -= 12;
      y += 1;
    }

    const monthLabel =
      m === 8 ? "夏期講習" : `${m}月`;

    slots.push({
      index: i,
      yearMonth: formatYearMonth(y, m),
      monthLabel,
      timelineLabel: `${y}.${String(m).padStart(2, "0")}`,
    });
  }

  return slots;
}

export function studentHonorific(gender: string | null | undefined): string {
  if (gender === "女") return "さん";
  if (gender === "男") return "くん";
  return "";
}

export function formatStudentDisplayName(
  name: string,
  gender?: string | null,
): string {
  const suffix = studentHonorific(gender);
  return suffix ? `${name}${suffix}` : name;
}

export function buildPdfFilename(params: {
  studentName: string;
  gender?: string | null;
  subject: string;
  grade: string;
  startYearMonth: string;
  teacherName: string;
}): string {
  const { year, month } = parseYearMonth(params.startYearMonth);
  const displayName = formatStudentDisplayName(
    params.studentName,
    params.gender,
  );
  return `${displayName}_合格プログラムシート_${params.subject}_${params.grade}_${year}年${month}月_${params.teacherName.split(" ")[0] ?? params.teacherName}`;
}

export function buildFinalStretchPdfFilename(params: {
  studentName: string;
  gender?: string | null;
  subject: string;
  grade: string;
  teacherName: string;
}): string {
  const displayName = formatStudentDisplayName(
    params.studentName,
    params.gender,
  );
  return `${displayName}_直前期合格プログラムシート_${params.subject}_${params.grade}_${params.teacherName.split(" ")[0] ?? params.teacherName}`;
}

export function buildCourseProposalPdfFilename(params: {
  year: number;
  season: CourseProposalSeason;
  studentName: string;
  gender?: string | null;
}): string {
  const seasonLabel = COURSE_PROPOSAL_SEASON_LABELS[params.season];
  const displayName = formatStudentDisplayName(
    params.studentName,
    params.gender,
  );
  return `${params.year}年${seasonLabel}提案書 ${displayName}`;
}
