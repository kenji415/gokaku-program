"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NameSearchInput } from "@/components/NameSearchInput";
import { EXAM_DR_CAMPUS_NAMES } from "@/lib/constants";
import { formatYearMonth } from "@/lib/months";
import { matchesNameQuery } from "@/lib/name-search";
import type {
  TeacherOverviewTeacherGroup,
  TeacherOverviewStudentRow,
} from "@/lib/teacher-overview";

type Props = {
  showAdminSearch?: boolean;
};

function currentYearMonth(): string {
  const now = new Date();
  return formatYearMonth(now.getFullYear(), now.getMonth() + 1);
}

export function TeacherOverviewTab({ showAdminSearch = false }: Props) {
  const router = useRouter();
  const [startYearMonth, setStartYearMonth] = useState(currentYearMonth);
  const [teachers, setTeachers] = useState<TeacherOverviewTeacherGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [teacherQuery, setTeacherQuery] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [campusFilter, setCampusFilter] = useState("");

  const monthHeaders = useMemo(
    () => teachers[0]?.students[0]?.months ?? [],
    [teachers],
  );

  const teacherNameOptions = useMemo(
    () => teachers.map((teacher) => teacher.teacherName),
    [teachers],
  );

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
  }, [teachers, showAdminSearch, teacherQuery, studentQuery, campusFilter]);

  const hasActiveSearch =
    showAdminSearch &&
    Boolean(teacherQuery.trim() || studentQuery.trim() || campusFilter);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetch(
      `/api/programs/teacher-overview?startYearMonth=${encodeURIComponent(startYearMonth)}`,
    )
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
  }, [startYearMonth]);

  const openSheet = async (row: TeacherOverviewStudentRow) => {
    const key = `${row.teacherId}:${row.studentId}:${row.subject}`;
    setOpeningId(key);
    try {
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
        if (!res.ok) return;
      }

      const params = new URLSearchParams({
        student: row.studentId,
        subject: row.subject,
        month: startYearMonth,
        tab: "program",
      });
      router.push(`/maker?${params.toString()}`);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-2">
      <div className="rounded border bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900">講師別</h2>
            <p className="mt-1 text-xs text-gray-500">
              講師ごとの担当生徒と、開始月から6か月分の月ボックス入力状況（〇＝入力あり）を確認できます。氏名をクリックするとプログラムシートを開きます。
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
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500">読み込み中…</p>
        ) : error ? (
          <p className="py-8 text-center text-sm text-red-600">{error}</p>
        ) : filteredTeachers.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            {hasActiveSearch
              ? "条件に一致する担当がありません。"
              : "表示できる担当がありません。"}
          </p>
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
                        <th className="px-2 py-2 font-medium">科目</th>
                        <th className="px-2 py-2 font-medium">校舎</th>
                        {monthHeaders.map((month) => (
                          <th
                            key={month.yearMonth}
                            className="px-2 py-2 text-center font-medium"
                          >
                            {month.monthLabel}
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
                                <span className="ml-1 text-xs text-gray-500">
                                  （{student.grade}）
                                </span>
                              </button>
                            </td>
                            <td className="px-2 py-2 text-gray-800">
                              {student.subject}
                            </td>
                            <td className="px-2 py-2 text-xs text-gray-600">
                              {student.sheetCampus || "—"}
                            </td>
                            {student.months.map((month) => (
                              <td
                                key={month.yearMonth}
                                className="px-2 py-2 text-center text-gray-800"
                              >
                                {month.filled ? "〇" : ""}
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
