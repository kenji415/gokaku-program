"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BulkPdfExport } from "@/components/BulkPdfExport";
import { BulkFinalStretchPdfExport } from "@/components/BulkFinalStretchPdfExport";
import { BulkCourseProposalPdfExport } from "@/components/BulkCourseProposalPdfExport";
import { FinalStretchSheet } from "@/components/FinalStretchSheet";
import { AppHeaderShell } from "@/components/AppHeaderShell";
import { TeacherDefaultCampusField } from "@/components/TeacherDefaultCampus";
import { TeacherOverviewTab } from "@/components/TeacherOverviewTab";
import { ProgramSheet } from "@/components/ProgramSheet";
import { TeacherStudentBasicInfo } from "@/components/TeacherStudentBasicInfo";
import { TeacherStudentList } from "@/components/TeacherStudentList";
import { ScoreHistoryPanel } from "@/components/ScoreHistoryPanel";
import { CourseProposalSheet } from "@/components/CourseProposalSheet";
import { useAutoSave } from "@/hooks/use-auto-save";
import { buildPdfFilename, buildFinalStretchPdfFilename, buildCourseProposalPdfFilename, formatYearMonthJapanese, shiftYearMonth } from "@/lib/months";
import { savePdfFromResponse } from "@/lib/client-pdf-download";
import type {
  MakerStudentListItem,
  ProgramMonthTestPoolItem,
  ProgramSheetData,
  StudentTestResultInput,
} from "@/lib/programs";
import type { RecentTestResult, StudentTestResultHistoryItem } from "@/lib/test-results";
import { hasScoreResult, EMPTY_TEST_RESULT } from "@/lib/test-result-types";
import { compareByGradeThenName, gradeSortRank } from "@/lib/constants";
import { NEW_STUDENT_ID } from "@/lib/student-constants";
import type { StudentBasicInfo } from "@/lib/student-basic-info-types";
import { isBrokenStudentName } from "@/lib/student-spreadsheet-utils";
import { formatGraduationYear } from "@/lib/graduation";
import { useTeacherDefaultCampus } from "@/components/TeacherDefaultCampus";
import {
  buildMakerSearchParams,
  makerStateFromSearchParams,
  resolveMakerStateFromSearchParams,
  type MakerTab,
} from "@/lib/maker-url-state";
import {
  isFinalStretchGrade,
  type FinalStretchRowData,
  type FinalStretchSheetData,
} from "@/lib/final-stretch-types";
import {
  COURSE_PROPOSAL_SEASON_LABELS,
  COURSE_PROPOSAL_SEASONS,
  defaultCourseProposalYear,
  type CourseProposalSeason,
  type CourseProposalSheetData,
  type CourseProposalSubject,
  type CourseProposalSubjectData,
} from "@/lib/course-proposal-types";

function normalizeStudentId(id: string | number | null | undefined): string {
  if (id == null) return "";
  return String(id).trim();
}

const navArrowBtnClass =
  "border-0 bg-transparent p-0 text-[10px] leading-none text-gray-600 hover:text-gray-900";

type Assignment = {
  assignmentId: string;
  studentId: string;
  studentName: string;
  grade: string;
  subject: string;
};

type MakerClientProps = {
  teacherId: string;
  teacherName: string;
  isAdmin: boolean;
  showMakerCampusField: boolean;
  assignments: Assignment[];
  canViewTeacherOverview?: boolean;
  showAdminTeacherSearch?: boolean;
  showTestScheduleLink?: boolean;
  testScheduleReadOnly?: boolean;
};

