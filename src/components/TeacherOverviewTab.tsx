"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NameSearchInput } from "@/components/NameSearchInput";
import { EXAM_DR_CAMPUS_NAMES } from "@/lib/constants";
import {
  COURSE_PROPOSAL_SEASON_LABELS,
  COURSE_PROPOSAL_SEASONS,
  defaultCourseProposalSeason,
  defaultCourseProposalYear,
  type CourseProposalSeason,
} from "@/lib/course-proposal-types";
import { formatYearMonth } from "@/lib/months";
import { matchesNameQuery } from "@/lib/name-search";
import type {
  TeacherOverviewSheetKind,
  TeacherOverviewStudentRow,
  TeacherOverviewTeacherGroup,
} from "@/lib/teacher-overview";

type Props = {
  showAdminSearch?: boolean;
};

const SHEET_KIND_OPTIONS: {
  kind: TeacherOverviewSheetKind;
  label: string;
}[] = [
  { kind: "program", label: "合格プログラム" },
  { kind: "final-stretch", label: "直前期シート" },
  { kind: "course-proposal", label: "講習提案書" },
];

function currentYearMonth(): string {
  const now = new Date();
  return formatYearMonth(now.getFullYear(), now.getMonth() + 1);
}

function overviewDescription(kind: TeacherOverviewSheetKind): string {
  switch (kind) {
    case "program":
      return "講師ごとの担当生徒と、開始月から6か月分の月ボックス入力状況（〇＝入力あり）を確認できます。氏名をクリックすると合格プログラムを開きます。";
    case "final-stretch":
      return "講師ごとの担当6年生と、11月・12月・1月の入力状況（〇＝入力あり）を確認できます。氏名をクリックすると直前期シートを開きます。";
    case "course-proposal":
      return "生徒ごとの提案内容・提案コマ数を一覧できます。各科目の提案内容の下に担当講師名を表示します。氏名をクリックすると講習提案書を開きます。担当あり未入力は薄い赤、担当なしは灰色です。";
  }
}

function courseProposalCellClass(
  hasAssignee: boolean | undefined,
  value: string | undefined,
): string {
  if (!hasAssignee) return "bg-gray-100 text-gray-400";
  if (!value?.trim()) return "bg-red-50";
  return "";
}

