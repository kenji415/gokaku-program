"use client";

import {
  FINAL_STRETCH_MONTHS,
  FINAL_STRETCH_MIN_DATA_COL_PERCENT,
  FINAL_STRETCH_MONTH_ADD_COL_WIDTH,
  FINAL_STRETCH_MONTH_COL_WIDTH,
  defaultRowCountForMonth,
  canAddFinalStretchRow,
  FINAL_STRETCH_MAX_TOTAL_ROWS,
  normalizeFinalStretchColumnWidths,
  toFinalStretchTableColPercents,
  type FinalStretchColumnWidths,
  type FinalStretchMonthKey,
  type FinalStretchRowData,
  type FinalStretchSheetData,
} from "@/lib/final-stretch-types";
import {
  applyFinalStretchPaste,
  isFinalStretchGridPaste,
  parsePastedFinalStretchGrid,
  type FinalStretchPasteField,
} from "@/lib/final-stretch-paste";
import { formatStudentDisplayName } from "@/lib/months";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import jukenDoctorLogo from "../../public/juken-doctor-logo.png";

type Props = {
  sheet: FinalStretchSheetData;
  editable?: boolean;
  /** PDF/印刷で編集時と同じ列幅・位置に揃える */
  alignWithEditorColumns?: boolean;
  onTargetSchoolChange?: (targetSchool: string) => void;
  onPolicyChange?: (policy: string) => void;
  onRowsChange?: (rows: FinalStretchRowData[]) => void;
  onColumnWidthsChange?: (columnWidths: FinalStretchColumnWidths) => void;
};

type ColumnResizeBoundary = "measure-unit" | "unit-detail";

type ColumnResizeDrag = {
  boundary: ColumnResizeBoundary;
  startX: number;
  startWidths: FinalStretchColumnWidths;
};

function rowsForMonth(rows: FinalStretchRowData[], monthKey: FinalStretchMonthKey) {
  return rows
    .filter((row) => row.monthKey === monthKey)
    .sort((a, b) => a.rowIndex - b.rowIndex);
}

function formatSheetDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function applyColumnResize(
  startWidths: FinalStretchColumnWidths,
  boundary: ColumnResizeBoundary,
  deltaPercent: number,
): FinalStretchColumnWidths {
  const min = FINAL_STRETCH_MIN_DATA_COL_PERCENT;
  const widths = normalizeFinalStretchColumnWidths(startWidths);

  if (boundary === "measure-unit") {
    const pairTotal = widths.measure + widths.unit;
    const nextMeasure = Math.min(
      pairTotal - min,
      Math.max(min, widths.measure + deltaPercent),
    );
    return normalizeFinalStretchColumnWidths({
      measure: nextMeasure,
      unit: pairTotal - nextMeasure,
      detail: widths.detail,
    });
  }

  const pairTotal = widths.unit + widths.detail;
  const nextUnit = Math.min(
    pairTotal - min,
    Math.max(min, widths.unit + deltaPercent),
  );
  return normalizeFinalStretchColumnWidths({
    measure: widths.measure,
    unit: nextUnit,
    detail: pairTotal - nextUnit,
  });
}

