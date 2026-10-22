import { v4 as uuid } from "uuid";
import {
  FINAL_STRETCH_MONTHS,
  FINAL_STRETCH_MAX_TOTAL_ROWS,
  canAddFinalStretchRow,
  type FinalStretchMonthKey,
  type FinalStretchRowData,
} from "./final-stretch-types";

export type FinalStretchPasteField = "measure" | "unitTheme" | "detail";

export const FINAL_STRETCH_PASTE_FIELDS: readonly FinalStretchPasteField[] = [
  "measure",
  "unitTheme",
  "detail",
];

export type FinalStretchCellRef = {
  rowId: string;
  field: FinalStretchPasteField;
};

export function isFinalStretchPasteField(
  value: string | undefined,
): value is FinalStretchPasteField {
  return (
    value === "measure" || value === "unitTheme" || value === "detail"
  );
}

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
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+$/g, "");
  if (!normalized) return [];

  return normalized.split("\n").map((line) => line.split("\t"));
}

export type FinalStretchSelectionBounds = {
  rowStart: number;
  rowEnd: number;
  fieldStart: number;
  fieldEnd: number;
  flat: FinalStretchRowData[];
};

export function getFinalStretchSelectionBounds(
  rows: FinalStretchRowData[],
  anchor: FinalStretchCellRef,
  focus: FinalStretchCellRef,
): FinalStretchSelectionBounds | null {
  const flat = flatFinalStretchRows(rows);
  const anchorRow = flat.findIndex((row) => row.id === anchor.rowId);
  const focusRow = flat.findIndex((row) => row.id === focus.rowId);
  const anchorField = FINAL_STRETCH_PASTE_FIELDS.indexOf(anchor.field);
  const focusField = FINAL_STRETCH_PASTE_FIELDS.indexOf(focus.field);
  if (anchorRow < 0 || focusRow < 0 || anchorField < 0 || focusField < 0) {
    return null;
  }

  return {
    rowStart: Math.min(anchorRow, focusRow),
    rowEnd: Math.max(anchorRow, focusRow),
    fieldStart: Math.min(anchorField, focusField),
    fieldEnd: Math.max(anchorField, focusField),
    flat,
  };
}

export function finalStretchSelectionToText(
  rows: FinalStretchRowData[],
  anchor: FinalStretchCellRef,
  focus: FinalStretchCellRef,
): string | null {
  const bounds = getFinalStretchSelectionBounds(rows, anchor, focus);
  if (!bounds) return null;

  const lines: string[] = [];
  for (let rowIndex = bounds.rowStart; rowIndex <= bounds.rowEnd; rowIndex += 1) {
    const row = bounds.flat[rowIndex];
    const columns: string[] = [];
    for (
      let fieldIndex = bounds.fieldStart;
      fieldIndex <= bounds.fieldEnd;
      fieldIndex += 1
    ) {
      columns.push(row[FINAL_STRETCH_PASTE_FIELDS[fieldIndex]] ?? "");
    }
    lines.push(columns.join("\t"));
  }
  return lines.join("\n");
}

/** 範囲内のセルを空にする。変化がなければ null */
export function clearFinalStretchSelection(
  rows: FinalStretchRowData[],
  anchor: FinalStretchCellRef,
  focus: FinalStretchCellRef,
): FinalStretchRowData[] | null {
  const bounds = getFinalStretchSelectionBounds(rows, anchor, focus);
  if (!bounds) return null;

  const updates = new Map<string, FinalStretchRowData>();
  let changed = false;

  for (let rowIndex = bounds.rowStart; rowIndex <= bounds.rowEnd; rowIndex += 1) {
    const source = bounds.flat[rowIndex];
    const next = { ...source };
    for (
      let fieldIndex = bounds.fieldStart;
      fieldIndex <= bounds.fieldEnd;
      fieldIndex += 1
    ) {
      const field = FINAL_STRETCH_PASTE_FIELDS[fieldIndex];
      if (next[field] !== "") {
        next[field] = "";
        changed = true;
      }
    }
    updates.set(source.id, next);
  }

  if (!changed) return null;
  return rows.map((row) => updates.get(row.id) ?? row);
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

  const startFieldIndex = FINAL_STRETCH_PASTE_FIELDS.indexOf(startField);
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
      if (fieldIndex >= FINAL_STRETCH_PASTE_FIELDS.length) break;
      updated[FINAL_STRETCH_PASTE_FIELDS[fieldIndex]] =
        pastedColumns[columnIndex]?.trim() ?? "";
    }

    rowMap.set(targetRow.id, updated);
    flat[targetIndex] = updated;
  }

  return current.map((row) => rowMap.get(row.id)!);
}