export function MakerClient({
  teacherId,
  teacherName,
  isAdmin,
  showMakerCampusField,
  assignments,
  canViewTeacherOverview = false,
  showAdminTeacherSearch = false,
  showTestScheduleLink = false,
  testScheduleReadOnly = false,
}: MakerClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlStudentParam = searchParams.get("student")?.trim() ?? "";
  const initialMakerStateRef = useRef<ReturnType<
    typeof resolveMakerStateFromSearchParams
  > | null>(null);
  if (initialMakerStateRef.current === null) {
    initialMakerStateRef.current = resolveMakerStateFromSearchParams(
      assignments,
      canViewTeacherOverview,
      searchParams,
    );
  }
  const initialMakerState = initialMakerStateRef.current;

  const { defaultCampus } = useTeacherDefaultCampus();
  const [studentId, setStudentId] = useState(initialMakerState.studentId);
  // 新規登録→実ID付与のあいだは同一インスタンスを維持（再マウントで保存flushが空振りしないように）
  const [basicInfoKey, setBasicInfoKey] = useState(() =>
    initialMakerState.studentId === NEW_STUDENT_ID
      ? "new-initial"
      : initialMakerState.studentId || "none",
  );
  const preserveBasicInfoKeyRef = useRef(false);
  const [subject, setSubject] = useState(initialMakerState.subject);
  const [startYearMonth, setStartYearMonth] = useState(
    initialMakerState.startYearMonth,
  );
  const [sheet, setSheet] = useState<ProgramSheetData | null>(null);
  const [finalStretchSheet, setFinalStretchSheet] =
    useState<FinalStretchSheetData | null>(null);
  const [finalStretchLoadError, setFinalStretchLoadError] = useState("");
  const [scoreHistoryItems, setScoreHistoryItems] = useState<
    StudentTestResultHistoryItem[]
  >([]);
  const [scoreHistoryLoading, setScoreHistoryLoading] = useState(false);
  const [scoreHistoryError, setScoreHistoryError] = useState("");
  const [courseProposalSheet, setCourseProposalSheet] =
    useState<CourseProposalSheetData | null>(null);
  const [courseProposalYear, setCourseProposalYear] = useState(
    initialMakerState.courseProposalYear,
  );
  const [courseProposalSeason, setCourseProposalSeason] =
    useState<CourseProposalSeason>(initialMakerState.courseProposalSeason);
  const [courseProposalLoadError, setCourseProposalLoadError] = useState("");
  const [allTestsForMonth, setAllTestsForMonth] = useState<
    Record<string, ProgramMonthTestPoolItem[]>
  >({});
  const [saving, setSaving] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [switchError, setSwitchError] = useState("");
  const [activeTab, setActiveTab] = useState<MakerTab>(initialMakerState.activeTab);
  const [extraStudents, setExtraStudents] = useState<
    Map<string, { name: string; grade: string }>
  >(new Map());
  const [includeGraduated, setIncludeGraduated] = useState(false);
  const [graduatedStudents, setGraduatedStudents] = useState<
    MakerStudentListItem[]
  >([]);
  const [saveRevision, setSaveRevision] = useState(0);
  const [finalStretchSaveRevision, setFinalStretchSaveRevision] = useState(0);
  const [courseProposalSaveRevision, setCourseProposalSaveRevision] =
    useState(0);
  const [finalStretchTargetSchoolRevision, setFinalStretchTargetSchoolRevision] =
    useState(0);
  const [basicInfoRefreshKey, setBasicInfoRefreshKey] = useState(0);
  const [newStudentInitialName, setNewStudentInitialName] = useState("");
  const [showFirstLoginHint, setShowFirstLoginHint] = useState(false);
  const [showBasicInfoHint, setShowBasicInfoHint] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfMessage, setPdfMessage] = useState("");
  const [pdfError, setPdfError] = useState("");
  const sheetRef = useRef<ProgramSheetData | null>(null);
  const finalStretchSheetRef = useRef<FinalStretchSheetData | null>(null);
  const courseProposalSheetRef = useRef<CourseProposalSheetData | null>(null);
  const basicSaveFlushRef = useRef<(() => Promise<boolean>) | null>(null);
  const loadSeqRef = useRef(0);
  const finalStretchLoadSeqRef = useRef(0);
  const scoreHistoryLoadSeqRef = useRef(0);
  const courseProposalLoadSeqRef = useRef(0);
  /** URL→state 同期直後は、古い state で history を replace しない */
  const syncingFromUrlRef = useRef(false);

  const firstLoginHintKey = `maker:studentListHintSeen:${teacherId}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!window.localStorage.getItem(firstLoginHintKey)) {
        setShowFirstLoginHint(true);
      }
    } catch {
      // localStorage 利用不可時は案内を出さない
    }
  }, [firstLoginHintKey]);

  const dismissFirstLoginHint = useCallback(() => {
    setShowFirstLoginHint(false);
    try {
      window.localStorage.setItem(firstLoginHintKey, "1");
    } catch {
      // 保存できなくても無視
    }
  }, [firstLoginHintKey]);

  const basicInfoHintKey = `maker:basicInfoHintSeen:${teacherId}`;

  const maybeShowBasicInfoHint = useCallback(() => {
    try {
      if (!window.localStorage.getItem(basicInfoHintKey)) {
        setShowBasicInfoHint(true);
      }
    } catch {
      // localStorage 利用不可時は案内を出さない
    }
  }, [basicInfoHintKey]);

  const dismissBasicInfoHint = useCallback(() => {
    setShowBasicInfoHint(false);
    try {
      window.localStorage.setItem(basicInfoHintKey, "1");
    } catch {
      // 保存できなくても無視
    }
  }, [basicInfoHintKey]);

  const bumpSave = () => setSaveRevision((r) => r + 1);
  const bumpFinalStretchSave = () =>
    setFinalStretchSaveRevision((r) => r + 1);
  const bumpCourseProposalSave = () =>
    setCourseProposalSaveRevision((r) => r + 1);
  const bumpFinalStretchTargetSchoolSave = () =>
    setFinalStretchTargetSchoolRevision((r) => r + 1);

  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

  useEffect(() => {
    finalStretchSheetRef.current = finalStretchSheet;
  }, [finalStretchSheet]);

  useEffect(() => {
    courseProposalSheetRef.current = courseProposalSheet;
  }, [courseProposalSheet]);

  useEffect(() => {
    if (!pdfMessage) return;
    const timer = window.setTimeout(() => setPdfMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [pdfMessage]);

  useEffect(() => {
    if (courseProposalYear >= 2000 && courseProposalYear <= 2100) return;
    setCourseProposalYear(defaultCourseProposalYear());
  }, [courseProposalYear]);

  useEffect(() => {
    if (preserveBasicInfoKeyRef.current) {
      preserveBasicInfoKeyRef.current = false;
      return;
    }
    setBasicInfoKey((prev) => {
      if (studentId === NEW_STUDENT_ID) {
        return prev.startsWith("new-") ? prev : `new-${Date.now()}`;
      }
      const next = studentId || "none";
      return prev === next ? prev : next;
    });
  }, [studentId]);

  useEffect(() => {
    const resolved = makerStateFromSearchParams(
      assignments,
      canViewTeacherOverview,
      searchParams,
    );
    // ブラウザ戻る / openSheet の push など、URL が先に変わったときは
    // 次の state→URL effect が古い state で replace しないよう印を付ける
    syncingFromUrlRef.current = true;
    setStudentId((prev) =>
      resolved.studentId !== prev ? resolved.studentId : prev,
    );
    setSubject((prev) => (resolved.subject !== prev ? resolved.subject : prev));
    setActiveTab((prev) =>
      resolved.activeTab !== prev ? resolved.activeTab : prev,
    );
    setStartYearMonth((prev) =>
      resolved.startYearMonth !== prev ? resolved.startYearMonth : prev,
    );
    setCourseProposalYear((prev) =>
      resolved.courseProposalYear !== prev
        ? resolved.courseProposalYear
        : prev,
    );
    setCourseProposalSeason((prev) =>
      resolved.courseProposalSeason !== prev
        ? resolved.courseProposalSeason
        : prev,
    );
  }, [assignments, canViewTeacherOverview, searchParams]);

  useEffect(() => {
    const params = buildMakerSearchParams({
      studentId,
      subject,
      activeTab,
      startYearMonth,
      courseProposalYear,
      courseProposalSeason,
    });
    const query = params.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    const currentQuery = searchParams.toString();
    const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname;

    if (syncingFromUrlRef.current) {
      syncingFromUrlRef.current = false;
      const resolved = makerStateFromSearchParams(
        assignments,
        canViewTeacherOverview,
        searchParams,
      );
      const stateMatchesUrl =
        resolved.studentId === studentId &&
        resolved.subject === subject &&
        resolved.activeTab === activeTab &&
        resolved.startYearMonth === startYearMonth &&
        resolved.courseProposalYear === courseProposalYear &&
        resolved.courseProposalSeason === courseProposalSeason;
      // state が URL に追いついているときだけ正規化（name/grade 除去など）
      if (stateMatchesUrl && nextUrl !== currentUrl) {
        router.replace(nextUrl, { scroll: false });
      }
      return;
    }

    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [
    studentId,
    subject,
    activeTab,
    startYearMonth,
    courseProposalYear,
    courseProposalSeason,
    assignments,
    canViewTeacherOverview,
    pathname,
    router,
    searchParams,
  ]);

  useEffect(() => {
    if (!includeGraduated) {
      setGraduatedStudents([]);
      return;
    }

    let cancelled = false;
    fetch("/api/programs/students/list?graduated=1")
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        return res.json() as Promise<{ students: MakerStudentListItem[] }>;
      })
      .then((data) => {
        if (!cancelled) setGraduatedStudents(data.students);
      })
      .catch(() => {
        if (!cancelled) setGraduatedStudents([]);
      });

    return () => {
      cancelled = true;
    };
  }, [includeGraduated]);

  const selectedAssignment = useMemo(
    () =>
      assignments.find(
        (a) => a.studentId === studentId && a.subject === subject,
      ),
    [assignments, studentId, subject],
  );

  const studentOptions = useMemo(() => {
    const map = new Map<
      string,
      { name: string; grade: string; graduatedAt: string | null }
    >();
    for (const a of assignments) {
      if (isBrokenStudentName(a.studentName)) continue;
      const id = normalizeStudentId(a.studentId);
      if (!id || map.has(id)) continue;
      map.set(id, {
        name: a.studentName,
        grade: a.grade,
        graduatedAt: null,
      });
    }
    for (const [rawId, data] of extraStudents) {
      const id = normalizeStudentId(rawId);
      if (!id || map.has(id)) continue;
      map.set(id, { ...data, graduatedAt: null });
    }
    if (includeGraduated) {
      for (const student of graduatedStudents) {
        const id = normalizeStudentId(student.id);
        if (!id || map.has(id)) continue;
        map.set(id, {
          name: student.name,
          grade: student.grade,
          graduatedAt: student.graduatedAt,
        });
      }
    }

    const active = [...map.entries()]
      .filter(([, data]) => !data.graduatedAt)
      .map(([id, { name, grade, graduatedAt }]) => ({
        id,
        name,
        grade,
        graduatedAt,
        label: `${name}（${grade}）`,
      }))
      .sort(compareByGradeThenName);

    const archived = [...map.entries()]
      .filter(([, data]) => data.graduatedAt)
      .map(([id, { name, grade, graduatedAt }]) => ({
        id,
        name,
        grade,
        graduatedAt,
        label: `${name}（${grade}・${formatGraduationYear(graduatedAt) ?? "卒塾"}）`,
      }))
      .sort((a, b) => {
        const gradeCmp = gradeSortRank(a.grade) - gradeSortRank(b.grade);
        if (gradeCmp !== 0) return gradeCmp;
        const aTime = Date.parse(a.graduatedAt ?? "");
        const bTime = Date.parse(b.graduatedAt ?? "");
        if (aTime !== bTime) return bTime - aTime;
        return a.name.localeCompare(b.name, "ja");
      });

    const merged = [...active, ...archived];
    const seen = new Set<string>();
    return merged.filter((option) => {
      if (seen.has(option.id)) return false;
      seen.add(option.id);
      return true;
    });
  }, [
    assignments,
    extraStudents,
    includeGraduated,
    graduatedStudents,
  ]);

  const selectedStudentGrade = useMemo(() => {
    if (sheet?.student.grade) return sheet.student.grade;
    if (finalStretchSheet?.student.grade) return finalStretchSheet.student.grade;
    const fromOptions = studentOptions.find((s) => s.id === studentId)?.grade;
    if (fromOptions) return fromOptions;
    return assignments.find((a) => a.studentId === studentId)?.grade ?? "";
  }, [sheet, finalStretchSheet, studentOptions, studentId, assignments]);

  const studentNavIds = useMemo(
    () => studentOptions.map((s) => s.id),
    [studentOptions],
  );

  const isNewStudent = studentId === NEW_STUDENT_ID;

  const showFinalStretchTab =
    !isNewStudent && isFinalStretchGrade(selectedStudentGrade);

  const subjectOptions = useMemo(() => {
    if (isNewStudent) return [];
    const unique = [
      ...new Set(
        assignments
          .filter((a) => a.studentId === studentId)
          .map((a) => a.subject),
      ),
    ];
    if (subject && !unique.includes(subject)) {
      return [...unique, subject];
    }
    return unique;
  }, [assignments, studentId, isNewStudent, subject]);

  const registerStudentOption = useCallback(
    (summary: { id: string; name: string; grade: string }) => {
      const id = normalizeStudentId(summary.id);
      if (!id) return;
      setExtraStudents((prev) => {
        const next = new Map(prev);
        next.set(id, { name: summary.name, grade: summary.grade });
        return next;
      });
    },
    [],
  );

  // 講師別一覧からの担当外遷移: URL の name/grade を選択肢に先入れする
  useEffect(() => {
    if (!canViewTeacherOverview) return;
    const overviewStudentId = searchParams.get("student")?.trim() ?? "";
    const overviewName = searchParams.get("name")?.trim() ?? "";
    const overviewGrade = searchParams.get("grade")?.trim() ?? "";
    if (
      !overviewStudentId ||
      overviewStudentId === NEW_STUDENT_ID ||
      !overviewName ||
      !overviewGrade
    ) {
      return;
    }
    registerStudentOption({
      id: overviewStudentId,
      name: overviewName,
      grade: overviewGrade,
    });
  }, [canViewTeacherOverview, searchParams, registerStudentOption]);

  const handleExistingStudentFound = useCallback(
    (summary: { id: string; name: string; grade: string }) => {
      registerStudentOption(summary);
      setStudentId(summary.id);
      setActiveTab("basic");
    },
    [registerStudentOption],
  );

  const handleStudentCreated = useCallback(
    (summary: { id: string; name: string; grade: string }) => {
      registerStudentOption(summary);
      // 基本情報フォームを再マウントせず、登録済みデータ上で isNew だけ外す
      preserveBasicInfoKeyRef.current = true;
      setStudentId(summary.id);
      maybeShowBasicInfoHint();
      router.refresh();
    },
    [registerStudentOption, router, maybeShowBasicInfoHint],
  );

  const handleUnassigned = useCallback(() => {
    const removedId = studentId;
    setExtraStudents((prev) => {
      const next = new Map(prev);
      next.delete(removedId);
      return next;
    });
    setSheet(null);
    const remaining = assignments.filter((a) => a.studentId !== removedId);
    const nextAssignment = remaining[0];
    setStudentId(nextAssignment?.studentId ?? "");
    setSubject(nextAssignment?.subject ?? "");
    setActiveTab(nextAssignment ? "program" : "list");
    router.refresh();
  }, [assignments, router, studentId]);

  const handleGraduated = useCallback(() => {
    const removedId = studentId;
    setExtraStudents((prev) => {
      const next = new Map(prev);
      next.delete(removedId);
      return next;
    });
    setSheet(null);
    const remaining = assignments.filter((a) => a.studentId !== removedId);
    const nextAssignment = remaining[0];
    setStudentId(nextAssignment?.studentId ?? "");
    setSubject(nextAssignment?.subject ?? "");
    setActiveTab(nextAssignment ? "program" : "list");
    router.refresh();
  }, [assignments, router, studentId]);

  const saveSheet = useCallback(async (): Promise<boolean> => {
    const current = sheetRef.current;
    // 読込前は保存不要（失敗扱いにするとタブ切替を止めてしまう）
    if (!current) return true;

    setSaving(true);
    setSwitchError("");

    const res = await fetch(`/api/programs/${current.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campus: current.campus,
        goal: current.goal,
        initialMockExams: current.initialMockExams,
        initialChallenges: current.initialChallenges,
        months: current.months.map((m) => ({
          id: m.id,
          monthTitle: m.monthTitle,
          content: m.content,
          testIds: m.tests.map((t) => t.id),
        })),
      }),
    });

    setSaving(false);
    if (!res.ok) {
      return false;
    }

    return true;
  }, []);

  const { flush: flushSave, statusLabel: autoSaveLabel } = useAutoSave(
    saveSheet,
    saveRevision,
  );

  const saveFinalStretch = useCallback(async (): Promise<boolean> => {
    const current = finalStretchSheetRef.current;
    if (!current) return true;

    setSaving(true);
    setSwitchError("");

    const res = await fetch(`/api/programs/final-stretch/${current.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campus: current.campus,
        policy: current.policy,
        examDaySimulation: current.examDaySimulation,
        columnWidths: current.columnWidths,
        rows: current.rows,
      }),
    });

    setSaving(false);
    return res.ok;
  }, []);

  const {
    flush: flushFinalStretchSave,
    statusLabel: finalStretchAutoSaveLabel,
  } = useAutoSave(saveFinalStretch, finalStretchSaveRevision);

  const saveFinalStretchTargetSchool = useCallback(async (): Promise<boolean> => {
    const current = finalStretchSheetRef.current;
    if (!current) return true;

    const res = await fetch(
      `/api/programs/students/${current.studentId}/basic-info`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetSchool: current.student.targetSchool }),
      },
    );

    return res.ok;
  }, []);

  const { flush: flushFinalStretchTargetSchool } = useAutoSave(
    saveFinalStretchTargetSchool,
    finalStretchTargetSchoolRevision,
  );

  const flushFinalStretchAll = useCallback(async (): Promise<boolean> => {
    const [sheetSaved, targetSchoolSaved] = await Promise.all([
      flushFinalStretchSave(),
      flushFinalStretchTargetSchool(),
    ]);
    return sheetSaved && targetSchoolSaved;
  }, [flushFinalStretchSave, flushFinalStretchTargetSchool]);

  const loadFinalStretch = useCallback(async () => {
    if (!studentId || !subject || studentId === NEW_STUDENT_ID) {
      setFinalStretchSheet(null);
      return;
    }
    if (!isFinalStretchGrade(selectedStudentGrade)) {
      setFinalStretchSheet(null);
      return;
    }

    const requestId = ++finalStretchLoadSeqRef.current;
    setFinalStretchLoadError("");

    try {
      const res = await fetch("/api/programs/final-stretch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          subject,
          teacherId,
        }),
      });

      if (requestId !== finalStretchLoadSeqRef.current) return;

      if (!res.ok) {
        setFinalStretchSheet(null);
        setFinalStretchLoadError("直前期シートの読み込みに失敗しました");
        return;
      }

      const data = (await res.json()) as { sheet: FinalStretchSheetData };
      if (requestId !== finalStretchLoadSeqRef.current) return;

      setFinalStretchSheet(data.sheet);
      setFinalStretchSaveRevision(0);
      setFinalStretchLoadError("");
    } catch {
      if (requestId !== finalStretchLoadSeqRef.current) return;
      setFinalStretchSheet(null);
      setFinalStretchLoadError("直前期シートの読み込みに失敗しました");
    }
  }, [studentId, subject, teacherId, selectedStudentGrade]);

  const loadScoreHistory = useCallback(async () => {
    if (!studentId || studentId === NEW_STUDENT_ID) {
      setScoreHistoryItems([]);
      setScoreHistoryError("");
      setScoreHistoryLoading(false);
      return;
    }

    const requestId = ++scoreHistoryLoadSeqRef.current;
    setScoreHistoryLoading(true);
    setScoreHistoryError("");

    try {
      const res = await fetch(
        `/api/programs/test-results/history?studentId=${encodeURIComponent(studentId)}`,
      );

      if (requestId !== scoreHistoryLoadSeqRef.current) return;

      if (!res.ok) {
        setScoreHistoryItems([]);
        setScoreHistoryError("成績推移の読み込みに失敗しました");
        return;
      }

      const data = (await res.json()) as {
        items: StudentTestResultHistoryItem[];
      };
      if (requestId !== scoreHistoryLoadSeqRef.current) return;

      setScoreHistoryItems(data.items ?? []);
      setScoreHistoryError("");
    } catch {
      if (requestId !== scoreHistoryLoadSeqRef.current) return;
      setScoreHistoryItems([]);
      setScoreHistoryError("成績推移の読み込みに失敗しました");
    } finally {
      if (requestId === scoreHistoryLoadSeqRef.current) {
        setScoreHistoryLoading(false);
      }
    }
  }, [studentId]);

  const saveCourseProposal = useCallback(async (): Promise<boolean> => {
    const current = courseProposalSheetRef.current;
    if (!current) return true;

    setSaving(true);
    setSwitchError("");

    const res = await fetch(`/api/programs/course-proposal/${current.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjects: current.subjects,
        subjectSlots: current.subjectSlots,
      }),
    });

    setSaving(false);
    return res.ok;
  }, []);

  const {
    flush: flushCourseProposalSave,
    statusLabel: courseProposalAutoSaveLabel,
  } = useAutoSave(saveCourseProposal, courseProposalSaveRevision);

  const loadCourseProposal = useCallback(async () => {
    if (!studentId || studentId === NEW_STUDENT_ID) {
      setCourseProposalSheet(null);
      return;
    }

    const requestId = ++courseProposalLoadSeqRef.current;
    setCourseProposalLoadError("");

    try {
      const res = await fetch("/api/programs/course-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          teacherId,
          year: courseProposalYear,
          season: courseProposalSeason,
        }),
      });

      if (requestId !== courseProposalLoadSeqRef.current) return;

      if (!res.ok) {
        setCourseProposalSheet(null);
        setCourseProposalLoadError("講習提案書の読み込みに失敗しました");
        return;
      }

      const data = (await res.json()) as { sheet: CourseProposalSheetData };
      if (requestId !== courseProposalLoadSeqRef.current) return;

      setCourseProposalSheet(data.sheet);
      setCourseProposalSaveRevision(0);
      setCourseProposalLoadError("");
    } catch {
      if (requestId !== courseProposalLoadSeqRef.current) return;
      setCourseProposalSheet(null);
      setCourseProposalLoadError("講習提案書の読み込みに失敗しました");
    }
  }, [studentId, teacherId, courseProposalYear, courseProposalSeason]);

  const loadSheet = useCallback(async () => {
    if (!studentId || !subject || studentId === NEW_STUDENT_ID) {
      setInitialLoading(false);
      return;
    }

    const requestId = ++loadSeqRef.current;
    const requestedStartYearMonth = startYearMonth;
    const isRefresh = sheetRef.current != null;
    if (isRefresh) setRefreshing(true);
    else setInitialLoading(true);
    setLoadError("");

    try {
      const res = await fetch("/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          subject,
          teacherId,
          startYearMonth: requestedStartYearMonth,
        }),
      });

      if (requestId !== loadSeqRef.current) return;

      if (!res.ok) {
        setLoadError("プログラムの読み込みに失敗しました");
        if (isRefresh && sheetRef.current) {
          setStartYearMonth(sheetRef.current.startYearMonth);
        } else {
          setSheet(null);
        }
        return;
      }

      const data = (await res.json()) as {
        sheet: ProgramSheetData;
        allTestsForMonth: Record<string, ProgramMonthTestPoolItem[]>;
      };

      if (requestId !== loadSeqRef.current) return;

      setSheet(data.sheet);
      registerStudentOption({
        id: data.sheet.studentId,
        name: data.sheet.student.name,
        grade: data.sheet.student.grade,
      });
      setStartYearMonth(data.sheet.startYearMonth);
      setAllTestsForMonth(data.allTestsForMonth ?? {});
      setSaveRevision(0);
      setSwitchError("");
    } catch {
      if (requestId !== loadSeqRef.current) return;
      setLoadError("プログラムの読み込みに失敗しました");
      if (isRefresh && sheetRef.current) {
        setStartYearMonth(sheetRef.current.startYearMonth);
      } else {
        setSheet(null);
      }
    } finally {
      if (requestId === loadSeqRef.current) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, [studentId, subject, teacherId, startYearMonth, registerStudentOption]);

  useEffect(() => {
    loadSheet();
  }, [loadSheet]);

  useEffect(() => {
    if (activeTab === "final-stretch") {
      void loadFinalStretch();
    }
  }, [activeTab, loadFinalStretch]);

  useEffect(() => {
    if (activeTab === "score-history") {
      void loadScoreHistory();
    }
  }, [activeTab, loadScoreHistory]);

  useEffect(() => {
    if (activeTab === "course-proposal") {
      void loadCourseProposal();
    }
  }, [activeTab, loadCourseProposal]);

  useEffect(() => {
    setSheet((prev) => {
      if (!prev?.usesDefaultCampus) return prev;
      return { ...prev, campus: defaultCampus };
    });
  }, [defaultCampus]);

  useEffect(() => {
    if (studentId === NEW_STUDENT_ID) return;
    // 講師別一覧経由の担当外生徒は assignments に無いため、URL 指定中はリセットしない
    if (canViewTeacherOverview && urlStudentParam) {
      return;
    }
    if (
      studentOptions.length > 0 &&
      studentId &&
      !studentOptions.some((s) => s.id === studentId)
    ) {
      setStudentId(studentOptions[0]?.id ?? "");
    }
  }, [studentOptions, studentId, canViewTeacherOverview, urlStudentParam]);

  useEffect(() => {
    if (subjectOptions.length > 0 && !subjectOptions.includes(subject)) {
      setSubject(subjectOptions[0]);
    }
  }, [subjectOptions, subject]);

  useEffect(() => {
    if (activeTab !== "final-stretch" || showFinalStretchTab) return;
    // 担当外で学年未解決のあいだは program へ落とさず、grade 確定を待つ
    if (studentId && studentId !== NEW_STUDENT_ID && !selectedStudentGrade) {
      return;
    }
    setActiveTab("program");
  }, [activeTab, showFinalStretchTab, selectedStudentGrade, studentId]);

  const flushActiveTab = useCallback(async (): Promise<boolean> => {
    if (activeTab === "program") return flushSave();
    if (activeTab === "final-stretch") return flushFinalStretchAll();
    if (activeTab === "course-proposal") return flushCourseProposalSave();
    if (activeTab === "basic") {
      return (await basicSaveFlushRef.current?.()) ?? true;
    }
    return true;
  }, [activeTab, flushSave, flushFinalStretchAll, flushCourseProposalSave]);

  const switchWithSave = async (action: () => void) => {
    const saved = await flushActiveTab();
    if (!saved) {
      setSwitchError("保存に失敗したため切り替えできませんでした");
      return;
    }
    setSwitchError("");
    action();
  };

  const goToAdjacentStudent = (delta: number) => {
    const ids = studentNavIds;
    if (ids.length === 0) return;

    const idx = ids.indexOf(studentId);
    if (idx === -1) {
      const next = delta > 0 ? ids[0] : ids[ids.length - 1];
      void switchWithSave(() => setStudentId(next));
      return;
    }

    const nextIdx = (idx + delta + ids.length) % ids.length;
    void switchWithSave(() => setStudentId(ids[nextIdx]));
  };

  const switchTab = async (nextTab: MakerTab) => {
    if (nextTab === activeTab) return;
    const saved = await flushActiveTab();
    if (!saved) {
      setSwitchError("保存に失敗したためタブを切り替えられません");
      return;
    }
    setSwitchError("");
    setActiveTab(nextTab);
  };

  const handleListSelect = (
    student: MakerStudentListItem,
    options: { tab: "basic" | "program"; subject?: string },
  ) => {
    registerStudentOption({
      id: student.id,
      name: student.name,
      grade: student.grade,
    });
    void switchWithSave(() => {
      setStudentId(student.id);
      if (options.subject) setSubject(options.subject);
      setActiveTab(options.tab);
    });
  };

  const handleListCreateNew = (initialName?: string) => {
    void switchWithSave(() => {
      setNewStudentInitialName(initialName?.trim() ?? "");
      if (studentId === NEW_STUDENT_ID) {
        setBasicInfoKey(`new-${Date.now()}`);
      }
      setStudentId(NEW_STUDENT_ID);
      setActiveTab("basic");
    });
  };

  const applyBasicInfoToSheet = useCallback((info: StudentBasicInfo) => {
    const assignedSubjects = info.assignments
      .filter((row) => row.teacherId)
      .map((row) => row.subject);
    if (assignedSubjects.length > 0) {
      setSubject((prev) =>
        assignedSubjects.includes(prev) ? prev : assignedSubjects[0],
      );
    }

    setSheet((prev) => {
      if (!prev || prev.studentId !== info.id) return prev;
      const subjectTeacher = info.assignments.find(
        (row) => row.subject === prev.subject,
      );
      return {
        ...prev,
        teacher: subjectTeacher?.teacherName
          ? { name: subjectTeacher.teacherName }
          : prev.teacher,
        student: {
          ...prev.student,
          name: info.name,
          gender: info.gender,
          grade: info.grade,
          cramSchool: info.cramSchool,
          campus: info.campus,
          className: info.className,
          targetSchool: info.targetSchool,
        },
      };
    });
    setCourseProposalSheet((prev) => {
      if (!prev || prev.studentId !== info.id) return prev;
      return {
        ...prev,
        student: {
          name: info.name,
          gender: info.gender,
          grade: info.grade,
        },
      };
    });
    if (courseProposalSheetRef.current?.studentId === info.id) {
      void loadCourseProposal();
    }
  }, [loadCourseProposal]);

  const handleCampusChange = (value: string) => {
    bumpSave();
    const trimmedDefault = defaultCampus.trim();
    const usesDefault =
      !value.trim() || value.trim() === trimmedDefault;
    setSheet((prev) =>
      prev ? { ...prev, campus: value, usesDefaultCampus: usesDefault } : prev,
    );
  };

  const handleGoalChange = (value: string) => {
    bumpSave();
    setSheet((prev) => (prev ? { ...prev, goal: value } : prev));
  };

  const handleInitialMockExamsChange = (value: string) => {
    bumpSave();
    setSheet((prev) => (prev ? { ...prev, initialMockExams: value } : prev));
  };

  const handleInitialChallengesChange = (value: string) => {
    bumpSave();
    setSheet((prev) => (prev ? { ...prev, initialChallenges: value } : prev));
  };

  const handleMonthChange = (
    monthId: string,
    field: "monthTitle" | "content",
    value: string,
  ) => {
    bumpSave();
    setSheet((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        months: prev.months.map((m) =>
          m.id === monthId ? { ...m, [field]: value } : m,
        ),
      };
    });
  };

  const handleTestsChange = (monthId: string, testIds: string[]) => {
    bumpSave();
    setSheet((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        months: prev.months.map((m) => {
          if (m.id !== monthId) return m;
          const pool = allTestsForMonth[m.yearMonth] ?? [];
          return {
            ...m,
            tests: testIds
              .map((id) => {
                const fromPool = pool.find((t) => t.id === id);
                const fromMonth = m.tests.find((t) => t.id === id);
                if (fromMonth) {
                  return fromMonth;
                }
                if (fromPool) {
                  return {
                    id: fromPool.id,
                    displayText: fromPool.displayText,
                    result: null,
                  };
                }
                return null;
              })
              .filter(Boolean) as ProgramSheetData["months"][number]["tests"],
          };
        }),
      };
    });
  };

  const handleTestCreate = async (
    monthId: string,
    yearMonth: string,
    testName: string,
    testDate: string,
    grade: string,
    cramSchool: string,
  ): Promise<{ id: string; displayText: string } | null> => {
    const current = sheetRef.current;
    if (!current) return null;

    const res = await fetch("/api/programs/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grade,
        yearMonth,
        testName,
        testDate,
        cramSchool,
      }),
    });

    if (!res.ok) {
      if (res.status === 400) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        window.alert(
          data?.error ?? "テストの登録に失敗しました。塾名・日付を確認してください。",
        );
      }
      return null;
    }

    const created = (await res.json()) as {
      id: string;
      displayText: string;
      yearMonth: string;
      cramSchool: string;
    };

    const targetMonth = yearMonth;
    setAllTestsForMonth((prev) => {
      const list = [...(prev[targetMonth] ?? [])];
      if (!list.some((t) => t.id === created.id)) {
        list.push({
          id: created.id,
          displayText: created.displayText,
          cramSchool: created.cramSchool?.trim() ?? cramSchool.trim(),
        });
        list.sort((a, b) => a.displayText.localeCompare(b.displayText, "ja"));
      }
      return { ...prev, [targetMonth]: list };
    });

    bumpSave();
    setSheet((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        months: prev.months.map((m) => {
          if (m.id !== monthId) return m;
          if (m.tests.some((t) => t.id === created.id)) return m;
          return {
            ...m,
            tests: [
              ...m.tests,
              {
                id: created.id,
                displayText: created.displayText,
                result: null,
              },
            ],
          };
        }),
      };
    });

    return { id: created.id, displayText: created.displayText };
  };

  const handleTestResultSave = async (
    testScheduleId: string,
    result: StudentTestResultInput,
  ): Promise<boolean> => {
    const current = sheetRef.current;
    if (!current) return false;

    const res = await fetch("/api/programs/test-results", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: current.studentId,
        testScheduleId,
        sheetId: current.id,
        result,
      }),
    });

    if (!res.ok) return false;

    const data = (await res.json()) as {
      result: StudentTestResultInput;
      recentTestResults?: RecentTestResult[];
    };

    const hasValues =
      hasScoreResult(result) ||
      result.notes.trim() !== "" ||
      result.newClass?.trim() !== "";
    const savedResult = hasValues ? result : null;
    const savedNewClass = result.newClass?.trim() ?? "";

    if (savedNewClass) {
      setBasicInfoRefreshKey((key) => key + 1);
    }

    setSheet((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        recentTestResults: data.recentTestResults ?? prev.recentTestResults,
        student: savedNewClass
          ? { ...prev.student, className: savedNewClass }
          : prev.student,
        months: prev.months.map((m) => ({
          ...m,
          tests: m.tests.map((t) =>
            t.id === testScheduleId ? { ...t, result: savedResult } : t,
          ),
        })),
      };
    });

    return true;
  };

  const handleScoreHistoryDelete = async (
    testScheduleId: string,
    displayText: string,
  ): Promise<boolean> => {
    if (!studentId || studentId === NEW_STUDENT_ID) return false;
    if (
      !window.confirm(`「${displayText}」の成績を削除します。よろしいですか？`)
    ) {
      return false;
    }

    const res = await fetch("/api/programs/test-results", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        testScheduleId,
        sheetId: sheetRef.current?.id,
        result: EMPTY_TEST_RESULT,
      }),
    });

    if (!res.ok) return false;

    const data = (await res.json()) as {
      recentTestResults?: RecentTestResult[];
    };

    setScoreHistoryItems((prev) =>
      prev.filter((item) => item.testScheduleId !== testScheduleId),
    );

    setSheet((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        recentTestResults: data.recentTestResults ?? prev.recentTestResults,
        months: prev.months.map((m) => ({
          ...m,
          tests: m.tests.map((t) =>
            t.id === testScheduleId ? { ...t, result: null } : t,
          ),
        })),
      };
    });

    return true;
  };

  const handlePrint = async () => {
    if (!sheet) return;
    const saved = await flushSave();
    if (!saved) return;
    document.title = pdfFilename;
    window.print();
  };

  const handleFinalStretchPrint = async () => {
    if (!finalStretchSheet) return;
    const saved = await flushFinalStretchAll();
    if (!saved) return;
    document.title = finalStretchPdfFilename;
    window.print();
  };

  const handleSavePdf = async () => {
    if (!sheet) return;
    setExportingPdf(true);
    setPdfError("");
    setPdfMessage("");

    try {
      const saved = await flushSave();
      if (!saved) return;

      const res = await fetch(`/api/programs/${sheet.id}/pdf`, {
        method: "POST",
      });
      const result = await savePdfFromResponse(res, `${pdfFilename}.pdf`);

      if (!result.ok) {
        setPdfError(result.error);
        return;
      }

      setPdfMessage("PDFを保存しました");
    } catch {
      setPdfError("PDFの作成に失敗しました");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleFinalStretchSavePdf = async () => {
    if (!finalStretchSheet) return;
    setExportingPdf(true);
    setPdfError("");
    setPdfMessage("");

    try {
      const saved = await flushFinalStretchAll();
      if (!saved) return;

      const res = await fetch(
        `/api/programs/final-stretch/${finalStretchSheet.id}/pdf`,
        { method: "POST" },
      );
      const result = await savePdfFromResponse(
        res,
        `${finalStretchPdfFilename}.pdf`,
      );

      if (!result.ok) {
        setPdfError(result.error);
        return;
      }

      setPdfMessage("PDFを保存しました");
    } catch {
      setPdfError("PDFの作成に失敗しました");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleCourseProposalPrint = async () => {
    if (!courseProposalSheet) return;
    const saved = await flushCourseProposalSave();
    if (!saved) return;

    const url = `/programs/course-proposal/${courseProposalSheet.id}/print`;
    const printWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (!printWindow) {
      setPdfError("印刷ウィンドウを開けませんでした");
      return;
    }

    printWindow.addEventListener(
      "load",
      () => {
        printWindow.document.title = courseProposalPdfFilename;
        printWindow.focus();
        printWindow.print();
      },
      { once: true },
    );
  };

  const handleCourseProposalSavePdf = async () => {
    if (!courseProposalSheet) return;
    setExportingPdf(true);
    setPdfError("");
    setPdfMessage("");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 130_000);

    try {
      const saved = await flushCourseProposalSave();
      if (!saved) {
        setPdfError("保存に失敗したためPDFを作成できませんでした");
        return;
      }

      const res = await fetch(
        `/api/programs/course-proposal/${courseProposalSheet.id}/pdf`,
        { method: "POST", signal: controller.signal },
      );
      const result = await savePdfFromResponse(
        res,
        `${courseProposalPdfFilename}.pdf`,
      );

      if (!result.ok) {
        setPdfError(result.error);
        return;
      }

      setPdfMessage("PDFを保存しました");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setPdfError("PDFの作成がタイムアウトしました。しばらく待ってから再度お試しください");
        return;
      }
      setPdfError("PDFの作成に失敗しました");
    } finally {
      window.clearTimeout(timeoutId);
      setExportingPdf(false);
    }
  };

  const pdfFilename = sheet
    ? buildPdfFilename({
        studentName: sheet.student.name,
        gender: sheet.student.gender,
        subject: sheet.subject,
        grade: sheet.student.grade,
        startYearMonth: sheet.startYearMonth,
        teacherName,
      })
    : "";

  const finalStretchPdfFilename = finalStretchSheet
    ? buildFinalStretchPdfFilename({
        studentName: finalStretchSheet.student.name,
        gender: finalStretchSheet.student.gender,
        subject: finalStretchSheet.subject,
        grade: finalStretchSheet.student.grade,
        teacherName,
      })
    : "";

  const courseProposalPdfFilename = courseProposalSheet
    ? buildCourseProposalPdfFilename({
        year: courseProposalSheet.year,
        season: courseProposalSheet.season,
        studentName: courseProposalSheet.student.name,
        gender: courseProposalSheet.student.gender,
      })
    : "";

  const showProgramLoading =
    initialLoading && !sheet && activeTab === "program" && !isNewStudent;

  const programBlocked =
    activeTab === "program" && !isNewStudent && ((loadError && !sheet) || !sheet);

  const makerHeaderProps = {
    title: "プログラムメーカー",
    userLine: teacherName,
    meta: showMakerCampusField ? <TeacherDefaultCampusField /> : undefined,
    showAdminLinks: isAdmin,
    showMemberAdminLink: isAdmin,
    showTestScheduleLink,
    testScheduleReadOnly,
    navBeforeLogout: (
      <span className="relative inline-block">
        <button
          type="button"
          className={
            activeTab === "list"
              ? "rounded bg-white/20 px-2 py-0.5 font-medium"
              : "hover:underline"
          }
          onClick={() => {
            dismissFirstLoginHint();
            void switchTab("list");
          }}
        >
          生徒一覧
        </button>
        {showFirstLoginHint && (
          <div className="absolute right-0 top-full z-[200] mt-2 w-64 rounded-lg border border-amber-300 bg-white p-3 text-left text-gray-800 shadow-xl">
            <div className="absolute -top-1.5 right-6 h-3 w-3 rotate-45 border-l border-t border-amber-300 bg-white" />
            <p className="text-xs font-semibold text-gray-900">はじめに</p>
            <p className="mt-1 text-xs leading-relaxed">
              ここを押して担当生徒を検索してください。リストになければ「＋
              新規登録」から追加できます。
            </p>
            <div className="mt-2 text-right">
              <button
                type="button"
                className="rounded bg-[#1e3a5f] px-3 py-1 text-xs font-medium text-white hover:bg-[#2a4f7a]"
                onClick={dismissFirstLoginHint}
              >
                OK
              </button>
            </div>
          </div>
        )}
      </span>
    ),
    navAfterAdmin: canViewTeacherOverview ? (
      <button
        type="button"
        className={
          activeTab === "by-teacher"
            ? "rounded bg-white/20 px-2 py-0.5 font-medium"
            : "hover:underline"
        }
        onClick={() => void switchTab("by-teacher")}
      >
        講師別
      </button>
    ) : undefined,
  };

  if (showProgramLoading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <AppHeaderShell
          {...makerHeaderProps}
          navBeforeLogout={
            <button
              type="button"
              className="hover:underline"
              onClick={() => void switchTab("list")}
            >
              生徒一覧
            </button>
          }
          navAfterAdmin={
            canViewTeacherOverview ? (
              <button
                type="button"
                className="hover:underline"
                onClick={() => void switchTab("by-teacher")}
              >
                講師別
              </button>
            ) : undefined
          }
        />
        <div className="p-8 text-center text-gray-500">読み込み中…</div>
      </div>
    );
  }

  return (
    <div className="program-maker-page min-h-screen bg-gray-100">
      <div className="screen-only">
        <AppHeaderShell {...makerHeaderProps} />
      </div>
      <main className="program-maker-main relative px-1 py-2">
        {refreshing && activeTab === "program" && (
          <div className="absolute inset-0 z-20 flex items-start justify-center bg-white/60 pt-24 text-sm text-gray-600">
            読み込み中…
          </div>
        )}
        {activeTab === "list" ? (
          <TeacherStudentList
            selectedStudentId={studentId}
            extraStudents={extraStudents}
            onSelectStudent={handleListSelect}
            onCreateNew={handleListCreateNew}
          />
        ) : activeTab === "bulk-pdf" ? (
          <BulkPdfExport assignments={assignments} />
        ) : activeTab === "bulk-final-stretch-pdf" ? (
          <BulkFinalStretchPdfExport assignments={assignments} />
        ) : activeTab === "bulk-course-proposal-pdf" ? (
          <BulkCourseProposalPdfExport assignments={assignments} />
        ) : activeTab === "by-teacher" && canViewTeacherOverview ? (
          <TeacherOverviewTab showAdminSearch={showAdminTeacherSearch} />
        ) : activeTab === "program" && programBlocked ? (
          <div className="p-8 text-center text-gray-500">
            {loadError ||
              (selectedAssignment
                ? "プログラムを表示できませんでした"
                : "担当が未割当です。生徒一覧または生徒基本情報で担当講師を設定してください。")}
          </div>
        ) : activeTab === "program" && sheet ? (
          <ProgramSheet
            studentName={sheet.student.name}
            gender={sheet.student.gender}
            grade={sheet.student.grade}
            subject={subject}
            goal={sheet.goal}
            campus={sheet.campus}
            attendanceCampus={sheet.student.campus}
            cramSchool={sheet.student.cramSchool}
            studentClass={sheet.student.className}
            targetSchool={sheet.student.targetSchool}
            initialMockExams={sheet.initialMockExams}
            teacherName={sheet.teacher.name}
            initialChallenges={sheet.initialChallenges}
            recentTestResults={sheet.recentTestResults ?? []}
            months={sheet.months}
            editable
            subjectOptions={subjectOptions}
            onSubjectChange={(next) => {
              if (next === subject) return;
              void switchWithSave(() => setSubject(next));
            }}
            onCampusChange={handleCampusChange}
            onGoalChange={handleGoalChange}
            onInitialMockExamsChange={handleInitialMockExamsChange}
            onInitialChallengesChange={handleInitialChallengesChange}
            onMonthChange={handleMonthChange}
            onTestsChange={handleTestsChange}
            onTestCreate={handleTestCreate}
            onTestResultSave={handleTestResultSave}
            allTestsForMonth={allTestsForMonth}
          />
        ) : activeTab === "final-stretch" ? (
          finalStretchLoadError ? (
            <div className="p-8 text-center text-sm text-red-600">
              {finalStretchLoadError}
            </div>
          ) : finalStretchSheet ? (
            <FinalStretchSheet
              sheet={finalStretchSheet}
              onTargetSchoolChange={(targetSchool) => {
                setFinalStretchSheet((prev) =>
                  prev
                    ? {
                        ...prev,
                        student: { ...prev.student, targetSchool },
                      }
                    : prev,
                );
                setSheet((prev) =>
                  prev && prev.studentId === finalStretchSheet?.studentId
                    ? {
                        ...prev,
                        student: { ...prev.student, targetSchool },
                      }
                    : prev,
                );
                bumpFinalStretchTargetSchoolSave();
              }}
              onPolicyChange={(policy) => {
                setFinalStretchSheet((prev) =>
                  prev ? { ...prev, policy } : prev,
                );
                bumpFinalStretchSave();
              }}
              onRowsChange={(rows: FinalStretchRowData[]) => {
                setFinalStretchSheet((prev) =>
                  prev ? { ...prev, rows } : prev,
                );
                bumpFinalStretchSave();
              }}
              onColumnWidthsChange={(columnWidths) => {
                setFinalStretchSheet((prev) =>
                  prev ? { ...prev, columnWidths } : prev,
                );
                bumpFinalStretchSave();
              }}
            />
          ) : (
            <div className="p-8 text-center text-gray-500">読み込み中…</div>
          )
        ) : studentId && activeTab === "basic" ? (
          <TeacherStudentBasicInfo
            key={basicInfoKey}
            studentId={studentId}
            teacherId={teacherId}
            isAdmin={isAdmin}
            isNew={isNewStudent}
            initialName={newStudentInitialName}
            refreshKey={basicInfoRefreshKey}
            saveFlushRef={basicSaveFlushRef}
            onSaved={applyBasicInfoToSheet}
            onExistingStudentFound={handleExistingStudentFound}
            onStudentCreated={handleStudentCreated}
            onUnassigned={handleUnassigned}
            onGraduated={handleGraduated}
          />
        ) : studentId && activeTab === "score-history" ? (
          <ScoreHistoryPanel
            items={scoreHistoryItems}
            loading={scoreHistoryLoading}
            error={scoreHistoryError}
            onDelete={handleScoreHistoryDelete}
          />
        ) : activeTab === "course-proposal" ? (
          isNewStudent ? (
            <div className="p-8 text-center text-sm text-gray-500">
              生徒を登録してから講習提案書を作成できます
            </div>
          ) : courseProposalLoadError ? (
            <div className="p-8 text-center text-sm text-red-600">
              {courseProposalLoadError}
            </div>
          ) : courseProposalSheet ? (
            <CourseProposalSheet
              sheet={courseProposalSheet}
              onSubjectChange={(
                subject: CourseProposalSubject,
                data: CourseProposalSubjectData,
              ) => {
                if (!courseProposalSheet.editableSubjects[subject]) return;
                setCourseProposalSheet((prev) =>
                  prev
                    ? {
                        ...prev,
                        subjects: {
                          ...prev.subjects,
                          [subject]: data,
                        },
                      }
                    : prev,
                );
                bumpCourseProposalSave();
              }}
              onSlotSubjectChange={(slotIndex, nextSubject) => {
                setCourseProposalSheet((prev) => {
                  if (!prev || !prev.availableSubjects.includes(nextSubject)) {
                    return prev;
                  }
                  const currentSubject = prev.subjectSlots[slotIndex];
                  if (!currentSubject || currentSubject === nextSubject) {
                    return prev;
                  }
                  const subjectSlots = [...prev.subjectSlots];
                  const duplicateIndex = subjectSlots.indexOf(nextSubject);
                  subjectSlots[slotIndex] = nextSubject;
                  if (duplicateIndex >= 0) {
                    subjectSlots[duplicateIndex] = currentSubject;
                  }
                  return { ...prev, subjectSlots };
                });
                bumpCourseProposalSave();
              }}
            />
          ) : (
            <div className="p-8 text-center text-gray-500">読み込み中…</div>
          )
        ) : null}
      </main>

      <footer className="screen-only sticky bottom-0 z-[100] border-t bg-white px-4 py-4 shadow-lg">
        <div className="mb-3 flex gap-2 border-b pb-3">
          <span className="relative inline-block">
            <button
              type="button"
              className={`rounded px-4 py-2 text-sm ${
                activeTab === "basic"
                  ? "bg-[#1e3a5f] text-white"
                  : "border bg-white text-gray-700 hover:bg-gray-50"
              }`}
              onClick={() => {
                dismissBasicInfoHint();
                void switchTab("basic");
              }}
            >
              生徒基本情報
            </button>
            {showBasicInfoHint && (
              <div className="absolute bottom-full left-0 z-[200] mb-2 w-64 rounded-lg border border-amber-300 bg-white p-3 text-left text-gray-800 shadow-xl">
                <div className="absolute -bottom-1.5 left-6 h-3 w-3 rotate-45 border-b border-r border-amber-300 bg-white" />
                <p className="text-xs font-semibold text-gray-900">
                  登録が完了しました
                </p>
                <p className="mt-1 text-xs leading-relaxed">
                  基本情報はこちらでいつでも変更できます。
                </p>
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    className="rounded bg-[#1e3a5f] px-3 py-1 text-xs font-medium text-white hover:bg-[#2a4f7a]"
                    onClick={dismissBasicInfoHint}
                  >
                    OK
                  </button>
                </div>
              </div>
            )}
          </span>
          <button
            type="button"
            className={`rounded px-4 py-2 text-sm ${
              activeTab === "program"
                ? "bg-[#1e3a5f] text-white"
                : "border bg-white text-gray-700 hover:bg-gray-50"
            }`}
            onClick={() => void switchTab("program")}
          >
            合格プログラム
          </button>
          {showFinalStretchTab ? (
            <button
              type="button"
              className={`rounded px-4 py-2 text-sm ${
                activeTab === "final-stretch"
                  ? "bg-[#1e3a5f] text-white"
                  : "border bg-white text-gray-700 hover:bg-gray-50"
              }`}
              onClick={() => void switchTab("final-stretch")}
            >
              直前期シート
            </button>
          ) : null}
          <button
            type="button"
            className={`rounded px-4 py-2 text-sm ${
              activeTab === "course-proposal"
                ? "bg-[#1e3a5f] text-white"
                : "border bg-white text-gray-700 hover:bg-gray-50"
            }`}
            onClick={() => void switchTab("course-proposal")}
          >
            講習提案書
          </button>
          <button
            type="button"
            className={`rounded px-4 py-2 text-sm ${
              activeTab === "score-history"
                ? "bg-[#1e3a5f] text-white"
                : "border bg-white text-gray-700 hover:bg-gray-50"
            }`}
            onClick={() => void switchTab("score-history")}
          >
            成績推移
          </button>
        </div>
        {activeTab !== "bulk-pdf" &&
        activeTab !== "bulk-final-stretch-pdf" &&
        activeTab !== "bulk-course-proposal-pdf" &&
        activeTab !== "by-teacher" ? (
        <div className="flex w-full flex-wrap items-end gap-4">
          <label className="text-sm">
            生徒
            <span className="ml-2 inline-flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-gray-700">
                <input
                  type="checkbox"
                  aria-label="卒塾生含む"
                  checked={includeGraduated}
                  onChange={(e) => setIncludeGraduated(e.target.checked)}
                />
                <span className="select-none">卒塾生含む</span>
              </span>
              <button
                type="button"
                aria-label="前の生徒"
                className={navArrowBtnClass}
                onClick={() => goToAdjacentStudent(-1)}
                disabled={isNewStudent || studentNavIds.length === 0}
              >
                ◀
              </button>
              {isNewStudent ? (
                <span className="min-w-[180px] rounded border border-dashed border-gray-300 px-2 py-1 text-sm text-gray-500">
                  （新規登録中）
                </span>
              ) : (
                <select
                  className="min-w-[180px] max-w-[280px] rounded border px-2 py-1"
                  value={studentId}
                  onChange={(e) => {
                    const next = e.target.value;
                    void switchWithSave(() => setStudentId(next));
                  }}
                >
                  {studentOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                aria-label="次の生徒"
                className={navArrowBtnClass}
                onClick={() => goToAdjacentStudent(1)}
                disabled={isNewStudent || studentNavIds.length === 0}
              >
                ▶
              </button>
            </span>
          </label>

          <label className="text-sm">
            科目
            {activeTab === "program" || activeTab === "final-stretch" ? (
              <select
                className="ml-2 rounded border px-2 py-1"
                value={subject}
                onChange={(e) => {
                  const next = e.target.value;
                  void switchWithSave(() => setSubject(next));
                }}
              >
                {subjectOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : activeTab === "list" ? (
              <span className="ml-2 text-xs text-gray-500">
                一覧から選択
              </span>
            ) : (
              <span className="ml-2 text-xs text-gray-500">
                氏名・学年などは共通
              </span>
            )}
          </label>

          {activeTab === "program" && (
          <label className="text-sm">
            開始月
            <span className="ml-2 inline-flex items-center gap-1">
              <button
                type="button"
                aria-label="前月"
                className={navArrowBtnClass}
                onClick={() => {
                  const next = shiftYearMonth(startYearMonth, -1);
                  if (next === startYearMonth) return;
                  void switchWithSave(() => setStartYearMonth(next));
                }}
              >
                ◀
              </button>
              <label className="relative inline-flex min-w-[7.5rem] cursor-pointer items-center justify-center rounded border border-gray-300 bg-white px-2 py-1">
                <input
                  type="month"
                  lang="ja"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={startYearMonth}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!next || next === startYearMonth) return;
                    void switchWithSave(() => setStartYearMonth(next));
                  }}
                  aria-label="開始月"
                />
                <span className="pointer-events-none text-sm tabular-nums text-gray-900">
                  {formatYearMonthJapanese(startYearMonth)}
                </span>
              </label>
              <button
                type="button"
                aria-label="翌月"
                className={navArrowBtnClass}
                onClick={() => {
                  const next = shiftYearMonth(startYearMonth, 1);
                  if (next === startYearMonth) return;
                  void switchWithSave(() => setStartYearMonth(next));
                }}
              >
                ▶
              </button>
            </span>
          </label>
          )}

          {activeTab === "course-proposal" && !isNewStudent && (
            <>
              <label className="text-sm">
                年度
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  className="ml-2 w-24 rounded border px-2 py-1"
                  value={courseProposalYear}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (!Number.isFinite(next)) return;
                    void switchWithSave(() => setCourseProposalYear(next));
                  }}
                />
              </label>
              <label className="text-sm">
                講習期
                <select
                  className="ml-2 rounded border px-2 py-1"
                  value={courseProposalSeason}
                  onChange={(e) => {
                    const next = e.target.value as CourseProposalSeason;
                    if (!COURSE_PROPOSAL_SEASONS.includes(next)) return;
                    void switchWithSave(() => setCourseProposalSeason(next));
                  }}
                >
                  {COURSE_PROPOSAL_SEASONS.map((season) => (
                    <option key={season} value={season}>
                      {COURSE_PROPOSAL_SEASON_LABELS[season]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <div className="flex-1 text-xs text-gray-500">
            {activeTab === "list" ? (
              <div>担当生徒の一覧です。氏名・担当科目をクリックして開けます。</div>
            ) : activeTab === "basic" ? (
              <div>通塾・志望校・開始時成績・目標は全科目で共有されます</div>
            ) : activeTab === "score-history" ? (
              <div>チェックした模試の偏差値を左のグラフに表示します（古い順→新しい順）</div>
            ) : null}
          </div>

          <div className="ml-auto flex flex-shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
            {(activeTab === "program"
              ? autoSaveLabel
              : activeTab === "final-stretch"
                ? finalStretchAutoSaveLabel
                : activeTab === "course-proposal"
                  ? courseProposalAutoSaveLabel
                  : null) ||
            switchError ||
            exportingPdf ||
            pdfMessage ||
            pdfError ? (
              <span
                className={`max-w-[10rem] truncate text-sm sm:max-w-[14rem] ${
                  switchError || pdfError
                    ? "text-red-600"
                    : exportingPdf
                      ? "text-gray-500"
                      : pdfMessage
                        ? "text-green-600"
                        : saving
                          ? "text-gray-500"
                          : "text-green-600"
                }`}
                title={
                  pdfMessage || pdfError || switchError || undefined
                }
              >
                {switchError ||
                  pdfError ||
                  (exportingPdf ? "保存中…" : null) ||
                  pdfMessage ||
                  (activeTab === "program"
                    ? autoSaveLabel
                    : activeTab === "final-stretch"
                      ? finalStretchAutoSaveLabel
                      : activeTab === "course-proposal"
                        ? courseProposalAutoSaveLabel
                        : null)}
              </span>
            ) : null}

          {activeTab === "program" && sheet && (
            <div className="flex flex-shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handlePrint()}
                disabled={exportingPdf}
                className="rounded border border-[#1e3a5f] bg-white px-4 py-2 text-sm text-[#1e3a5f] hover:bg-gray-50 disabled:opacity-50"
              >
                印刷
              </button>
              <button
                type="button"
                onClick={() => void handleSavePdf()}
                disabled={exportingPdf}
                className="rounded bg-[#1e3a5f] px-4 py-2 text-sm text-white hover:bg-[#2a4f7a] disabled:opacity-50"
              >
                {exportingPdf ? "保存中…" : "PDF保存"}
              </button>
              <button
                type="button"
                onClick={() => void switchTab("bulk-pdf")}
                disabled={exportingPdf}
                className="rounded border border-[#1e3a5f] bg-white px-4 py-2 text-sm text-[#1e3a5f] hover:bg-gray-50 disabled:opacity-50"
              >
                PDF一括作成
              </button>
            </div>
          )}
          {activeTab === "final-stretch" && finalStretchSheet && (
            <div className="flex flex-shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleFinalStretchPrint()}
                disabled={exportingPdf}
                className="rounded border border-[#1e3a5f] bg-white px-4 py-2 text-sm text-[#1e3a5f] hover:bg-gray-50 disabled:opacity-50"
              >
                印刷
              </button>
              <button
                type="button"
                onClick={() => void handleFinalStretchSavePdf()}
                disabled={exportingPdf}
                className="rounded bg-[#1e3a5f] px-4 py-2 text-sm text-white hover:bg-[#2a4f7a] disabled:opacity-50"
              >
                {exportingPdf ? "保存中…" : "PDF保存"}
              </button>
              <button
                type="button"
                onClick={() => void switchTab("bulk-final-stretch-pdf")}
                disabled={exportingPdf}
                className="rounded border border-[#1e3a5f] bg-white px-4 py-2 text-sm text-[#1e3a5f] hover:bg-gray-50 disabled:opacity-50"
              >
                PDF一括作成
              </button>
            </div>
          )}
          {activeTab === "course-proposal" && courseProposalSheet && (
            <div className="flex flex-shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleCourseProposalPrint()}
                disabled={exportingPdf}
                className="rounded border border-[#1e3a5f] bg-white px-4 py-2 text-sm text-[#1e3a5f] hover:bg-gray-50 disabled:opacity-50"
              >
                印刷
              </button>
              <button
                type="button"
                onClick={() => void handleCourseProposalSavePdf()}
                disabled={exportingPdf}
                className="rounded bg-[#1e3a5f] px-4 py-2 text-sm text-white hover:bg-[#2a4f7a] disabled:opacity-50"
              >
                {exportingPdf ? "保存中…" : "PDF保存"}
              </button>
              <button
                type="button"
                onClick={() => void switchTab("bulk-course-proposal-pdf")}
                disabled={exportingPdf}
                className="rounded border border-[#1e3a5f] bg-white px-4 py-2 text-sm text-[#1e3a5f] hover:bg-gray-50 disabled:opacity-50"
              >
                PDF一括作成
              </button>
            </div>
          )}
          </div>
        </div>
        ) : (
          <div className="text-xs text-gray-500">
            {activeTab === "by-teacher"
              ? "合格プログラム・直前期シート・講習提案書の講師別記入状況を確認できます。"
              : activeTab === "bulk-final-stretch-pdf" ||
                  activeTab === "bulk-course-proposal-pdf"
                ? "PDFはダウンロードフォルダに保存されます。"
                : "PDFはダウンロードフォルダに保存されます。"}
          </div>
        )}
      </footer>
    </div>
  );
}
