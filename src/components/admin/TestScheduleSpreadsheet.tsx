"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";
import { CRAM_SCHOOL_NAMES, GRADES } from "@/lib/constants";
import { useAutoSave } from "@/hooks/use-auto-save";
import {
  emptyRow,
  formatTestScheduleDisplayText,
  moveRowInList,
  normalizeDateInput,
  parsePastedRows,
  rowFromInputs,
  sanitizeTestDateInput,
  sortTestScheduleRows,
  type SpreadsheetRow,
} from "@/lib/test-schedule-utils";

type RowItem = SpreadsheetRow & { _key: string };

type Props = {
  initialRows: SpreadsheetRow[];
  readOnly?: boolean;
};

function newRow(partial?: SpreadsheetRow): RowItem {
  const base = partial ? rowFromInputs(partial) : emptyRow();
  return { ...base, _key: uuid() };
}

export function TestScheduleSpreadsheet({
  initialRows,
  readOnly = false,
}: Props) {
  const [rows, setRows] = useState<RowItem[]>(() =>
    readOnly
      ? initialRows.map((r) => newRow(r))
      : [...initialRows.map((r) => newRow(r)), newRow(), newRow()],
  );
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [saveRevision, setSaveRevision] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const rowsRef = useRef(rows);
  const deletedIdsRef = useRef(deletedIds);
  rowsRef.current = rows;
  deletedIdsRef.current = deletedIds;

  const bumpSave = () => setSaveRevision((r) => r + 1);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const [contextMenu, setContextMenu] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    index: number;
    label: string;
  } | null>(null);

  const [drag, setDrag] = useState<{
    key: string;
    fromIndex: number;
    offsetY: number;
    pointerY: number;
    dropIndex: number;
  } | null>(null);

  const recalcRow = useCallback((row: RowItem): RowItem => {
    if (!row.testName.trim()) return row;
    const calc = rowFromInputs(row);
    return { ...row, ...calc };
  }, []);

  const getRowTops = useCallback(() => {
    const tops: { key: string; top: number; bottom: number; index: number }[] =
      [];
    rows.forEach((row, index) => {
      const el = rowRefs.current.get(row._key);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      tops.push({ key: row._key, top: rect.top, bottom: rect.bottom, index });
    });
    return tops;
  }, [rows]);

  const resolveLineY = useCallback(
    (insertIndex: number) => {
      const measured = getRowTops();
      if (measured.length === 0) return 0;
      if (insertIndex <= 0) return measured[0].top;
      if (insertIndex >= measured.length) return measured[measured.length - 1].bottom;
      return (measured[insertIndex - 1].bottom + measured[insertIndex].top) / 2;
    },
    [getRowTops],
  );

  const resolveInsertIndex = useCallback(
    (clientY: number) => {
      const measured = getRowTops();
      if (measured.length === 0) return 0;

      for (let i = 0; i < measured.length; i++) {
        const mid = (measured[i].top + measured[i].bottom) / 2;
        if (clientY < mid) return i;
      }
      return measured.length;
    },
    [getRowTops],
  );

  const updateCell = (
    index: number,
    field: keyof SpreadsheetRow,
    value: string,
  ) => {
    if (readOnly) return;
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value };
      if (field === "testName" || field === "testDate") {
        next[index] = recalcRow(row);
      } else {
        next[index] = row;
      }
      return next;
    });
    bumpSave();
  };

  const toggleInTestCourse = (index: number, checked: boolean) => {
    if (readOnly) return;
    setRows((prev) => {
      const next = [...prev];
      const row = next[index];
      if (!row) return prev;
      next[index] = { ...row, inTestCourse: checked };
      return next;
    });
    bumpSave();
  };

  const insertAt = (index: number) => {
    if (readOnly) return;
    setRows((prev) => {
      const next = [...prev];
      next.splice(index, 0, newRow());
      return next;
    });
    setContextMenu(null);
    bumpSave();
  };

  const openContextMenu = (index: number, e: React.MouseEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ index, x: e.clientX, y: e.clientY });
  };

  const rowDeleteLabel = (row: RowItem) =>
    row.testName.trim() ||
    row.displayText.trim() ||
    row.cramSchool.trim() ||
    "この行";

  const requestRemoveRow = (index: number) => {
    if (readOnly) return;
    const row = rows[index];
    if (!row) return;
    setDeleteConfirm({ index, label: rowDeleteLabel(row) });
    setContextMenu(null);
  };

  const confirmRemoveRow = () => {
    if (!deleteConfirm) return;
    const { index } = deleteConfirm;
    const row = rows[index];
    if (!row) {
      setDeleteConfirm(null);
      return;
    }
    if (row.id) {
      setDeletedIds((prev) => [...prev, row.id!]);
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
    setDeleteConfirm(null);
    bumpSave();
  };

  const startDrag = (index: number, e: ReactPointerEvent<HTMLTableCellElement>) => {
    if (readOnly) return;
    const row = rows[index];
    const el = rowRefs.current.get(row._key);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    setContextMenu(null);
    setDrag({
      key: row._key,
      fromIndex: index,
      offsetY: e.clientY - rect.top,
      pointerY: e.clientY,
      dropIndex: index,
    });
  };

  const onDragPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const dropIndex = resolveInsertIndex(e.clientY);
    setDrag((d) =>
      d ? { ...d, pointerY: e.clientY, dropIndex } : d,
    );
  };

  const endDrag = useCallback(() => {
    setDrag((current) => {
      if (!current) return null;
      const { fromIndex, dropIndex } = current;
      if (fromIndex !== dropIndex) {
        setRows((prev) => moveRowInList(prev, fromIndex, dropIndex));
        setSaveRevision((r) => r + 1);
      }
      return null;
    });
  }, []);

  useEffect(() => {
    if (!drag) return;
    const onUp = () => endDrag();
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [drag, endDrag]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const timer = window.setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("contextmenu", close);
      window.addEventListener("scroll", close, true);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!deleteConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDeleteConfirm(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteConfirm]);

  const applySort = () => {
    if (readOnly) return;
    setRows((prev) => {
      const filled = prev.filter((r) => r.testName.trim() || r.cramSchool.trim());
      const blanks = prev.filter((r) => !r.testName.trim() && !r.cramSchool.trim());
      return [...sortTestScheduleRows(filled), ...blanks];
    });
    setStatus("塾別→学年→開催日時の順に並べ替えました");
    bumpSave();
  };

  const handlePasteImport = () => {
    if (readOnly) return;
    const imported = parsePastedRows(pasteText);
    if (imported.length === 0) {
      setStatus("貼り付けデータを読み取れませんでした");
      return;
    }
    setRows((prev) =>
      sortTestScheduleRows([
        ...prev.filter((r) => r.testName || r.cramSchool),
        ...imported.map((r) => newRow(r)),
      ]).concat([newRow(), newRow()]),
    );
    setPasteText("");
    setPasteOpen(false);
    setStatus(`${imported.length} 行を取り込みました`);
    bumpSave();
  };

  const mergeSavedRows = useCallback(
    (prev: RowItem[], saved: SpreadsheetRow[]) => {
      let idx = 0;
      return prev.map((row) => {
        if (!row.testName.trim()) return row;
        const savedRow = saved[idx++];
        if (!savedRow) return row;
        return { ...row, ...savedRow };
      });
    },
    [],
  );

  const persistRows = useCallback(async (): Promise<boolean> => {
    if (readOnly) return true;
    const currentRows = rowsRef.current;
    const currentDeleted = deletedIdsRef.current;
    const payload = currentRows.map(recalcRow).filter((r) => r.testName.trim());

    if (payload.length === 0 && currentDeleted.length === 0) {
      return true;
    }

    const res = await fetch("/api/admin/tests/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: payload, deletedIds: currentDeleted }),
    });

    if (!res.ok) return false;

    const data = (await res.json()) as { rows: SpreadsheetRow[] };
    setRows((prev) => mergeSavedRows(prev, data.rows ?? []));
    setDeletedIds([]);
    return true;
  }, [mergeSavedRows, recalcRow, readOnly]);

  const skipAutoSave = useCallback(async (): Promise<boolean> => true, []);
  const { statusLabel: autoSaveLabel } = useAutoSave(
    readOnly ? skipAutoSave : persistRows,
    readOnly ? 0 : saveRevision,
  );

  const handleGridPaste = (e: React.ClipboardEvent) => {
    if (readOnly) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const imported = parsePastedRows(text);
    if (imported.length > 0) {
      setRows((prev) =>
        sortTestScheduleRows([
          ...prev.filter((r) => r.testName || r.cramSchool),
          ...imported.map((r) => newRow(r)),
        ]).concat([newRow()]),
      );
      setStatus(`${imported.length} 行を貼り付けました`);
      bumpSave();
    }
  };

  const draggedRow = drag ? rows.find((r) => r._key === drag.key) : null;
  const draggedEl = drag ? rowRefs.current.get(drag.key) : null;
  const ghostTop = drag && draggedEl
    ? drag.pointerY - drag.offsetY
  : 0;
  const ghostHeight = draggedEl?.getBoundingClientRect().height ?? 40;
  const dropLineY = drag ? resolveLineY(drag.dropIndex) : null;

  return (
    <div className="space-y-4">
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-4"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="test-schedule-delete-title"
            className="w-full max-w-md rounded-lg border bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="test-schedule-delete-title"
              className="text-base font-semibold text-gray-900"
            >
              行を削除しますか？
            </h2>
            <p className="mt-2 text-sm text-gray-700">
              「{deleteConfirm.label}」を削除します。保存するとテスト日程から消えます。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
                onClick={() => setDeleteConfirm(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
                onClick={confirmRemoveRow}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 rounded border bg-white p-4 text-sm">
        <span className="text-xs text-gray-600">
          {readOnly ? (
            <>
              テスト日程の一覧です。変更が必要な場合は管理者にお問い合わせください。
            </>
          ) : (
            <>
              日付は半角の <strong>2026/4/15</strong> または <strong>2026/4</strong>{" "}
              の形式のみ。塾名は候補から選択。「テストコースに含める」にチェックを入れた行だけがプログラムシートの候補になります。編集内容は自動保存されます。
            </>
          )}
        </span>
        {!readOnly ? (
          <div className="ml-auto flex items-center gap-3">
            {autoSaveLabel && (
              <span className="text-xs text-green-700">{autoSaveLabel}</span>
            )}
            <button
              type="button"
              onClick={applySort}
              className="rounded border px-3 py-1 hover:bg-gray-50"
            >
              ルールで並び替え
            </button>
            <button
              type="button"
              onClick={() => setPasteOpen(!pasteOpen)}
              className="rounded border px-3 py-1 hover:bg-gray-50"
            >
              シートから貼り付け
            </button>
            <button
              type="button"
              onClick={() => insertAt(rows.length)}
              className="rounded border px-3 py-1 hover:bg-gray-50"
            >
              末尾に行追加
            </button>
          </div>
        ) : null}
      </div>

      {!readOnly && pasteOpen && (
        <div className="rounded border bg-white p-4">
          <p className="mb-2 text-sm text-gray-600">
            列順: 塾名 / 学年 / テスト名 / 日付（2026/4/15）
          </p>
          <textarea
            rows={8}
            className="w-full rounded border p-2 font-mono text-xs"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="SAPIX	6年	3月組分けテスト	2026/3/8"
          />
          <button
            type="button"
            onClick={handlePasteImport}
            className="mt-2 rounded bg-gray-700 px-3 py-1 text-sm text-white"
          >
            取り込む
          </button>
        </div>
      )}

      {status && <p className="text-sm text-green-700">{status}</p>}

      <datalist id="test-cram-school-list">
        {CRAM_SCHOOL_NAMES.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div
        ref={wrapperRef}
        className="relative overflow-auto rounded border bg-white"
        onPaste={readOnly ? undefined : handleGridPaste}
      >
        {contextMenu && (
          <div
            className="fixed z-50 min-w-[148px] overflow-hidden rounded border bg-white py-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              type="button"
              className="block w-full px-4 py-2 text-left text-sm hover:bg-blue-50"
              onClick={() => insertAt(contextMenu.index)}
            >
              上に挿入
            </button>
            <button
              type="button"
              className="block w-full px-4 py-2 text-left text-sm hover:bg-blue-50"
              onClick={() => insertAt(contextMenu.index + 1)}
            >
              下に挿入
            </button>
            <button
              type="button"
              className="block w-full border-t px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              onClick={() => requestRemoveRow(contextMenu.index)}
            >
              行を削除
            </button>
          </div>
        )}

        {/* ドラッグ中の挿入位置ライン */}
        {dropLineY != null && drag && (
          <div
            className="pointer-events-none fixed z-40 h-0.5 bg-[#1e3a5f] shadow-[0_0_6px_rgba(30,58,95,0.5)] transition-[top] duration-150 ease-out"
            style={{
              top: dropLineY,
              left: wrapperRef.current?.getBoundingClientRect().left ?? 0,
              width: wrapperRef.current?.getBoundingClientRect().width ?? "100%",
            }}
          />
        )}

        {/* ドラッグ中のゴースト行 */}
        {drag && draggedRow && draggedEl && (
          <div
            className="pointer-events-none fixed z-50 overflow-hidden rounded border-2 border-[#1e3a5f] bg-white shadow-xl transition-[top] duration-75 ease-out"
            style={{
              top: ghostTop,
              left: draggedEl.getBoundingClientRect().left,
              width: draggedEl.getBoundingClientRect().width,
              height: ghostHeight,
              opacity: 0.95,
            }}
          >
            <table className="w-full text-sm">
              <tbody>
                <tr className="bg-blue-50">
                  <td className="w-8 bg-gray-100 p-1 text-center">⠿</td>
                  <td className="w-8 bg-gray-50 p-1 text-center text-xs">
                    {drag.fromIndex + 1}
                  </td>
                  <td className="px-2 py-1.5">{draggedRow.cramSchool}</td>
                  <td className="px-1 py-1.5">{draggedRow.grade}</td>
                  <td className="px-2 py-1.5">{draggedRow.testName}</td>
                  <td className="px-2 py-1.5 font-mono text-sm">
                    {draggedRow.testDate}
                  </td>
                  <td className="px-2 py-1.5 text-center text-xs">
                    {draggedRow.inTestCourse ? "✓" : ""}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-red-700">
                    {formatTestScheduleDisplayText(draggedRow)}
                  </td>
                  <td className="w-12" />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <table className="min-w-[1120px] w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#1e3a5f] text-left text-xs text-white">
              {readOnly ? null : (
                <th className="w-8 border border-[#2a4f7a] p-2"></th>
              )}
              <th className="w-8 border border-[#2a4f7a] p-2">#</th>
              <th className="min-w-[120px] border border-[#2a4f7a] p-2">塾名</th>
              <th className="w-20 border border-[#2a4f7a] p-2">学年</th>
              <th className="min-w-[200px] border border-[#2a4f7a] p-2">
                テスト名
              </th>
              <th className="min-w-[160px] border border-[#2a4f7a] p-2">
                年 月 日
              </th>
              <th className="min-w-[120px] border border-[#2a4f7a] p-2">
                テストコースに含める
              </th>
              <th className="min-w-[220px] border border-[#2a4f7a] p-2">
                表示テキスト
              </th>
              {readOnly ? null : (
                <th className="sticky right-0 z-20 w-14 border border-[#2a4f7a] bg-[#1e3a5f] p-2">
                  削除
                </th>
              )}
            </tr>
          </thead>
          <tbody onPointerMove={onDragPointerMove}>
            {rows.map((row, i) => {
              const isDragging = drag?.key === row._key;
              const shiftDown =
                drag &&
                !isDragging &&
                drag.dropIndex <= i &&
                drag.fromIndex > i;
              const shiftUp =
                drag &&
                !isDragging &&
                drag.dropIndex > i &&
                drag.fromIndex < i;

              return (
                <tr
                  key={row._key}
                  ref={(el) => {
                    if (el) rowRefs.current.set(row._key, el);
                    else rowRefs.current.delete(row._key);
                  }}
                  onContextMenu={
                    readOnly ? undefined : (e) => openContextMenu(i, e)
                  }
                  className={`transition-all duration-200 ease-out ${
                    isDragging
                      ? "opacity-20 scale-[0.98] bg-blue-50"
                      : "hover:bg-blue-50/30"
                  } ${shiftDown ? "translate-y-2" : ""} ${
                    shiftUp ? "-translate-y-2" : ""
                  }`}
                >
                  {readOnly ? null : (
                    <td
                      onPointerDown={(e) => startDrag(i, e)}
                      className="cursor-grab border border-gray-200 bg-gray-100 px-1 text-center text-gray-400 touch-none select-none active:cursor-grabbing"
                      title="ドラッグして並べ替え"
                    >
                      ⠿
                    </td>
                  )}
                  <td className="border border-gray-200 bg-gray-50 p-1 text-center text-xs text-gray-400">
                    {i + 1}
                  </td>
                  <td className="border border-gray-200 p-0">
                    <input
                      list="test-cram-school-list"
                      className="w-full border-0 bg-transparent px-2 py-1.5 outline-none read-only:cursor-default read-only:focus:bg-transparent focus:bg-yellow-50"
                      value={row.cramSchool}
                      readOnly={readOnly}
                      onChange={(e) =>
                        updateCell(i, "cramSchool", e.target.value)
                      }
                    />
                  </td>
                  <td className="border border-gray-200 p-0">
                    <select
                      className="w-full border-0 bg-transparent px-1 py-1.5 outline-none read-only:cursor-default read-only:focus:bg-transparent focus:bg-yellow-50"
                      value={row.grade}
                      disabled={readOnly}
                      onChange={(e) => updateCell(i, "grade", e.target.value)}
                    >
                      {GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border border-gray-200 p-0">
                    <input
                      className="w-full border-0 bg-transparent px-2 py-1.5 outline-none read-only:cursor-default read-only:focus:bg-transparent focus:bg-yellow-50"
                      value={row.testName}
                      readOnly={readOnly}
                      onChange={(e) =>
                        updateCell(i, "testName", e.target.value)
                      }
                    />
                  </td>
                  <td className="border border-gray-200 p-0">
                    <input
                      className="w-full border-0 bg-transparent px-2 py-1.5 font-mono text-sm outline-none read-only:cursor-default read-only:focus:bg-transparent focus:bg-yellow-50"
                      value={row.testDate}
                      placeholder="2026/4/15"
                      inputMode="numeric"
                      readOnly={readOnly}
                      onChange={(e) =>
                        updateCell(
                          i,
                          "testDate",
                          sanitizeTestDateInput(e.target.value),
                        )
                      }
                      onBlur={() => {
                        if (readOnly) return;
                        setRows((prev) => {
                          const next = [...prev];
                          const row = next[i];
                          if (!row) return prev;
                          const normalized = normalizeDateInput(row.testDate);
                          next[i] = recalcRow({
                            ...row,
                            testDate: normalized,
                          });
                          return next;
                        });
                        bumpSave();
                      }}
                    />
                  </td>
                  <td className="border border-gray-200 p-0 text-center">
                    <label className="inline-flex items-center justify-center px-2 py-1.5">
                      <input
                        type="checkbox"
                        className="scale-110"
                        checked={row.inTestCourse}
                        disabled={readOnly}
                        onChange={(e) =>
                          toggleInTestCourse(i, e.target.checked)
                        }
                        aria-label="テストコースに含める"
                      />
                    </label>
                  </td>
                  <td className="border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-red-700">
                    {formatTestScheduleDisplayText(row) || "—"}
                  </td>
                  {readOnly ? null : (
                    <td className="sticky right-0 z-10 border border-gray-200 bg-white p-1 text-center shadow-[-4px_0_8px_rgba(0,0,0,0.06)]">
                      <button
                        type="button"
                        onClick={() => requestRemoveRow(i)}
                        className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                        title="行を削除"
                      >
                        削除
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        {readOnly
          ? "一覧の閲覧のみ可能です。"
          : "行を右クリックで「挿入」「削除」。右端の「削除」ボタン、または ⠿ をドラッグして並べ替えできます。"}
      </p>
    </div>
  );
}
