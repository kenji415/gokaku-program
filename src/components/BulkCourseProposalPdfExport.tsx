"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  consumeBulkPdfExportStream,
  formatBulkPdfSaveMessage,
} from "@/lib/client-bulk-pdf-export";
import {
  COURSE_PROPOSAL_SEASON_LABELS,
  COURSE_PROPOSAL_SEASONS,
  defaultCourseProposalSeason,
  defaultCourseProposalYear,
  type CourseProposalSeason,
} from "@/lib/course-proposal-types";
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
};

type Props = {
  assignments: Assignment[];
};

export function BulkCourseProposalPdfExport({ assignments }: Props) {
  const [year, setYear] = useState(defaultCourseProposalYear());
  const [season, setSeason] = useState<CourseProposalSeason>(
    defaultCourseProposalSeason(),
  );
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
      { id: string; name: string; grade: string }
    >();
    for (const assignment of assignments) {
      if (isBrokenStudentName(assignment.studentName)) continue;
      if (!map.has(assignment.studentId)) {
        map.set(assignment.studentId, {
          id: assignment.studentId,
          name: assignment.studentName,
          grade: assignment.grade,
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "ja"),
    );
  }, [assignments]);

  const loadStatuses = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        season,
      });
      const res = await fetch(
        `/api/programs/course-proposal/bulk-pdf?${params.toString()}`,
      );
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
  }, [year, season]);

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

    setExporting(true);
    setExportProgress(0);
    setError("");
    setMessage("PDFを作成しています… 0%");

    try {
      const res = await fetch("/api/programs/course-proposal/bulk-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          season,
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
          next.set(item.studentId, {
            studentId: item.studentId,
            pdfExportedAt: item.pdfExportedAt,
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
        setMessage("PDFは作成されませんでした");
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

  if (students.length === 0) {
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
          <h2 className="text-lg font-semibold text-gray-900">
            講習提案書 PDF一括作成
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            卒塾生を除く担当生徒の講習提案書をPDFで一括作成し、ダウンロードフォルダに保存します。同名ファイルは上書きされます。作成したPDFの日付を記録します。
          </p>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-4">
          <label className="text-sm">
            年度
            <input
              type="number"
              min={2000}
              max={2100}
              className="ml-2 w-24 rounded border px-2 py-1"
              value={year}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (!Number.isFinite(next)) return;
                setYear(next);
                setSelectedIds(new Set());
              }}
            />
          </label>
          <label className="text-sm">
            講習期
            <select
              className="ml-2 rounded border px-2 py-1"
              value={season}
              onChange={(e) => {
                const next = e.target.value as CourseProposalSeason;
                if (!COURSE_PROPOSAL_SEASONS.includes(next)) return;
                setSeason(next);
                setSelectedIds(new Set());
              }}
            >
              {COURSE_PROPOSAL_SEASONS.map((item) => (
                <option key={item} value={item}>
                  {COURSE_PROPOSAL_SEASON_LABELS[item]}
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
          <p className="mb-3 text-xs text-gray-500">状況を読み込み中…</p>
        ) : null}

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
                <th className="px-3 py-2 font-medium">PDF作成日</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const status = statusByStudentId.get(student.id);
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
                    <td className="px-3 py-2 text-gray-700">
                      {pdfDate || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
