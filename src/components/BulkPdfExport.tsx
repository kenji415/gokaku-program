"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  consumeBulkPdfExportStream,
  formatBulkPdfSaveMessage,
} from "@/lib/client-bulk-pdf-export";
import { formatPdfExportedAt } from "@/lib/pdf-sheet-utils";
import { isBrokenStudentName } from "@/lib/student-spreadsheet-utils";

type Assignment = {
  studentId: string;
  studentName: string;
  grade: string;
  subject: string;
};

type StudentStatus = {
  studentId: string;
  pdfExportedAt: string | null;
  unfilledMonthLabels: string[];
};

type Props = {
  assignments: Assignment[];
};

function formatUnfilledStatus(labels: string[]): string {
  if (labels.length === 0) return "";
  return `${labels.join("・")}未入力`;
}

export function BulkPdfExport({ assignments }: Props) {
  const subjectOptions = useMemo(() => {
    const subjects = new Set<string>();
    for (const assignment of assignments) {
      subjects.add(assignment.subject);
    }
    return [...subjects].sort((a, b) => a.localeCompare(b, "ja"));
  }, [assignments]);

  const [startYearMonth, setStartYearMonth] = useState("2026-06");
  const [subject, setSubject] = useState(subjectOptions[0] ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusByStudentId, setStatusByStudentId] = useState<
    Map<string, StudentStatus>
  >(new Map());
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const students = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; grade: string; subject: string }
    >();
    for (const assignment of assignments) {
      if (assignment.subject !== subject) continue;
      if (isBrokenStudentName(assignment.studentName)) continue;
      if (!map.has(assignment.studentId)) {
        map.set(assignment.studentId, {
          id: assignment.studentId,
          name: assignment.studentName,
          grade: assignment.grade,
          subject: assignment.subject,
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "ja"),
    );
  }, [assignments, subject]);

  const loadStatuses = useCallback(async () => {
    if (!subject) {
      setStatusByStudentId(new Map());
      return;
    }

    setLoadingStatus(true);
    try {
      const params = new URLSearchParams({ startYearMonth, subject });
      const res = await fetch(`/api/programs/bulk-pdf?${params.toString()}`);
      const data = (await res.json()) as {
        statuses?: StudentStatus[];
        error?: string;
      };

      if (!res.ok) {
        setStatusByStudentId(new Map());
        return;
      }

      const next = new Map<string, StudentStatus>();
      for (const status of data.statuses ?? []) {
        next.set(status.studentId, status);
      }
      setStatusByStudentId(next);
    } catch {
      setStatusByStudentId(new Map());
    } finally {
      setLoadingStatus(false);
    }
  }, [startYearMonth, subject]);

  useEffect(() => {
    void loadStatuses();
  }, [loadStatuses]);

  const allSelected =
    students.length > 0 && students.every((s) => selectedIds.has(s.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(students.map((s) => s.id)));
  };

  const toggleStudent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    if (selectedIds.size === 0) {
      setError("生徒を1人以上選択してください");
      setMessage("");
      return;
    }
    if (!subject) {
      setError("科目を選択してください");
      setMessage("");
      return;
    }

    setExporting(true);
    setExportProgress(0);
    setError("");
    setMessage("PDFを作成しています… 0%");

    try {
      const res = await fetch("/api/programs/bulk-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startYearMonth,
          subject,
          studentIds: [...selectedIds],
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "PDFの一括作成に失敗しました");
        setMessage("");
        return;
      }

      if (!res.body) {
        setError("PDFの一括作成に失敗しました");
        setMessage("");
        return;
      }

      const result = await consumeBulkPdfExportStream(res.body, {
        onProgress: (doneCount, total) => {
          const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
          setExportProgress(percent);
          setMessage(`PDFを作成しています… ${percent}%`);
        },
      });

      const created = result.created;
      const failed = result.failed;

      setStatusByStudentId((prev) => {
        const next = new Map(prev);
        for (const item of created) {
          const current = next.get(item.studentId);
          next.set(item.studentId, {
            studentId: item.studentId,
            pdfExportedAt: item.pdfExportedAt,
            unfilledMonthLabels: current?.unfilledMonthLabels ?? [],
          });
        }
        for (const item of failed) {
          if (!item.error.includes("未入力")) continue;
          const labels = item.error.replace(/未入力$/, "").split("・");
          const current = next.get(item.studentId);
          next.set(item.studentId, {
            studentId: item.studentId,
            pdfExportedAt: current?.pdfExportedAt ?? null,
            unfilledMonthLabels: labels.filter(Boolean),
          });
        }
        return next;
      });

      if (failed.length > 0) {
        const failedNames = failed
          .map((item) => `${item.name || item.studentId}: ${item.error}`)
          .join(" / ");
        setError(`一部スキップまたは失敗: ${failedNames}`);
      } else {
        setError("");
      }

      if (created.length > 0) {
        setMessage(formatBulkPdfSaveMessage(result));
      } else if (failed.length > 0) {
        setMessage("PDFは作成されませんでした（未入力の月があります）");
      } else {
        setMessage("");
      }

      await loadStatuses();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "PDFの一括作成に失敗しました",
      );
      setMessage("");
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  if (subjectOptions.length === 0) {
    return (
      <div className="mx-auto max-w-3xl rounded border bg-white p-8 text-center text-sm text-gray-500">
        担当生徒がいません。生徒一覧から担当を設定してください。
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-2">
      <div className="rounded border bg-white p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">PDF一括作成</h2>
          <p className="mt-1 text-xs text-gray-500">
            卒塾生を除く担当生徒のプログラムシートをPDFで一括作成し、ダウンロードフォルダに保存します。同名ファイルは上書きされます。月のボックスが空欄の生徒はスキップされ、「〇月未入力」と表示されます。作成したPDFの日付を記録します。
          </p>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-4">
          <label className="text-sm">
            開始月
            <input
              type="month"
              className="ml-2 rounded border px-2 py-1"
              value={startYearMonth}
              onChange={(e) => setStartYearMonth(e.target.value)}
            />
          </label>
          <label className="text-sm">
            科目
            <select
              className="ml-2 rounded border px-2 py-1"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setSelectedIds(new Set());
              }}
            >
              {subjectOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded bg-[#1e3a5f] px-4 py-2 text-sm text-white hover:bg-[#2a4f7a] disabled:opacity-50"
            onClick={() => void handleExport()}
            disabled={exporting || students.length === 0}
          >
            {exporting
              ? exportProgress != null
                ? `作成中… ${exportProgress}%`
                : "作成中…"
              : "PDF作成"}
          </button>
        </div>

        {message ? (
          <p className="mb-3 text-sm text-green-700">{message}</p>
        ) : null}
        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
        {loadingStatus ? (
          <p className="mb-3 text-xs text-gray-500">入力状況を読み込み中…</p>
        ) : null}

        {students.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            この科目の担当生徒がいません。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs text-gray-600">
                  <th className="px-3 py-2 font-medium">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                      />
                      全選択
                    </label>
                  </th>
                  <th className="px-3 py-2 font-medium">氏名</th>
                  <th className="px-3 py-2 font-medium">学年</th>
                  <th className="px-3 py-2 font-medium">状態</th>
                  <th className="px-3 py-2 font-medium">PDF作成日</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const status = statusByStudentId.get(student.id);
                  const unfilled = status?.unfilledMonthLabels ?? [];
                  const statusText =
                    unfilled.length > 0
                      ? formatUnfilledStatus(unfilled)
                      : "作成可";
                  const pdfDate = formatPdfExportedAt(status?.pdfExportedAt);

                  return (
                    <tr key={student.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(student.id)}
                          onChange={() => toggleStudent(student.id)}
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-900">{student.name}</td>
                      <td className="px-3 py-2 text-gray-800">{student.grade}</td>
                      <td
                        className={`px-3 py-2 text-xs ${
                          unfilled.length > 0
                            ? "font-medium text-red-600"
                            : "text-gray-600"
                        }`}
                      >
                        {statusText}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {pdfDate || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