export function TeacherOverviewTab({ showAdminSearch = false }: Props) {
  const router = useRouter();
  const [sheetKind, setSheetKind] = useState<TeacherOverviewSheetKind>("program");
  const [startYearMonth, setStartYearMonth] = useState(currentYearMonth);
  const [proposalYear, setProposalYear] = useState(defaultCourseProposalYear());
  const [proposalSeason, setProposalSeason] = useState<CourseProposalSeason>(
    defaultCourseProposalSeason(),
  );
  const [teachers, setTeachers] = useState<TeacherOverviewTeacherGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState("");
  const [teacherQuery, setTeacherQuery] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [campusFilter, setCampusFilter] = useState("");

  const columnHeaders = useMemo(() => {
    if (sheetKind !== "course-proposal") {
      return teachers[0]?.students[0]?.months ?? [];
    }
    const bySubject = new Map<string, TeacherOverviewStudentRow["months"][number]>();
    for (const teacher of teachers) {
      for (const student of teacher.students) {
        for (const column of student.months) {
          if (!bySubject.has(column.yearMonth)) {
            bySubject.set(column.yearMonth, column);
          }
        }
      }
    }
    return [...bySubject.values()];
  }, [teachers, sheetKind]);

  const teacherNameOptions = useMemo(() => {
    if (sheetKind === "course-proposal") {
      const names = new Set<string>();
      for (const teacher of teachers) {
        for (const student of teacher.students) {
          for (const cell of student.months) {
            if (cell.assigneeName?.trim()) names.add(cell.assigneeName.trim());
          }
        }
      }
      return [...names].sort((a, b) => a.localeCompare(b, "ja"));
    }
    return teachers.map((teacher) => teacher.teacherName);
  }, [teachers, sheetKind]);

  const studentNameOptions = useMemo(() => {
    const names = new Set<string>();
    for (const teacher of teachers) {
      for (const student of teacher.students) {
        names.add(student.studentName);
      }
    }
    return [...names];
  }, [teachers]);

  const filteredTeachers = useMemo(() => {
    if (!showAdminSearch) return teachers;

    if (sheetKind === "course-proposal") {
      const students = teachers
        .flatMap((teacher) => teacher.students)
        .filter((student) => {
          if (!matchesNameQuery(student.studentName, studentQuery)) return false;
          if (!teacherQuery.trim()) return true;
          return student.months.some((cell) =>
            matchesNameQuery(cell.assigneeName ?? "", teacherQuery),
          );
        })
        .sort((a, b) => a.studentName.localeCompare(b.studentName, "ja"));

      if (students.length === 0) return [];
      return [
        {
          teacherId: "course-proposal-students",
          teacherName: "",
          students,
        },
      ];
    }

    return teachers
      .filter((teacher) => matchesNameQuery(teacher.teacherName, teacherQuery))
      .map((teacher) => ({
        ...teacher,
        students: teacher.students.filter(
          (student) =>
            matchesNameQuery(student.studentName, studentQuery) &&
            (!campusFilter || student.sheetCampus === campusFilter),
        ),
      }))
      .filter((teacher) => teacher.students.length > 0);
  }, [
    teachers,
    showAdminSearch,
    teacherQuery,
    studentQuery,
    campusFilter,
    sheetKind,
  ]);

  const courseProposalStudents = useMemo(() => {
    if (sheetKind !== "course-proposal") return [];
    const uniqueByStudentId = new Map<string, TeacherOverviewStudentRow>();
    for (const student of filteredTeachers.flatMap((teacher) => teacher.students)) {
      // API側で同一生徒が重複して返ってきても、一覧表示は1行に保つ。
      if (!uniqueByStudentId.has(student.studentId)) {
        uniqueByStudentId.set(student.studentId, student);
      }
    }
    return [...uniqueByStudentId.values()];
  }, [filteredTeachers, sheetKind]);

  const hasActiveSearch =
    showAdminSearch &&
    Boolean(
      teacherQuery.trim() ||
        studentQuery.trim() ||
        (sheetKind !== "course-proposal" && campusFilter),
    );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    const url =
      sheetKind === "program"
        ? `/api/programs/teacher-overview?startYearMonth=${encodeURIComponent(startYearMonth)}`
        : sheetKind === "final-stretch"
          ? "/api/programs/final-stretch/teacher-overview"
          : `/api/programs/course-proposal/teacher-overview?year=${proposalYear}&season=${encodeURIComponent(proposalSeason)}`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        return res.json() as Promise<{
          teachers: TeacherOverviewTeacherGroup[];
        }>;
      })
      .then((data) => {
        if (!cancelled) setTeachers(data.teachers);
      })
      .catch(() => {
        if (!cancelled) setError("講師別一覧を読み込めませんでした");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sheetKind, startYearMonth, proposalYear, proposalSeason]);

  const openSheet = async (row: TeacherOverviewStudentRow) => {
    const rowKey =
      sheetKind === "course-proposal"
        ? row.studentId
        : `${row.teacherId}:${row.studentId}:${row.subject}`;
    setOpeningId(rowKey);
    setOpenError("");

    try {
      if (sheetKind === "program") {
        if (!row.sheetId) {
          const res = await fetch("/api/programs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              studentId: row.studentId,
              subject: row.subject,
              teacherId: row.teacherId,
              startYearMonth,
            }),
          });
          if (!res.ok) {
            setOpenError("シートを開けませんでした。権限または通信エラーの可能性があります。");
            return;
          }
        }

        const params = new URLSearchParams({
          student: row.studentId,
          subject: row.subject,
          month: startYearMonth,
          tab: "program",
          name: row.studentName,
          grade: row.grade,
        });
        router.push(`/maker?${params.toString()}`);
        return;
      }

      if (sheetKind === "final-stretch") {
        const res = await fetch("/api/programs/final-stretch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: row.studentId,
            subject: row.subject,
            teacherId: row.teacherId,
          }),
        });
        if (!res.ok) {
          setOpenError("直前期シートを開けませんでした。権限または通信エラーの可能性があります。");
          return;
        }

        const params = new URLSearchParams({
          student: row.studentId,
          subject: row.subject,
          tab: "final-stretch",
          name: row.studentName,
          grade: row.grade,
        });
        router.push(`/maker?${params.toString()}`);
        return;
      }

      const res = await fetch("/api/programs/course-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: row.studentId,
          teacherId: row.teacherId,
          year: proposalYear,
          season: proposalSeason,
        }),
      });
      if (!res.ok) {
        setOpenError("講習提案書を開けませんでした。権限または通信エラーの可能性があります。");
        return;
      }

      const params = new URLSearchParams({
        student: row.studentId,
        tab: "course-proposal",
        proposalYear: String(proposalYear),
        proposalSeason: proposalSeason,
        name: row.studentName,
        grade: row.grade,
      });
      router.push(`/maker?${params.toString()}`);
    } finally {
      setOpeningId(null);
    }
  };

  const showSubjectColumn = sheetKind !== "course-proposal";
  const showCampusColumn = sheetKind !== "course-proposal";
  const isCourseProposalOverview = sheetKind === "course-proposal";

  return (
    <div className="mx-auto max-w-6xl px-2">
      <div className="rounded border bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900">講師別</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {SHEET_KIND_OPTIONS.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  className={`rounded px-4 py-2 text-sm ${
                    sheetKind === option.kind
                      ? "bg-[#1e3a5f] text-white"
                      : "border bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                  onClick={() => setSheetKind(option.kind)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {overviewDescription(sheetKind)}
            </p>
            {showAdminSearch ? (
              <div className="mt-3 flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-gray-50 p-3">
                <NameSearchInput
                  label="講師名"
                  value={teacherQuery}
                  options={teacherNameOptions}
                  placeholder="講師名で絞り込み"
                  onChange={setTeacherQuery}
                />
                <NameSearchInput
                  label="生徒名"
                  value={studentQuery}
                  options={studentNameOptions}
                  placeholder="生徒名で絞り込み"
                  onChange={setStudentQuery}
                />
                {sheetKind !== "course-proposal" ? (
                  <label className="block min-w-[9rem] text-sm">
                    <span className="mb-1 block text-xs font-medium text-gray-700">
                      校舎
                    </span>
                    <select
                      className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                      value={campusFilter}
                      onChange={(event) => setCampusFilter(event.target.value)}
                    >
                      <option value="">すべて</option>
                      {EXAM_DR_CAMPUS_NAMES.map((campus) => (
                        <option key={campus} value={campus}>
                          {campus}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {hasActiveSearch ? (
                  <button
                    type="button"
                    className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                    onClick={() => {
                      setTeacherQuery("");
                      setStudentQuery("");
                      setCampusFilter("");
                    }}
                  >
                    クリア
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {sheetKind === "program" ? (
            <label className="shrink-0 text-sm">
              開始月
              <input
                type="month"
                className="ml-2 rounded border px-2 py-1"
                value={startYearMonth}
                onChange={(e) => {
                  if (e.target.value) setStartYearMonth(e.target.value);
                }}
              />
            </label>
          ) : sheetKind === "course-proposal" ? (
            <div className="flex shrink-0 flex-wrap items-end gap-3">
              <label className="text-sm">
                年度
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  className="ml-2 w-24 rounded border px-2 py-1"
                  value={proposalYear}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (!Number.isFinite(next)) return;
                    setProposalYear(next);
                  }}
                />
              </label>
              <label className="text-sm">
                講習期
                <select
                  className="ml-2 rounded border px-2 py-1"
                  value={proposalSeason}
                  onChange={(e) => {
                    const next = e.target.value as CourseProposalSeason;
                    if (!COURSE_PROPOSAL_SEASONS.includes(next)) return;
                    setProposalSeason(next);
                  }}
                >
                  {COURSE_PROPOSAL_SEASONS.map((season) => (
                    <option key={season} value={season}>
                      {COURSE_PROPOSAL_SEASON_LABELS[season]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </div>

        {openError ? (
          <p className="mb-3 text-sm text-red-600">{openError}</p>
        ) : null}

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500">読み込み中…</p>
        ) : error ? (
          <p className="py-8 text-center text-sm text-red-600">{error}</p>
        ) : (isCourseProposalOverview
            ? courseProposalStudents.length === 0
            : filteredTeachers.length === 0) ? (
          <p className="py-8 text-center text-sm text-gray-500">
            {hasActiveSearch
              ? "条件に一致する担当がありません。"
              : "表示できる担当がありません。"}
          </p>
        ) : isCourseProposalOverview ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-600">
                  <th className="sticky left-0 z-10 bg-gray-50 px-2 py-2 font-medium">
                    生徒
                  </th>
                  {columnHeaders.flatMap((column) => [
                    <th
                      key={`${column.yearMonth}-advice`}
                      className="min-w-[7rem] px-1.5 py-1.5 text-center font-medium"
                    >
                      {column.monthLabel}
                      <span className="mt-0.5 block text-[10px] font-normal text-gray-500">
                        提案内容
                      </span>
                    </th>,
                    <th
                      key={`${column.yearMonth}-count`}
                      className="w-12 px-1.5 py-1.5 text-center font-medium"
                    >
                      {column.monthLabel}
                      <span className="mt-0.5 block text-[10px] font-normal text-gray-500">
                        コマ数
                      </span>
                    </th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {courseProposalStudents.map((student) => {
                  const opening = openingId === student.studentId;
                  return (
                    <tr
                      key={student.studentId}
                      className="border-b last:border-b-0 hover:bg-gray-50"
                    >
                      <td className="sticky left-0 z-10 bg-white px-2 py-2">
                        <button
                          type="button"
                          className="font-medium text-[#1e3a5f] underline-offset-2 hover:underline disabled:opacity-50"
                          disabled={opening}
                          onClick={() => void openSheet(student)}
                        >
                          {student.studentName}
                          <span className="ml-1 text-[10px] text-gray-500">
                            （{student.grade}）
                          </span>
                        </button>
                      </td>
                      {columnHeaders.flatMap((header) => {
                        const column = student.months.find(
                          (item) => item.yearMonth === header.yearMonth,
                        );
                        return [
                          <td
                            key={`${header.yearMonth}-advice`}
                            className={`max-w-[10rem] px-1.5 py-1.5 align-top text-[10px] leading-snug whitespace-pre-wrap ${courseProposalCellClass(column?.hasAssignee, column?.advice) || "text-gray-800"}`}
                          >
                            <div>{column?.advice || "—"}</div>
                            {column?.hasAssignee && column.assigneeName ? (
                              <div className="mt-1 text-[9px] font-medium text-[#1e3a5f]">
                                {column.assigneeName}
                              </div>
                            ) : null}
                          </td>,
                          <td
                            key={`${header.yearMonth}-count`}
                            className={`px-1.5 py-1.5 text-center align-top text-[10px] tabular-nums ${courseProposalCellClass(column?.hasAssignee, column?.sessionCount) || "text-gray-800"}`}
                          >
                            {column?.sessionCount || "—"}
                          </td>,
                        ];
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredTeachers.map((teacher) => (
              <section key={teacher.teacherId}>
                <h3 className="mb-2 border-b border-[#1e3a5f]/20 pb-1 text-base font-semibold text-[#1e3a5f]">
                  {teacher.teacherName}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-600">
                        <th className="px-2 py-2 font-medium">生徒</th>
                        {showSubjectColumn ? (
                          <th className="px-2 py-2 font-medium">科目</th>
                        ) : null}
                        {showCampusColumn ? (
                          <th className="px-2 py-2 font-medium">校舎</th>
                        ) : null}
                        {columnHeaders.map((column) => (
                          <th
                            key={column.yearMonth}
                            className="px-2 py-2 text-center font-medium"
                          >
                            {column.monthLabel}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {teacher.students.map((student) => {
                        const rowKey = `${student.teacherId}:${student.studentId}:${student.subject}`;
                        const opening = openingId === rowKey;
                        return (
                          <tr
                            key={rowKey}
                            className="border-b last:border-b-0 hover:bg-gray-50"
                          >
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                className="font-medium text-[#1e3a5f] underline-offset-2 hover:underline disabled:opacity-50"
                                disabled={opening}
                                onClick={() => void openSheet(student)}
                              >
                                {student.studentName}
                                <span className="ml-1 text-[10px] text-gray-500">
                                  （{student.grade}）
                                </span>
                              </button>
                            </td>
                            {showSubjectColumn ? (
                              <td className="px-2 py-2 text-gray-800">
                                {student.subject}
                              </td>
                            ) : null}
                            {showCampusColumn ? (
                              <td className="px-2 py-2 text-xs text-gray-600">
                                {student.sheetCampus || "—"}
                              </td>
                            ) : null}
                            {student.months.map((column) => (
                              <td
                                key={column.yearMonth}
                                className="px-2 py-2 text-center text-gray-800"
                              >
                                {column.filled ? "〇" : ""}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