export function FinalStretchSheet({
  sheet,
  editable = true,
  alignWithEditorColumns = false,
  onTargetSchoolChange,
  onPolicyChange,
  onRowsChange,
  onColumnWidthsChange,
}: Props) {
  const tableRef = useRef<HTMLTableElement>(null);
  const resizeDragRef = useRef<ColumnResizeDrag | null>(null);
  const [columnResizeDrag, setColumnResizeDrag] = useState<ColumnResizeDrag | null>(
    null,
  );

  const columnWidths = normalizeFinalStretchColumnWidths(sheet.columnWidths);
  const tableColPercents = toFinalStretchTableColPercents(columnWidths);
  const showEditorControls = editable && Boolean(onRowsChange);
  const useEditorColumnLayout = showEditorControls || alignWithEditorColumns;
  const showColumnResize = showEditorControls && Boolean(onColumnWidthsChange);

  const updateRow = (
    rowId: string,
    field: "measure" | "unitTheme" | "detail",
    value: string,
  ) => {
    if (!onRowsChange) return;
    onRowsChange(
      sheet.rows.map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row,
      ),
    );
  };

  const addRow = (monthKey: FinalStretchMonthKey) => {
    if (!onRowsChange) return;
    if (!canAddFinalStretchRow(sheet.rows.length)) return;

    const monthRows = rowsForMonth(sheet.rows, monthKey);
    const nextIndex =
      monthRows.length > 0
        ? Math.max(...monthRows.map((row) => row.rowIndex)) + 1
        : 0;
    onRowsChange([
      ...sheet.rows,
      {
        id: uuid(),
        monthKey,
        rowIndex: nextIndex,
        measure: "",
        unitTheme: "",
        detail: "",
      },
    ]);
  };

  const removeRow = (rowId: string) => {
    if (!onRowsChange) return;
    const target = sheet.rows.find((row) => row.id === rowId);
    if (!target) return;
    const monthRows = rowsForMonth(sheet.rows, target.monthKey);
    if (monthRows.length <= defaultRowCountForMonth(target.monthKey)) return;
    onRowsChange(sheet.rows.filter((row) => row.id !== rowId));
  };

  const handleCellPaste = (
    rowId: string,
    field: FinalStretchPasteField,
    event: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    if (!onRowsChange) return;

    const text = event.clipboardData.getData("text/plain");
    if (!isFinalStretchGridPaste(text)) return;

    event.preventDefault();
    const grid = parsePastedFinalStretchGrid(text);
    if (grid.length === 0) return;

    onRowsChange(applyFinalStretchPaste(sheet.rows, rowId, field, grid));
  };

  const handleTablePaste = (event: React.ClipboardEvent<HTMLTableElement>) => {
    if (!onRowsChange) return;

    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement &&
      active.classList.contains("final-stretch-cell-input") &&
      active.dataset.rowId &&
      active.dataset.field
    ) {
      return;
    }
    if (
      active instanceof HTMLTextAreaElement &&
      (active.classList.contains("final-stretch-policy-input") ||
        active.classList.contains("final-stretch-target-school-input"))
    ) {
      return;
    }

    const text = event.clipboardData.getData("text/plain");
    if (!isFinalStretchGridPaste(text)) return;

    event.preventDefault();
    const grid = parsePastedFinalStretchGrid(text);
    if (grid.length === 0) return;

    const flat = FINAL_STRETCH_MONTHS.flatMap((month) =>
      rowsForMonth(sheet.rows, month.key),
    );
    const firstRow = flat[0];
    if (!firstRow) return;

    onRowsChange(
      applyFinalStretchPaste(sheet.rows, firstRow.id, "measure", grid),
    );
  };

  const startColumnResize = useCallback(
    (boundary: ColumnResizeBoundary, event: React.PointerEvent<HTMLSpanElement>) => {
      if (!showColumnResize) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      const drag: ColumnResizeDrag = {
        boundary,
        startX: event.clientX,
        startWidths: columnWidths,
      };
      resizeDragRef.current = drag;
      setColumnResizeDrag(drag);
    },
    [columnWidths, showColumnResize],
  );

  const handleColumnResizeMove = useCallback(
    (event: PointerEvent) => {
      const drag = resizeDragRef.current;
      const table = tableRef.current;
      if (!drag || !table || !onColumnWidthsChange) return;

      const addHead = table.querySelector(".final-stretch-month-add-head");
      const monthHead = table.querySelector(".final-stretch-head-empty");
      const fixedWidth =
        (addHead instanceof HTMLElement ? addHead.offsetWidth : 0) +
        (monthHead instanceof HTMLElement ? monthHead.offsetWidth : 0);
      const dataWidth = table.offsetWidth - fixedWidth;
      if (dataWidth <= 0) return;

      const deltaPercent =
        ((event.clientX - drag.startX) / dataWidth) * 100;
      onColumnWidthsChange(
        applyColumnResize(drag.startWidths, drag.boundary, deltaPercent),
      );
    },
    [onColumnWidthsChange],
  );

  const endColumnResize = useCallback(() => {
    resizeDragRef.current = null;
    setColumnResizeDrag(null);
  }, []);

  useEffect(() => {
    if (!columnResizeDrag) return;

    window.addEventListener("pointermove", handleColumnResizeMove);
    window.addEventListener("pointerup", endColumnResize);
    window.addEventListener("pointercancel", endColumnResize);

    return () => {
      window.removeEventListener("pointermove", handleColumnResizeMove);
      window.removeEventListener("pointerup", endColumnResize);
      window.removeEventListener("pointercancel", endColumnResize);
    };
  }, [columnResizeDrag, endColumnResize, handleColumnResizeMove]);

  const sheetDate = formatSheetDate(new Date().toISOString());

  return (
    <div>
      <div className="final-stretch-with-editor">
        <div
          className={`final-stretch-sheet text-gray-900${columnResizeDrag ? " final-stretch-sheet--col-resizing" : ""}`}
        >
          <div className="final-stretch-sheet-header-bg" aria-hidden />
          <header
            className={`final-stretch-sheet-header${useEditorColumnLayout ? " final-stretch-sheet-header--with-editor" : ""}`}
          >
            <h1 className="final-stretch-sheet-title">
              {formatStudentDisplayName(sheet.student.name, sheet.student.gender)}
              {" 直前期合格プログラムシート "}
              <span className="final-stretch-sheet-title-subject">
                {sheet.subject}
              </span>
            </h1>
            <div className="final-stretch-sheet-meta">
              {sheet.campus ? (
                <span className="final-stretch-sheet-meta-campus">
                  {sheet.campus}
                </span>
              ) : null}
              {sheet.teacher.name ? (
                <span className="final-stretch-sheet-meta-teacher">
                  {sheet.teacher.name}
                </span>
              ) : null}
            </div>
          </header>

          <div className="final-stretch-sheet-body">
            <div className="final-stretch-table-wrap">
              <div
                className={`final-stretch-policy-section${useEditorColumnLayout ? " final-stretch-policy-section--with-editor" : ""}`}
              >
                <div className="final-stretch-policy-fields">
                  {useEditorColumnLayout ? (
                    <div
                      className={`final-stretch-policy-leading-spacer${showEditorControls ? " screen-only" : ""}`}
                      aria-hidden
                    />
                  ) : null}
                  <div className="final-stretch-policy-field final-stretch-policy-field--target-school">
                    <div className="final-stretch-policy-label">志望校</div>
                    <div className="final-stretch-policy-box final-stretch-target-school-box">
                      {editable ? (
                        <textarea
                          className="final-stretch-cell-input final-stretch-target-school-input"
                          rows={3}
                          value={sheet.student.targetSchool}
                          onChange={(e) =>
                            onTargetSchoolChange?.(e.target.value)
                          }
                          placeholder="駒東"
                        />
                      ) : (
                        <div className="final-stretch-cell-text final-stretch-target-school-text">
                          {sheet.student.targetSchool || "—"}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="final-stretch-policy-field final-stretch-policy-field--wide">
                    <div className="final-stretch-policy-label">
                      現状分析と
                      <br />
                      今後の方針
                    </div>
                    <div className="final-stretch-policy-box">
                      {editable ? (
                      <textarea
                        className="final-stretch-cell-input final-stretch-policy-input"
                        rows={3}
                        value={sheet.policy}
                          onChange={(e) => onPolicyChange?.(e.target.value)}
                          placeholder="10月は海城・本郷で得点するために…"
                        />
                      ) : (
                        <div className="final-stretch-cell-text final-stretch-policy-text">
                          {sheet.policy || "—"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <table
                ref={tableRef}
                className="final-stretch-grid"
                onPaste={editable ? handleTablePaste : undefined}
              >
                <colgroup>
                  {useEditorColumnLayout ? (
                    <col style={{ width: FINAL_STRETCH_MONTH_ADD_COL_WIDTH }} />
                  ) : null}
                  <col style={{ width: FINAL_STRETCH_MONTH_COL_WIDTH }} />
                  <col style={{ width: `${tableColPercents.measure}%` }} />
                  <col style={{ width: `${tableColPercents.unit}%` }} />
                  <col style={{ width: `${tableColPercents.detail}%` }} />
                </colgroup>
                <thead>
                  <tr>
                    {useEditorColumnLayout ? (
                      <th
                        className={`final-stretch-month-add-head${showEditorControls ? " screen-only" : ""}`}
                        aria-hidden
                      />
                    ) : null}
                    <th className="final-stretch-head-empty" aria-hidden />
                    <th className="final-stretch-head-cell final-stretch-col-measure">
                      対策
                      {showColumnResize ? (
                        <span
                          className="final-stretch-col-resize screen-only"
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="対策列と単元列の境界を調整"
                          onPointerDown={(event) =>
                            startColumnResize("measure-unit", event)
                          }
                        />
                      ) : null}
                    </th>
                    <th className="final-stretch-head-cell final-stretch-col-unit">
                      単元・テーマ・問題種別
                      {showColumnResize ? (
                        <span
                          className="final-stretch-col-resize screen-only"
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="単元列と対策詳細列の境界を調整"
                          onPointerDown={(event) =>
                            startColumnResize("unit-detail", event)
                          }
                        />
                      ) : null}
                    </th>
                    <th className="final-stretch-head-cell final-stretch-col-detail">
                      対策詳細
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FINAL_STRETCH_MONTHS.map((month, monthIndex) => {
                    const monthRows = rowsForMonth(sheet.rows, month.key);
                    const isLastMonth =
                      monthIndex === FINAL_STRETCH_MONTHS.length - 1;
                    return monthRows.map((row, index) => {
                      const isLastRowInMonth = index === monthRows.length - 1;
                      return (
                      <tr
                        key={row.id}
                        data-row-id={row.id}
                        className={`final-stretch-data-row${monthIndex > 0 && index === 0 ? " final-stretch-data-row--month-boundary" : ""}${isLastRowInMonth ? " final-stretch-data-row--month-end" : ""}${isLastMonth && isLastRowInMonth ? " final-stretch-data-row--table-end" : ""}`}
                      >
                        {index === 0 && useEditorColumnLayout ? (
                          <td
                            className={`final-stretch-month-add${showEditorControls ? " screen-only" : ""}`}
                            rowSpan={monthRows.length}
                            aria-hidden={!showEditorControls}
                          >
                            {showEditorControls ? (
                              <button
                                type="button"
                                className="final-stretch-month-add-btn"
                                onClick={() => addRow(month.key)}
                                disabled={!canAddFinalStretchRow(sheet.rows.length)}
                                title={
                                  canAddFinalStretchRow(sheet.rows.length)
                                    ? undefined
                                    : `最大${FINAL_STRETCH_MAX_TOTAL_ROWS}行まで`
                                }
                                aria-label={`${month.label}の行を追加`}
                              >
                                ⊕
                              </button>
                            ) : null}
                          </td>
                        ) : null}
                        {index === 0 ? (
                          <td
                            className={`final-stretch-month-cell final-stretch-month-cell--month-end${monthIndex > 0 ? " final-stretch-month-cell--boundary" : ""}${isLastMonth ? " final-stretch-month-cell--table-end" : ""}`}
                            rowSpan={monthRows.length}
                          >
                            {month.label}
                          </td>
                        ) : null}
                        <td className="final-stretch-col-measure">
                          {editable ? (
                            <input
                              type="text"
                              className="final-stretch-cell-input"
                              data-row-id={row.id}
                              data-field="measure"
                              value={row.measure}
                              onChange={(e) =>
                                updateRow(row.id, "measure", e.target.value)
                              }
                              onPaste={(event) =>
                                handleCellPaste(row.id, "measure", event)
                              }
                              placeholder="麻布対策"
                            />
                          ) : (
                            <div className="final-stretch-cell-text">
                              {row.measure}
                            </div>
                          )}
                        </td>
                        <td className="final-stretch-col-unit">
                          {editable ? (
                            <input
                              type="text"
                              className="final-stretch-cell-input"
                              data-row-id={row.id}
                              data-field="unitTheme"
                              value={row.unitTheme}
                              onChange={(e) =>
                                updateRow(row.id, "unitTheme", e.target.value)
                              }
                              onPaste={(event) =>
                                handleCellPaste(row.id, "unitTheme", event)
                              }
                              placeholder="速さ"
                            />
                          ) : (
                            <div className="final-stretch-cell-text">
                              {row.unitTheme}
                            </div>
                          )}
                        </td>
                        <td className="final-stretch-col-detail">
                          <div className="final-stretch-detail-cell">
                            {editable ? (
                              <input
                                type="text"
                                className="final-stretch-cell-input"
                                data-row-id={row.id}
                                data-field="detail"
                                value={row.detail}
                                onChange={(e) =>
                                  updateRow(row.id, "detail", e.target.value)
                                }
                                onPaste={(event) =>
                                  handleCellPaste(row.id, "detail", event)
                                }
                                placeholder="作図と距離一定、距離設定"
                              />
                            ) : (
                              <div className="final-stretch-cell-text">
                                {row.detail}
                              </div>
                            )}
                            {showEditorControls ? (
                              <button
                                type="button"
                                className="final-stretch-row-delete screen-only"
                                onClick={() => removeRow(row.id)}
                                disabled={
                                  monthRows.length <=
                                  defaultRowCountForMonth(month.key)
                                }
                                aria-label="行を削除"
                              >
                                ⊖
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <footer className="final-stretch-sheet-footer">
            <div className="final-stretch-sheet-footer-brand">
              {sheetDate ? (
                <span className="final-stretch-sheet-footer-date">
                  作成日 {sheetDate}
                </span>
              ) : null}
              <img
                src={jukenDoctorLogo.src}
                alt="受験ドクター"
                width={jukenDoctorLogo.width}
                height={jukenDoctorLogo.height}
                className="final-stretch-sheet-footer-logo"
                decoding="sync"
                loading="eager"
              />
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
