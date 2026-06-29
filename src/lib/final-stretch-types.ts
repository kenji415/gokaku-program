export const FINAL_STRETCH_MONTHS = [
  { key: "11", label: "11月" },
  { key: "12", label: "12月" },
  { key: "1", label: "1月" },
] as const;

export type FinalStretchMonthKey = (typeof FINAL_STRETCH_MONTHS)[number]["key"];

/** 月ごとの初期行数（11月6・12月7・1月8） */
export const FINAL_STRETCH_DEFAULT_ROW_COUNTS: Record<
  FinalStretchMonthKey,
  number
> = {
  "11": 6,
  "12": 7,
  "1": 8,
};

/** シート全体の最大行数（ロゴと重ならない上限） */
export const FINAL_STRETCH_MAX_TOTAL_ROWS = 25;

export function defaultRowCountForMonth(monthKey: FinalStretchMonthKey): number {
  return FINAL_STRETCH_DEFAULT_ROW_COUNTS[monthKey];
}

export function maxRowCountForMonth(monthKey: FinalStretchMonthKey): number {
  return FINAL_STRETCH_MAX_TOTAL_ROWS;
}

export function canAddFinalStretchRow(totalRowCount: number): boolean {
  return totalRowCount < FINAL_STRETCH_MAX_TOTAL_ROWS;
}

export type FinalStretchColumnWidths = {
  /** データ列エリア（月列除く）に対する対策列の割合（%） */
  measure: number;
  /** データ列エリアに対する単元列の割合（%） */
  unit: number;
  /** データ列エリアに対する対策詳細列の割合（%） */
  detail: number;
};

/** 旧CSS相当: 対策12%・単元16%・詳細残り（月列3.4%除く） */
export const DEFAULT_FINAL_STRETCH_COLUMN_WIDTHS: FinalStretchColumnWidths = {
  measure: 12.42,
  unit: 16.56,
  detail: 71.02,
};

export const FINAL_STRETCH_MONTH_COL_WIDTH = "8mm";
export const FINAL_STRETCH_MONTH_ADD_COL_WIDTH = "4.5mm";

export const FINAL_STRETCH_MIN_DATA_COL_PERCENT = 8;

export function normalizeFinalStretchColumnWidths(
  widths: FinalStretchColumnWidths,
): FinalStretchColumnWidths {
  const sum = widths.measure + widths.unit + widths.detail;
  if (!Number.isFinite(sum) || sum <= 0) {
    return { ...DEFAULT_FINAL_STRETCH_COLUMN_WIDTHS };
  }
  const normalized = {
    measure: (widths.measure / sum) * 100,
    unit: (widths.unit / sum) * 100,
    detail: (widths.detail / sum) * 100,
  };
  const min = FINAL_STRETCH_MIN_DATA_COL_PERCENT;
  if (
    normalized.measure < min ||
    normalized.unit < min ||
    normalized.detail < min
  ) {
    return { ...DEFAULT_FINAL_STRETCH_COLUMN_WIDTHS };
  }
  return normalized;
}

export function parseFinalStretchColumnWidths(
  raw: string | null | undefined,
): FinalStretchColumnWidths {
  if (!raw?.trim()) return { ...DEFAULT_FINAL_STRETCH_COLUMN_WIDTHS };
  try {
    const parsed = JSON.parse(raw) as Partial<FinalStretchColumnWidths>;
    if (
      typeof parsed.measure === "number" &&
      typeof parsed.unit === "number" &&
      typeof parsed.detail === "number"
    ) {
      return normalizeFinalStretchColumnWidths({
        measure: parsed.measure,
        unit: parsed.unit,
        detail: parsed.detail,
      });
    }
  } catch {
    // ignore invalid JSON
  }
  return { ...DEFAULT_FINAL_STRETCH_COLUMN_WIDTHS };
}

export function toFinalStretchTableColPercents(
  widths: FinalStretchColumnWidths,
): {
  measure: number;
  unit: number;
  detail: number;
} {
  const normalized = normalizeFinalStretchColumnWidths(widths);
  return {
    measure: normalized.measure,
    unit: normalized.unit,
    detail: normalized.detail,
  };
}

export type FinalStretchRowData = {
  id: string;
  monthKey: FinalStretchMonthKey;
  rowIndex: number;
  measure: string;
  unitTheme: string;
  detail: string;
};

export type FinalStretchSheetData = {
  id: string;
  studentId: string;
  subject: string;
  teacherId: string;
  campus: string;
  policy: string;
  examDaySimulation: string;
  columnWidths: FinalStretchColumnWidths;
  student: {
    name: string;
    gender: string | null;
    grade: string;
    campus: string;
    targetSchool: string;
  };
  teacher: { name: string };
  rows: FinalStretchRowData[];
  updatedAt: string;
};

export function isFinalStretchGrade(grade: string): boolean {
  return grade.trim() === "6年";
}
