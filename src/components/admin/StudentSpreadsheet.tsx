"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import {
  CRAM_SCHOOL_NAMES,
  GENDERS,
  GRADES,
  SUBJECTS,
} from "@/lib/constants";
import { useAutoSave } from "@/hooks/use-auto-save";
import { TeacherAssignmentInput } from "@/components/TeacherAssignmentInput";
import { teacherDisplayName } from "@/lib/teacher-assignment";
import {
  emptyStudentRow,
  isBrokenStudentName,
  parsePastedStudentRows,
  type StudentSpreadsheetRow,
} from "@/lib/student-spreadsheet-utils";

type RowItem = StudentSpreadsheetRow & { _key: string };

type Teacher = { id: string; name: string };

type Props = {
  initialRows: StudentSpreadsheetRow[];
  teachers: Teacher[];
};

function newRow(partial?: StudentSpreadsheetRow): RowItem {
  const base = partial ?? emptyStudentRow();
  return { ...base, _key: uuid() };
}

export function StudentSpreadsheet({ initialRows, teachers }: Props) {
  const [rows, setRows] = useState<RowItem[]>(() => [
    ...initialRows.map((r) => newRow(r)),
    newRow(),
    newRow(),
  ]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [saveRevision, setSaveRevision] = useState(0);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const [contextMenu, setContextMenu] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);

  const rowsRef = useRef(rows);
  const deletedIdsRef = useRef(deletedIds);
  rowsRef.current = rows;
  deletedIdsRef.current = deletedIds;

  const bumpSave = () => setSaveRevision((r) => r + 1);

  const applyImportedRows = (imported: StudentSpreadsheetRow[]) => {
    if (imported.length === 0) {
      setStatus("貼り付けデータを読み取れませんでした");
      return;
    }

    setRows((prev) => {
      const byName = new Map<string, RowItem>();
      for (const row of prev) {
        if (row.name.trim()) byName.set(row.name.trim(), row);
      }

      for (const item of imported) {
        const key = item.name.trim();
        const existing = byName.get(key);
        byName.set(
          key,
          existing
            ? {
                ...existing,
                ...item,
                id: existing.id,
                teachers: existing.teachers,
              }
            : newRow(item),
        );
      }

      return [...byName.values(), newRow(), newRow()];
    });

    setStatus(`${imported.length} 行を取り込みました`);
    bumpSave();
  };

  const handlePasteImport = () => {
    applyImportedRows(parsePastedStudentRows(pasteText));
    setPasteText("");
    setPasteOpen(false);
  };

  const handleGridPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();

    const imported = parsePastedStudentRows(text);
    if (imported.length === 0) {
      setStatus("貼り付けデータを読み取れませんでした");
      return;
    }

    if (imported.length > 1 || text.includes("\n")) {
      applyImportedRows(imported);
      return;
    }

    const tr = (e.target as HTMLElement).closest("tr");
    const rowIndex = tr ? Number(tr.getAttribute("data-row-index")) : NaN;

    if (!Number.isNaN(rowIndex)) {
      setRows((prev) => {
        const next = [...prev];
        const existing = next[rowIndex];
        if (!existing) return prev;
        next[rowIndex] = {
          ...existing,
          ...imported[0],
          id: existing.id,
          teachers: existing.teachers,
        };
        return next;
      });
      bumpSave();
      return;
    }

    applyImportedRows(imported);
  };

  const updateCell = (
    index: number,
    field: keyof Omit<StudentSpreadsheetRow, "teachers" | "id">,
    value: string,
  ) => {
    if (field === "name" && isBrokenStudentName(value)) {
      const imported = parsePastedStudentRows(value);
      if (imported.length > 0) {
        const badRow = rows[index];
        if (badRow?.id) {
          setDeletedIds((prev) => [...prev, badRow.id!]);
        }
        applyImportedRows(imported);
      }
      return;
    }

    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    bumpSave();
  };

  const handleNamePaste = (index: number, e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !(text.includes("\n") && text.length > 30)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const imported = parsePastedStudentRows(text);
    if (imported.length === 0) {
      setStatus("貼り付けデータを読み取れませんでした");
      return;
    }

    const badRow = rows[index];
    if (badRow?.id && isBrokenStudentName(badRow.name)) {
      setDeletedIds((prev) => [...prev, badRow.id!]);
    }

    if (imported.length === 1 && !text.includes("\n")) {
      setRows((prev) => {
        const next = [...prev];
        const existing = next[index];
        if (!existing) return prev;
        next[index] = {
          ...existing,
          ...imported[0],
          id: existing.id,
          teachers: existing.teachers,
        };
        return next;
      });
      bumpSave();
      return;
    }

    applyImportedRows(imported);
  };

  const updateTeacher = (index: number, subject: string, teacherId: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        teachers: { ...next[index].teachers, [subject]: teacherId },
      };
      return next;
    });
    bumpSave();
  };

  const insertAt = (index: number) => {
    setRows((prev) => {
      const next = [...prev];
      next.splice(index, 0, newRow());
      return next;
    });
    setContextMenu(null);
    bumpSave();
  };

  const openContextMenu = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ index, x: e.clientX, y: e.clientY });
  };

  const removeRow = (index: number) => {
    const row = rows[index];
    if (!row) return;
    if (
      row.name.trim() &&
      !window.confirm(
        `「${row.name.trim()}」の行を削除します。保存すると生徒データとプログラムも消えます。よろしいですか？`,
      )
    ) {
      return;
    }
    if (row.id) {
      setDeletedIds((prev) => [...prev, row.id!]);
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
    setContextMenu(null);
    bumpSave();
  };

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

  const mergeSavedRows = useCallback(
    (prev: RowItem[], saved: StudentSpreadsheetRow[]) => {
      let idx = 0;
      return prev.map((row) => {
        if (!row.name.trim()) return row;
        const savedRow = saved[idx++];
        if (!savedRow?.id) return row;
        return { ...row, ...savedRow, id: savedRow.id };
      });
    },
    [],
  );

  const persistRows = useCallback(async (): Promise<boolean> => {
    const currentRows = rowsRef.current;
    const currentDeleted = deletedIdsRef.current;
    const payload = currentRows.filter((r) => r.name.trim());

    if (payload.length === 0 && currentDeleted.length === 0) {
      return true;
    }

    const res = await fetch("/api/admin/students/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: payload.map(({ _key, ...row }) => row),
        deletedIds: currentDeleted,
      }),
    });

    if (!res.ok) return false;

    const data = (await res.json()) as { rows: StudentSpreadsheetRow[] };
    setRows((prev) => mergeSavedRows(prev, data.rows ?? []));
    setDeletedIds([]);
    return true;
  }, [mergeSavedRows]);

  const { statusLabel: autoSaveLabel } = useAutoSave(persistRows, saveRevision);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded border bg-white p-4 text-sm">
        <span className="text-xs text-gray-600">
          スプレッドシート形式で入力できます。Excel等から表全体を貼り付け可能です（列:
          氏名・性別・学年・塾・校舎・クラス・志望校・開始時成績・模試パターン）。指導開始時の課題は各講師のプログラムシートで入力します。編集内容は自動保存されます。
        </span>
        <div className="ml-auto flex items-center gap-3">
          {autoSaveLabel && (
            <span className="text-xs text-green-700">{autoSaveLabel}</span>
          )}
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
      </div>

      {status && <p className="text-sm text-green-700">{status}</p>}

      {pasteOpen && (
        <div className="rounded border bg-white p-4">
          <p className="mb-2 text-sm text-gray-600">
            列順: 氏名 / 性別 / 学年 / 塾 / 校舎 / クラス / 志望校 / 開始時成績 / 模試パターン
            （課題列があっても無視されます。課題はプログラムシートで入力）
          </p>
          <textarea
            rows={10}
            className="w-full rounded border p-2 font-mono text-xs"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="鈴木　康太	男	6年	グノーブル	吉祥寺校	..."
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

      <datalist id="cram-school-list">
        {CRAM_SCHOOL_NAMES.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div
        className="overflow-auto rounded border bg-white"
        onPaste={handleGridPaste}
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
              onClick={() => {
                removeRow(contextMenu.index);
                setContextMenu(null);
              }}
            >
              行を削除
            </button>
          </div>
        )}

        <table className="min-w-[1420px] w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-8" />
            <col className="w-[120px]" />
            <col className="w-14" />
            <col className="w-16" />
            <col className="w-[68px]" />
            <col className="w-[52px]" />
            <col className="w-14" />
            <col className="w-[120px]" />
            <col className="w-[140px]" />
            <col className="w-[68px]" />
            {SUBJECTS.map((subject) => (
              <col key={subject} className="w-[120px]" />
            ))}
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr className="bg-[#1e3a5f] text-left text-xs text-white">
              <th className="border border-[#2a4f7a] p-2">#</th>
              <th className="border border-[#2a4f7a] p-2">生徒名</th>
              <th className="border border-[#2a4f7a] p-2">性別</th>
              <th className="border border-[#2a4f7a] p-2">学年</th>
              <th className="border border-[#2a4f7a] p-2">塾</th>
              <th className="border border-[#2a4f7a] p-2">校舎</th>
              <th className="border border-[#2a4f7a] p-2">クラス</th>
              <th className="border border-[#2a4f7a] p-2">志望校</th>
              <th className="border border-[#2a4f7a] p-2">開始時成績</th>
              <th className="border border-[#2a4f7a] p-2">模試パターン</th>
              {SUBJECTS.map((subject) => (
                <th key={subject} className="border border-[#2a4f7a] p-2">
                  {subject}
                  <div className="font-normal text-[10px] text-white/80">
                    担当講師
                  </div>
                </th>
              ))}
              <th className="sticky right-0 z-20 w-14 border border-[#2a4f7a] bg-[#1e3a5f] p-2">
                削除
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row._key}
                data-row-index={i}
                onContextMenu={(e) => openContextMenu(i, e)}
                className="hover:bg-blue-50/30"
              >
                <td className="border border-gray-200 bg-gray-50 p-1 text-center text-xs text-gray-400">
                  {i + 1}
                </td>
                <td className="border border-gray-200 p-0">
                  <input
                    className="w-full border-0 bg-transparent px-2 py-1.5 outline-none focus:bg-yellow-50"
                    value={row.name}
                    onChange={(e) => updateCell(i, "name", e.target.value)}
                    onPaste={(e) => handleNamePaste(i, e)}
                    placeholder="生徒名"
                  />
                </td>
                <td className="border border-gray-200 p-0">
                  <select
                    className="w-full border-0 bg-transparent px-1 py-1.5 outline-none focus:bg-yellow-50"
                    value={row.gender}
                    onChange={(e) => updateCell(i, "gender", e.target.value)}
                  >
                    <option value="">—</option>
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border border-gray-200 p-0">
                  <select
                    className="w-full border-0 bg-transparent px-1 py-1.5 outline-none focus:bg-yellow-50"
                    value={row.grade}
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
                    list="cram-school-list"
                    className="w-full border-0 bg-transparent px-1 py-1.5 text-xs outline-none focus:bg-yellow-50"
                    value={row.cramSchool}
                    onChange={(e) =>
                      updateCell(i, "cramSchool", e.target.value)
                    }
                  />
                </td>
                <td className="border border-gray-200 p-0">
                  <input
                    className="w-full border-0 bg-transparent px-1 py-1.5 text-xs outline-none focus:bg-yellow-50"
                    value={row.campus}
                    onChange={(e) => updateCell(i, "campus", e.target.value)}
                  />
                </td>
                <td className="border border-gray-200 p-0">
                  <input
                    className="w-full border-0 bg-transparent px-2 py-1.5 outline-none focus:bg-yellow-50"
                    value={row.className}
                    onChange={(e) =>
                      updateCell(i, "className", e.target.value)
                    }
                  />
                </td>
                <td className="border border-gray-200 p-0">
                  <input
                    className="w-full border-0 bg-transparent px-2 py-1.5 text-xs outline-none focus:bg-yellow-50"
                    value={row.targetSchool}
                    onChange={(e) =>
                      updateCell(i, "targetSchool", e.target.value)
                    }
                    placeholder="志望校"
                  />
                </td>
                <td className="border border-gray-200 p-0">
                  <textarea
                    rows={3}
                    className="w-full resize-none border-0 bg-transparent px-2 py-1.5 text-xs leading-relaxed outline-none focus:bg-yellow-50"
                    value={row.initialMockExams}
                    onChange={(e) =>
                      updateCell(i, "initialMockExams", e.target.value)
                    }
                    placeholder="開始時成績"
                  />
                </td>
                <td className="border border-gray-200 p-0">
                  <input
                    list="cram-school-list"
                    className="w-full border-0 bg-transparent px-1 py-1.5 text-xs outline-none focus:bg-yellow-50"
                    value={row.mockExamPattern}
                    onChange={(e) =>
                      updateCell(i, "mockExamPattern", e.target.value)
                    }
                  />
                </td>
                {SUBJECTS.map((subject) => (
                  <td key={subject} className="border border-gray-200 p-0">
                    <TeacherAssignmentInput
                      teacherId={row.teachers[subject] ?? ""}
                      teacherName={teacherDisplayName(
                        row.teachers[subject] ?? "",
                        teachers,
                      )}
                      options={teachers}
                      className="w-full border-0 bg-transparent px-1 py-1.5 text-xs outline-none focus:bg-yellow-50"
                      onChange={(teacherId) => updateTeacher(i, subject, teacherId)}
                    />
                  </td>
                ))}
                <td className="sticky right-0 z-10 border border-gray-200 bg-white p-1 text-center shadow-[-4px_0_8px_rgba(0,0,0,0.06)]">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                    title="行を削除"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        表の上で Ctrl+V でも貼り付けできます。行の右クリックで「削除」、または右端の「削除」ボタンで行を消せます。同名の生徒がいる場合は上書き更新されます。
      </p>
    </div>
  );
}
