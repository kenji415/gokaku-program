import { v4 as uuid } from "uuid";
import {
  FINAL_STRETCH_MONTHS,
  FINAL_STRETCH_MAX_TOTAL_ROWS,
  canAddFinalStretchRow,
  type FinalStretchMonthKey,
  type FinalStretchRowData,
} from "./final-stretch-types";

export type FinalStretchPasteField = "measure" | "unitTheme" | "detail";

const PASTE_FIELDS: FinalStretchPasteField[] = [
  "measure",
  "unitTheme",
  "detail",
];

function rowsForMonth(rows: FinalStretchRowData[], monthKey: FinalStretchMonthKey) {
  return rows
    .filter((row) => row.monthKey === monthKey)
    .sort((a, b) => a.rowIndex - b.rowIndex);
}

export function flatFinalStretchRows(
  rows: FinalStretchRowData[],
): FinalStretchRowData[] {
  return FINAL_STRETCH_MONTHS.flatMap((month) => rowsForMonth(rows, month.key));
}

export function parsePastedFinalStretchGrid(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
  if (!normalized) return [];

  return normalized
    .split("\n")
    .map((line) => line.split("\t"))
    .filter((cols) => !(cols.length === 1 && cols[0].trim() === ""));
}

export function isFinalStretchGridPaste(text: string): boolean {
  return text.includes("\t") || text.includes("\n") || text.includes("\r");
}

function addRowToMonth(
  rows: FinalStretchRowData[],
  monthKey: FinalStretchMonthKey,
): FinalStretchRowData[] | null {
  if (!canAddFinalStretchRow(rows.length)) return null;
  const monthRows = rowsForMonth(rows, monthKey);

  const nextIndex =
    monthRows.length > 0
      ? Math.max(...monthRows.map((row) => row.rowIndex)) + 1
      : 0;

  return [
    ...rows,
    {
      id: uuid(),
      monthKey,
      rowIndex: nextIndex,
      measure: "",
      unitTheme: "",
      detail: "",
    },
  ];
}

function ensureFlatRowCount(
  rows: FinalStretchRowData[],
  requiredCount: number,
): FinalStretchRowData[] {
  let current = rows;

  while (flatFinalStretchRows(current).length < requiredCount) {
    if (!canAddFinalStretchRow(current.length)) break;
    const flatLength = flatFinalStretchRows(current).length;
    let added: FinalStretchRowData[] | null = null;

    let cumulative = 0;
    for (const month of FINAL_STRETCH_MONTHS) {
      const monthRows = rowsForMonth(current, month.key);
      const monthEnd = cumulative + monthRows.length;
      if (flatLength === monthEnd) {
        added = addRowToMonth(current, month.key);
        if (added) break;
      }
      cumulative = monthEnd;
    }

    if (!added) break;
    current = added;
  }

  return current;
}

export function applyFinalStretchPaste(
  rows: FinalStretchRowData[],
  startRowId: string,
  startField: FinalStretchPasteField,
  grid: string[][],
): FinalStretchRowData[] {
  if (grid.length === 0) return rows;

  const startFieldIndex = PASTE_FIELDS.indexOf(startField);
  if (startFieldIndex < 0) return rows;

  let flat = flatFinalStretchRows(rows);
  const startIndex = flat.findIndex((row) => row.id === startRowId);
  if (startIndex < 0) return rows;

  let current = ensureFlatRowCount(rows, startIndex + grid.length);
  flat = flatFinalStretchRows(current);
  const rowMap = new Map(current.map((row) => [row.id, { ...row }]));

  for (let pasteRowIndex = 0; pasteRowIndex < grid.length; pasteRowIndex += 1) {
    const targetIndex = startIndex + pasteRowIndex;
    if (targetIndex >= flat.length) break;
    if (targetIndex >= FINAL_STRETCH_MAX_TOTAL_ROWS) break;

    const targetRow = flat[targetIndex];
    const pastedColumns = grid[pasteRowIndex];
    const updated = { ...rowMap.get(targetRow.id)! };

    for (
      let columnIndex = 0;
      columnIndex < pastedColumns.length;
      columnIndex += 1
    ) {
      const fieldIndex = startFieldIndex + columnIndex;
      if (fieldIndex >= PASTE_FIELDS.length) break;
      updated[PASTE_FIELDS[fieldIndex]] = pastedColumns[columnIndex]?.trim() ?? "";
    }

    rowMap.set(targetRow.id, updated);
    flat[targetIndex] = updated;
  }

  return current.map((row) => rowMap.get(row.id)!);
}
