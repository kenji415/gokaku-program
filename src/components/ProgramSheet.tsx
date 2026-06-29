"use client";

import { useEffect, useRef, useState } from "react";
import type { ProgramMonthData, StudentTestResultInput } from "@/lib/programs";
import {
  EMPTY_TEST_RESULT,
  formatTestResultScores,
  hasScoreResult,
} from "@/lib/test-result-types";
import type { RecentTestResult } from "@/lib/test-results";
import { formatStudentDisplayName } from "@/lib/months";
import {
  axisStyleForMonthIndex,
  bottomGapIndexForMonthIndex,
  topBoxSlotStyle,
  topSlotForMonthIndex,
} from "@/lib/program-box-layout";
import { EXAM_DR_CAMPUS_NAMES, GRADES, CRAM_SCHOOL_NAMES } from "@/lib/constants";
import {
  nativeInputToTestDate,
  normalizeDateInput,
  sanitizeTestDateInput,
  testDateInputAllowedForYearMonth,
  testDateToNativeInput,
} from "@/lib/test-schedule-utils";
import jukenDoctorLogo from "../../public/juken-doctor-logo.png";

type ProgramSheetProps = {
  studentName: string;
  gender?: string | null;
  grade: string;
  subject: string;
  goal: string;
  campus: string;
  attendanceCampus: string;
  cramSchool: string;
  studentClass: string;
  targetSchool: string;
  initialMockExams: string;
  teacherName: string;
  initialChallenges: string;
  recentTestResults: RecentTestResult[];
  months: ProgramMonthData[];
  editable?: boolean;
  onCampusChange?: (value: string) => void;
  onGoalChange?: (value: string) => void;
  onInitialMockExamsChange?: (value: string) => void;
  onInitialChallengesChange?: (value: string) => void;
  onMonthChange?: (
    monthId: string,
    field: "monthTitle" | "content",
    value: string,
  ) => void;
  onTestsChange?: (monthId: string, testIds: string[]) => void;
  onTestCreate?: (
    monthId: string,
    yearMonth: string,
    testName: string,
    testDate: string,
    grade: string,
    cramSchool: string,
  ) => Promise<{ id: string; displayText: string } | null>;
  onTestResultSave?: (
    testScheduleId: string,
    result: StudentTestResultInput,
  ) => Promise<boolean>;
  availableTests?: Record<string, { id: string; displayText: string }[]>;
  allTestsForMonth?: Record<string, { id: string; displayText: string }[]>;
};

function monthBoxOnRow(index: number, row: "top" | "bottom"): boolean {
  return row === "top" ? index % 2 === 1 : index % 2 === 0;
}

const MAX_MONTH_TESTS = 4;

function TestResultPanel({
  testLabel,
  editable,
  form,
  saving,
  hasStoredResult,
  onFormChange,
  onSave,
  onDelete,
  onDismiss,
}: {
  testLabel: string;
  editable: boolean;
  form: StudentTestResultInput;
  saving: boolean;
  hasStoredResult: boolean;
  onFormChange: (form: StudentTestResultInput) => void;
  onSave: () => void;
  onDelete: () => void;
  onDismiss: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scoreInputClass = "month-box-result-score";
  const fieldClass = "month-box-result-field w-full min-w-0";

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (panelRef.current?.contains(target)) return;
      if (target.closest(".month-box-test-line")) return;
      onDismiss();
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onDismiss]);

  const updateField = (field: keyof StudentTestResultInput, value: string) => {
    onFormChange({ ...form, [field]: value });
  };

  const updateExtraScore = (
    index: number,
    field: "label" | "value",
    value: string,
  ) => {
    const extraScores = form.extraScores.map((row, i) =>
      i === index ? { ...row, [field]: value } : row,
    );
    onFormChange({ ...form, extraScores });
  };

  const addExtraScore = () => {
    onFormChange({
      ...form,
      extraScores: [...form.extraScores, { label: "", value: "" }],
    });
  };

  const removeExtraScore = (index: number) => {
    onFormChange({
      ...form,
      extraScores: form.extraScores.filter((_, i) => i !== index),
    });
  };

  return (
    <div ref={panelRef} className="month-box-result-panel">
      <div className="month-box-result-title">{testLabel}</div>
      <div className="space-y-1.5">
        <div className="month-box-result-heading">偏差値</div>
        <div className="month-box-result-scores">
          <label className="month-box-result-score-label">
            <span>四科</span>
            <input
              className={scoreInputClass}
              value={form.fourSubjects}
              readOnly={!editable}
              onChange={(e) => updateField("fourSubjects", e.target.value)}
            />
          </label>
          <label className="month-box-result-score-label">
            <span>算数</span>
            <input
              className={scoreInputClass}
              value={form.math}
              readOnly={!editable}
              onChange={(e) => updateField("math", e.target.value)}
            />
          </label>
          <label className="month-box-result-score-label">
            <span>国語</span>
            <input
              className={scoreInputClass}
              value={form.japanese}
              readOnly={!editable}
              onChange={(e) => updateField("japanese", e.target.value)}
            />
          </label>
          <label className="month-box-result-score-label">
            <span>理科</span>
            <input
              className={scoreInputClass}
              value={form.science}
              readOnly={!editable}
              onChange={(e) => updateField("science", e.target.value)}
            />
          </label>
          <label className="month-box-result-score-label">
            <span>社会</span>
            <input
              className={scoreInputClass}
              value={form.social}
              readOnly={!editable}
              onChange={(e) => updateField("social", e.target.value)}
            />
          </label>
        </div>
        {form.extraScores.map((row, index) => (
          <label
            key={`extra-${index}`}
            className="month-box-result-extra-row flex items-center gap-2"
          >
            <input
              className="month-box-result-field w-20 shrink-0"
              value={row.label}
              readOnly={!editable}
              placeholder="科目"
              onChange={(e) => updateExtraScore(index, "label", e.target.value)}
            />
            <input
              className={`${fieldClass} max-w-[6rem]`}
              value={row.value}
              readOnly={!editable}
              placeholder="数値"
              onChange={(e) => updateExtraScore(index, "value", e.target.value)}
            />
            {editable && (
              <button
                type="button"
                className="shrink-0 text-[12px] text-gray-500"
                onClick={() => removeExtraScore(index)}
                aria-label="科目を削除"
              >
                ×
              </button>
            )}
          </label>
        ))}
        {editable && (
          <div>
            <button
              type="button"
              className="text-[12px] text-gray-600 underline"
              onClick={addExtraScore}
            >
              ＋科目を追加
            </button>
          </div>
        )}
        <label className="flex flex-col gap-1">
          <span className="month-box-result-heading">備考</span>
          <textarea
            className={`${fieldClass} month-box-result-notes resize-none`}
            value={form.notes}
            readOnly={!editable}
            onChange={(e) => updateField("notes", e.target.value)}
          />
        </label>
      </div>
      {editable && (
        <div className="mt-2 flex items-center justify-between gap-2">
          {hasStoredResult ? (
            <button
              type="button"
              className="text-[12px] text-red-600 underline disabled:opacity-50"
              disabled={saving}
              onClick={onDelete}
            >
              成績を削除
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="text-[12px] font-medium text-gray-800 underline disabled:opacity-50"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      )}
    </div>
  );
}

function MonthBoxSlot({
  month,
  index,
  row,
  editable,
  onMonthChange,
  onTestsChange,
  onTestCreate,
  onTestResultSave,
  tests,
  defaultGrade,
  defaultCramSchool,
}: {
  month: ProgramMonthData;
  index: number;
  row: "top" | "bottom";
  editable?: boolean;
  onMonthChange?: ProgramSheetProps["onMonthChange"];
  onTestsChange?: ProgramSheetProps["onTestsChange"];
  onTestCreate?: ProgramSheetProps["onTestCreate"];
  onTestResultSave?: ProgramSheetProps["onTestResultSave"];
  tests: { id: string; displayText: string }[];
  defaultGrade: string;
  defaultCramSchool: string;
}) {
  if (!monthBoxOnRow(index, row)) return null;

  const slotStyle =
    row === "top"
      ? { ["--program-box-slot"]: topSlotForMonthIndex(index)! }
      : { ["--program-box-gap-index"]: bottomGapIndexForMonthIndex(index)! };

  return (
    <div
      className={`program-box-slot program-box-slot--${row}`}
      style={{ ...slotStyle, zIndex: 10 + index }}
    >
      {row === "bottom" && (
        <div className="month-box-connector month-box-connector--up" />
      )}
      <MonthBox
        month={month}
        editable={editable}
        onMonthChange={onMonthChange}
        onTestsChange={onTestsChange}
        onTestCreate={onTestCreate}
        onTestResultSave={onTestResultSave}
        tests={tests}
        defaultGrade={defaultGrade}
        defaultCramSchool={defaultCramSchool}
      />
      {row === "top" && (
        <div className="month-box-connector month-box-connector--down" />
      )}
    </div>
  );
}

function StartBox({
  subject,
  cramSchool,
  attendanceCampus,
  studentClass,
  targetSchool,
  initialMockExams,
  initialChallenges,
  editable,
  onInitialMockExamsChange,
  onInitialChallengesChange,
}: {
  subject: string;
  cramSchool: string;
  attendanceCampus: string;
  studentClass: string;
  targetSchool: string;
  initialMockExams: string;
  initialChallenges: string;
  editable?: boolean;
  onInitialMockExamsChange?: (value: string) => void;
  onInitialChallengesChange?: (value: string) => void;
}) {
  const schoolLine = [cramSchool, attendanceCampus, studentClass]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="month-box flex min-w-0 flex-col overflow-hidden border border-neutral-800 bg-white">
      <div className="month-box-header shrink-0 bg-[#f4b4c1] px-1 py-1 text-center text-[10px] leading-snug font-bold text-gray-800">
        指導開始時
      </div>
      <div className="month-box-body flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-1.5 py-1 text-[10px] leading-relaxed">
        <div className="program-sheet-content shrink-0 leading-relaxed">
          通塾：{schoolLine || "\u00a0"}
        </div>
        <div className="program-sheet-content shrink-0 leading-relaxed">
          志望校：{targetSchool || "\u00a0"}
        </div>
        {editable ? (
          <label className="program-sheet-content flex min-h-0 min-w-0 shrink-0 flex-col gap-0.5 leading-relaxed">
            <span className="shrink-0">開始時成績：</span>
            <textarea
              className="program-sheet-content box-border min-h-0 min-w-0 w-full max-w-full resize-none border-0 bg-transparent text-[10px] leading-relaxed outline-none"
              rows={2}
              value={initialMockExams}
              placeholder="模試名・成績など"
              aria-label="開始時成績"
              onChange={(e) => onInitialMockExamsChange?.(e.target.value)}
            />
          </label>
        ) : (
          <div className="program-sheet-content min-h-0 shrink-0 whitespace-pre-wrap break-words leading-relaxed">
            開始時成績：
            {initialMockExams ? `\n${initialMockExams}` : ""}
          </div>
        )}
        {editable ? (
          <label className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5">
            <span className="program-sheet-content shrink-0 leading-relaxed">
              課題：
            </span>
            <textarea
              className="program-sheet-content box-border min-h-0 min-w-0 w-full max-w-full flex-1 resize-none border-0 bg-transparent text-[10px] leading-relaxed outline-none"
              value={initialChallenges}
              placeholder={`${subject}の課題を入力`}
              aria-label="指導開始時の課題"
              onChange={(e) => onInitialChallengesChange?.(e.target.value)}
            />
          </label>
        ) : (
          <div className="program-sheet-content min-h-0 min-w-0 flex-1 overflow-hidden whitespace-pre-wrap break-words leading-relaxed">
            課題：
            {initialChallenges ? `\n${initialChallenges}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function MonthBox({
  month,
  editable,
  onMonthChange,
  onTestsChange,
  onTestCreate,
  onTestResultSave,
  tests,
  defaultGrade,
  defaultCramSchool,
}: {
  month: ProgramMonthData;
  editable?: boolean;
  onMonthChange?: ProgramSheetProps["onMonthChange"];
  onTestsChange?: ProgramSheetProps["onTestsChange"];
  onTestCreate?: ProgramSheetProps["onTestCreate"];
  onTestResultSave?: ProgramSheetProps["onTestResultSave"];
  tests: { id: string; displayText: string }[];
  defaultGrade: string;
  defaultCramSchool: string;
}) {
  const [testsEditOpen, setTestsEditOpen] = useState(false);
  const [resultTestId, setResultTestId] = useState<string | null>(null);
  const [resultForm, setResultForm] = useState<StudentTestResultInput>(
    EMPTY_TEST_RESULT,
  );
  const [savingResult, setSavingResult] = useState(false);
  const [addingTest, setAddingTest] = useState(false);
  const [newTestName, setNewTestName] = useState("");
  const [newTestDate, setNewTestDate] = useState("");
  const [newTestGrade, setNewTestGrade] = useState(defaultGrade);
  const [newTestCramSchool, setNewTestCramSchool] = useState(defaultCramSchool);
  const [savingTest, setSavingTest] = useState(false);
  const testEditRef = useRef<HTMLDivElement>(null);
  const selectedIds = month.tests.map((t) => t.id);
  const otherTests = tests.filter((t) => !selectedIds.includes(t.id));
  const displayTests =
    month.tests.length > 0
      ? month.tests
      : tests
          .filter((t) => selectedIds.includes(t.id))
          .map((t) => ({ ...t, result: null }));
  const visibleTests = displayTests.slice(0, MAX_MONTH_TESTS);
  const activeResultTest = displayTests.find((t) => t.id === resultTestId);

  useEffect(() => {
    setNewTestGrade(defaultGrade);
  }, [defaultGrade]);

  useEffect(() => {
    setNewTestCramSchool(defaultCramSchool);
  }, [defaultCramSchool]);

  useEffect(() => {
    if (!resultTestId) {
      setResultForm(EMPTY_TEST_RESULT);
      return;
    }
    const test = month.tests.find((t) => t.id === resultTestId);
    setResultForm(
      test?.result
        ? {
            ...test.result,
            extraScores: test.result.extraScores ?? [],
          }
        : { ...EMPTY_TEST_RESULT },
    );
  }, [resultTestId, month.tests]);

  const closeTestsEdit = () => {
    setTestsEditOpen(false);
    setAddingTest(false);
    setNewTestName("");
    setNewTestDate("");
    setNewTestGrade(defaultGrade);
    setNewTestCramSchool(defaultCramSchool);
  };

  useEffect(() => {
    if (!testsEditOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (testEditRef.current?.contains(event.target as Node)) return;
      closeTestsEdit();
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [testsEditOpen, defaultGrade, defaultCramSchool]);

  const closeResultPanel = () => {
    setResultTestId(null);
    setResultForm(EMPTY_TEST_RESULT);
  };

  const openResultPanel = (testId: string) => {
    setTestsEditOpen(false);
    setResultTestId(testId);
  };

  const saveResult = async () => {
    if (!resultTestId || !onTestResultSave) return;
    setSavingResult(true);
    try {
      const ok = await onTestResultSave(resultTestId, resultForm);
      if (ok) closeResultPanel();
    } finally {
      setSavingResult(false);
    }
  };

  const deleteResult = async () => {
    if (!resultTestId || !onTestResultSave || !activeResultTest) return;
    if (
      !window.confirm(
        `「${activeResultTest.displayText}」の成績を削除します。よろしいですか？`,
      )
    ) {
      return;
    }
    setSavingResult(true);
    try {
      const ok = await onTestResultSave(resultTestId, EMPTY_TEST_RESULT);
      if (ok) closeResultPanel();
    } finally {
      setSavingResult(false);
    }
  };

  const storedResult = activeResultTest?.result;
  const hasStoredResult = Boolean(
    storedResult &&
      (hasScoreResult(storedResult) || storedResult.notes.trim() !== ""),
  );

  const toggleTest = (testId: string, checked: boolean) => {
    if (
      checked &&
      !selectedIds.includes(testId) &&
      selectedIds.length >= MAX_MONTH_TESTS
    ) {
      window.alert(`1ヶ月に登録できるテストは${MAX_MONTH_TESTS}つまでです。`);
      return;
    }
    if (checked && !tests.some((t) => t.id === testId)) return;
    const ids = checked
      ? [...selectedIds, testId]
      : selectedIds.filter((id) => id !== testId);
    onTestsChange?.(month.id, ids);
  };

  const submitNewTest = async () => {
    if (!newTestName.trim() || !newTestCramSchool.trim() || !onTestCreate) return;
    if (selectedIds.length >= MAX_MONTH_TESTS) {
      window.alert(`1ヶ月に登録できるテストは${MAX_MONTH_TESTS}つまでです。`);
      return;
    }
    const normalizedDate = normalizeDateInput(newTestDate.trim());
    if (!testDateInputAllowedForYearMonth(normalizedDate, month.yearMonth)) {
      window.alert(
        "日付の月がこの月ボックスと一致しません。8月のボックスには8月のテストのみ登録できます。",
      );
      return;
    }
    setSavingTest(true);
    try {
      const created = await onTestCreate(
        month.id,
        month.yearMonth,
        newTestName.trim(),
        normalizedDate,
        newTestGrade,
        newTestCramSchool.trim(),
      );
      if (created) {
        setNewTestName("");
        setNewTestDate("");
        setNewTestGrade(defaultGrade);
        setNewTestCramSchool(defaultCramSchool);
        setAddingTest(false);
      }
    } finally {
      setSavingTest(false);
    }
  };

  return (
    <div
      className={`month-box flex min-w-0 flex-col overflow-hidden border border-neutral-800 bg-white${testsEditOpen ? " month-box--tests-open" : ""}${resultTestId ? " month-box--result-open" : ""}`}
    >
      <div className="month-box-header shrink-0 bg-[#1e3a5f] px-1 py-1 text-center text-[10px] leading-snug font-bold text-white">
        {editable ? (
          <div className="flex flex-col gap-0.5">
            <span>{month.monthLabel}</span>
            <input
              className="w-full bg-transparent text-center text-[10px] font-bold text-white outline-none placeholder:text-white/50"
              value={month.monthTitle}
              placeholder="月のタイトル"
              onChange={(e) =>
                onMonthChange?.(month.id, "monthTitle", e.target.value)
              }
            />
          </div>
        ) : (
          <span>
            {month.monthLabel}
            {month.monthTitle ? `　${month.monthTitle}` : ""}
          </span>
        )}
      </div>

      <div
      className={`month-box-body flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-1.5 py-1 text-[10px] leading-relaxed${testsEditOpen ? " month-box-body--tests-open" : ""}${resultTestId ? " month-box-body--result-open" : ""}`}
      >
        <div
          className={`month-box-tests-wrap shrink-0${editable ? " month-box-tests-wrap--editable" : ""}`}
        >
          <div className="month-box-tests text-center text-[9px] font-medium text-red-600">
            {visibleTests.length > 0
              ? visibleTests.map((t) => {
                  const scores = t.result ? formatTestResultScores(t.result) : "";
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className="month-box-test-line block w-full text-left text-[9px] leading-tight text-red-600 underline decoration-dotted underline-offset-2"
                      onClick={() => openResultPanel(t.id)}
                    >
                      <span>{t.displayText}</span>
                      {scores ? (
                        <span className="ml-1 text-[8px] text-gray-700 no-underline">
                          {scores}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              : "\u00a0"}
          </div>

          {editable && (
            <div
              ref={testEditRef}
              className={`month-box-test-edit${testsEditOpen ? " is-open" : ""}`}
            >
              <button
                type="button"
                onClick={() =>
                  testsEditOpen ? closeTestsEdit() : setTestsEditOpen(true)
                }
                className="month-box-test-edit-btn text-[10px] text-gray-500 underline"
              >
                {testsEditOpen ? "閉じる" : "テスト編集"}
              </button>
              {testsEditOpen && (
                <div className="month-box-test-panel">
                  {month.tests.map((t) => (
                    <label
                      key={`selected-${t.id}`}
                      className="month-box-test-option flex items-start gap-1.5 text-left text-[10px] leading-snug text-red-600"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0 scale-110"
                        checked
                        onChange={(e) => toggleTest(t.id, e.target.checked)}
                      />
                      <span>{t.displayText}</span>
                    </label>
                  ))}
                  {otherTests.length > 0 && month.tests.length > 0 && (
                    <div
                      className="my-1 border-t border-gray-200"
                      aria-hidden
                    />
                  )}
                  {otherTests.map((t) => (
                    <label
                      key={t.id}
                      className="month-box-test-option flex items-start gap-1.5 text-left text-[10px] leading-snug text-red-600"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0 scale-110"
                        checked={false}
                        onChange={(e) => toggleTest(t.id, e.target.checked)}
                      />
                      <span>{t.displayText}</span>
                    </label>
                  ))}
                  {month.tests.length === 0 &&
                    otherTests.length === 0 &&
                    !addingTest && (
                    <div className="text-[10px] text-gray-500">候補なし</div>
                  )}
                  {addingTest ? (
                    <div className="month-box-test-add-form mt-1 space-y-1 text-left text-gray-800">
                      <input
                        type="text"
                        className="month-box-test-field w-full border border-gray-300"
                        value={newTestName}
                        placeholder="テスト名"
                        onChange={(e) => setNewTestName(e.target.value)}
                      />
                      <label className="flex items-center gap-1 text-[10px]">
                        <span className="shrink-0 text-gray-700">塾名</span>
                        <select
                          className="month-box-test-field min-w-0 flex-1 border border-gray-300"
                          value={newTestCramSchool}
                          onChange={(e) => setNewTestCramSchool(e.target.value)}
                        >
                          <option value="">選択</option>
                          {CRAM_SCHOOL_NAMES.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-1 text-[10px]">
                        <span className="shrink-0 text-gray-700">学年</span>
                        <select
                          className="month-box-test-field min-w-0 flex-1 border border-gray-300"
                          value={newTestGrade}
                          onChange={(e) => setNewTestGrade(e.target.value)}
                        >
                          {GRADES.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          className="month-box-test-field month-box-test-date min-w-0 flex-1 border border-gray-300"
                          value={testDateToNativeInput(newTestDate)}
                          onChange={(e) =>
                            setNewTestDate(nativeInputToTestDate(e.target.value))
                          }
                        />
                        <input
                          type="text"
                          className="month-box-test-field month-box-test-date-text w-[4.5rem] shrink-0 border border-gray-300"
                          value={newTestDate}
                          placeholder="2026/4"
                          inputMode="numeric"
                          onChange={(e) =>
                            setNewTestDate(
                              sanitizeTestDateInput(e.target.value),
                            )
                          }
                          onBlur={() =>
                            setNewTestDate((value) => normalizeDateInput(value))
                          }
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-[10px] text-blue-700 underline disabled:opacity-50"
                          disabled={savingTest || !newTestName.trim() || !newTestCramSchool.trim()}
                          onClick={() => void submitNewTest()}
                        >
                          {savingTest ? "保存中…" : "追加"}
                        </button>
                        <button
                          type="button"
                          className="text-[10px] text-gray-500 underline"
                          onClick={() => {
                            setAddingTest(false);
                            setNewTestName("");
                            setNewTestDate("");
                            setNewTestGrade(defaultGrade);
                            setNewTestCramSchool(defaultCramSchool);
                          }}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="month-box-test-add-btn mt-1 text-[10px] text-gray-600 underline"
                      onClick={() => {
                        setAddingTest(true);
                        setNewTestGrade(defaultGrade);
                        setNewTestCramSchool(defaultCramSchool);
                      }}
                    >
                      ＋新規テスト
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {resultTestId && activeResultTest && (
          <div className="month-box-result-wrap relative shrink-0">
            <TestResultPanel
              testLabel={activeResultTest.displayText}
              editable={Boolean(editable && onTestResultSave)}
              form={resultForm}
              saving={savingResult}
              hasStoredResult={hasStoredResult}
              onFormChange={setResultForm}
              onSave={saveResult}
              onDelete={deleteResult}
              onDismiss={closeResultPanel}
            />
          </div>
        )}

        {editable ? (
          <textarea
            className="program-sheet-content box-border min-h-0 min-w-0 w-full max-w-full flex-1 resize-none border-0 bg-transparent text-[10px] leading-relaxed outline-none"
            value={month.content}
            placeholder="対策内容を入力"
            onChange={(e) =>
              onMonthChange?.(month.id, "content", e.target.value)
            }
          />
        ) : (
          <div className="program-sheet-content min-h-0 min-w-0 flex-1 overflow-hidden whitespace-pre-wrap break-words">
            {month.content}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProgramSheet({
  studentName,
  gender,
  grade,
  subject,
  goal,
  campus,
  attendanceCampus,
  cramSchool,
  studentClass,
  targetSchool,
  initialMockExams,
  teacherName,
  initialChallenges,
  recentTestResults,
  months,
  editable,
  onCampusChange,
  onGoalChange,
  onInitialMockExamsChange,
  onInitialChallengesChange,
  onMonthChange,
  onTestsChange,
  onTestCreate,
  onTestResultSave,
  allTestsForMonth = {},
  availableTests = {},
}: ProgramSheetProps) {
  const monthTestPool = (yearMonth: string) =>
    allTestsForMonth[yearMonth] ?? availableTests[yearMonth] ?? [];
  const showHeaderMeta = editable || Boolean(teacherName) || Boolean(campus);

  return (
    <div className="program-sheet mx-auto box-border border border-neutral-300 text-gray-900">
      <div className="program-sheet-header-bg" aria-hidden />
      <div className="program-sheet-main-bg" aria-hidden />
      <div className="program-sheet-footer-bg" aria-hidden />
      <div className="program-sheet-inner">
      <div className="program-sheet-header flex shrink-0 flex-col justify-center gap-0.5">
        <div className="program-sheet-header-main flex min-w-0 items-center justify-between gap-2">
          <h1 className="program-sheet-header-title min-w-0 leading-snug">
            {formatStudentDisplayName(studentName, gender)}　{subject}{" "}
            合格プログラムシート({grade})
          </h1>
          {showHeaderMeta && (
            <div className="program-sheet-header-meta">
              {editable ? (
                <>
                  <select
                    className="program-sheet-header-meta-input"
                    value={campus}
                    onChange={(e) => onCampusChange?.(e.target.value)}
                    aria-label="受験Dr.校舎"
                  >
                    <option value="">校舎を選択</option>
                    {EXAM_DR_CAMPUS_NAMES.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    {campus &&
                      !EXAM_DR_CAMPUS_NAMES.includes(
                        campus as (typeof EXAM_DR_CAMPUS_NAMES)[number],
                      ) && <option value={campus}>{campus}</option>}
                  </select>
                  {teacherName && (
                    <>
                      <span className="program-sheet-header-meta-sep" aria-hidden>
                        {"　"}
                      </span>
                      <span className="program-sheet-header-meta-teacher">
                        {teacherName}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <>
                  {campus ? (
                    <span className="program-sheet-header-meta-campus">{campus}</span>
                  ) : null}
                  {teacherName ? (
                    <>
                      {campus ? (
                        <span className="program-sheet-header-meta-sep" aria-hidden>
                          {"　"}
                        </span>
                      ) : null}
                      <span className="program-sheet-header-meta-teacher">
                        {teacherName}
                      </span>
                    </>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>
        {(editable || goal) && (
          <div className="program-sheet-header-goal">
            <span className="program-sheet-header-goal-mark" aria-hidden>
              ‐
            </span>
            {editable ? (
              <input
                type="text"
                className="program-sheet-header-goal-input"
                value={goal}
                onChange={(e) => onGoalChange?.(e.target.value)}
                placeholder="志望校合格に向けて"
                aria-label="目標"
              />
            ) : (
              <span className="program-sheet-header-goal-text">{goal}</span>
            )}
            <span className="program-sheet-header-goal-mark" aria-hidden>
              ‐
            </span>
          </div>
        )}
      </div>

      <div className="program-sheet-body">
        <div className="program-sheet-box-layer">
          <div className="program-sheet-layout">
            <div className="program-sheet-top-row">
              <div
                className="program-box-slot program-box-slot--top"
                style={topBoxSlotStyle(0)}
              >
                <StartBox
                  subject={subject}
                  cramSchool={cramSchool}
                  attendanceCampus={attendanceCampus}
                  studentClass={studentClass}
                  targetSchool={targetSchool}
                  initialMockExams={initialMockExams}
                  initialChallenges={initialChallenges}
                  editable={editable}
                  onInitialMockExamsChange={onInitialMockExamsChange}
                  onInitialChallengesChange={onInitialChallengesChange}
                />
                <div className="month-box-connector month-box-connector--down" />
              </div>
              {months.map((month, i) => (
                <MonthBoxSlot
                  key={`top-${month.id}`}
                  month={month}
                  index={i}
                  row="top"
                  editable={editable}
                  onMonthChange={onMonthChange}
                  onTestsChange={onTestsChange}
                  onTestCreate={onTestCreate}
                  onTestResultSave={onTestResultSave}
                  tests={monthTestPool(month.yearMonth)}
                  defaultGrade={grade}
                  defaultCramSchool={cramSchool}
                />
              ))}
            </div>

            <div className="program-sheet-axis-row">
              <div className="program-sheet-axis-track">
                <div className="program-sheet-axis-line" aria-hidden />
                <div
                  className="program-axis-dot program-axis-dot--top"
                  style={topBoxSlotStyle(0)}
                />
                {months.map((month, i) => (
                  <div
                    key={`dot-${month.id}`}
                    className={`program-axis-dot program-axis-dot--${i % 2 === 0 ? "bottom" : "top"}`}
                    style={axisStyleForMonthIndex(i)}
                  />
                ))}
              </div>
              <div className="program-sheet-axis-dates program-sheet-axis-dates--above">
                <div aria-hidden className="program-axis-date program-axis-date--top" style={topBoxSlotStyle(0)} />
                {months.map((month, i) =>
                  i % 2 === 0 ? (
                    <div
                      key={`date-above-${month.id}`}
                      className="program-axis-date program-axis-date--bottom"
                      style={axisStyleForMonthIndex(i)}
                    >
                      <span>{month.timelineLabel}</span>
                    </div>
                  ) : null,
                )}
              </div>
              <div className="program-sheet-axis-dates program-sheet-axis-dates--below">
                <div aria-hidden className="program-axis-date program-axis-date--top" style={topBoxSlotStyle(0)} />
                {months.map((month, i) =>
                  i % 2 === 1 ? (
                    <div
                      key={`date-below-${month.id}`}
                      className="program-axis-date program-axis-date--top"
                      style={axisStyleForMonthIndex(i)}
                    >
                      <span>{month.timelineLabel}</span>
                    </div>
                  ) : null,
                )}
              </div>
            </div>

            <div className="program-sheet-bottom-row">
              {months.map((month, i) => (
                <MonthBoxSlot
                  key={`bottom-${month.id}`}
                  month={month}
                  index={i}
                  row="bottom"
                  editable={editable}
                  onMonthChange={onMonthChange}
                  onTestsChange={onTestsChange}
                  onTestCreate={onTestCreate}
                  onTestResultSave={onTestResultSave}
                  tests={monthTestPool(month.yearMonth)}
                  defaultGrade={grade}
                  defaultCramSchool={cramSchool}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>

      <div
        className={`program-sheet-footer flex items-start gap-2${recentTestResults.length > 0 ? " justify-between" : " justify-end"}`}
      >
        {recentTestResults.length > 0 && (
          <div className="program-sheet-recent-results program-sheet-content">
            <div className="program-sheet-recent-results-label text-[10px] leading-relaxed">
              直近の成績：
            </div>
            {recentTestResults.map((item) => {
              const scores = formatTestResultScores(item.result);
              return (
                <div
                  key={item.testScheduleId}
                  className="program-sheet-recent-results-line text-[9px] leading-tight"
                >
                  <span>{item.displayText}</span>
                  {scores ? (
                    <span className="ml-1 text-[8px] text-gray-700">{scores}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        <img
          src={jukenDoctorLogo.src}
          alt="受験ドクター"
          width={jukenDoctorLogo.width}
          height={jukenDoctorLogo.height}
          className="program-sheet-footer-logo"
          decoding="sync"
          loading="eager"
        />
      </div>
    </div>
  );
}
