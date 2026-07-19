"use client";

import {
  COURSE_PROPOSAL_SEASON_LABELS,
  type CourseProposalSheetData,
  type CourseProposalSubject,
  type CourseProposalSubjectData,
} from "@/lib/course-proposal-types";
import { formatGradeDisplay } from "@/lib/constants";
import { formatStudentDisplayName } from "@/lib/months";
import jukenDoctorLogo from "../../public/juken-doctor-logo.png";

type Props = {
  sheet: CourseProposalSheetData;
  onSubjectChange: (
    subject: CourseProposalSubject,
    data: CourseProposalSubjectData,
  ) => void;
  onSlotSubjectChange: (slotIndex: number, subject: CourseProposalSubject) => void;
};

function SubjectBox({
  subject,
  data,
  editable,
  availableSubjects,
  showSubjectSelect,
  onSubjectSelect,
  onChange,
}: {
  subject: CourseProposalSubject;
  data: CourseProposalSubjectData;
  editable: boolean;
  availableSubjects: CourseProposalSubject[];
  showSubjectSelect: boolean;
  onSubjectSelect: (subject: CourseProposalSubject) => void;
  onChange: (data: CourseProposalSubjectData) => void;
}) {
  return (
    <div
      className={`course-proposal-subject-box${
        editable ? "" : " course-proposal-subject-box--readonly"
      }`}
    >
      <div className="course-proposal-subject-head">
        {showSubjectSelect ? (
          <select
            className="course-proposal-subject-head-select"
            value={subject}
            aria-label="表示科目"
            onChange={(event) => onSubjectSelect(event.target.value)}
          >
            {availableSubjects.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          subject
        )}
      </div>
      <div className="course-proposal-subject-body">
        <textarea
          className="course-proposal-subject-advice"
          value={data.advice}
          readOnly={!editable}
          onChange={(e) => onChange({ ...data, advice: e.target.value })}
          placeholder="講習時に行う内容を入力"
        />
      </div>
      <div className="course-proposal-subject-meta">
        <label className="course-proposal-subject-meta-cell course-proposal-subject-meta-cell--count">
          <span>提案コマ数</span>
          <input
            type="text"
            inputMode="numeric"
            className="course-proposal-subject-meta-input"
            value={data.sessionCount}
            readOnly={!editable}
            onChange={(e) =>
              onChange({ ...data, sessionCount: e.target.value })
            }
          />
          <span>コマ</span>
        </label>
        <div className="course-proposal-subject-meta-cell">
          <span>担当講師</span>
          <span className="course-proposal-subject-meta-value">
            {data.teacherName}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CourseProposalSheet({
  sheet,
  onSubjectChange,
  onSlotSubjectChange,
}: Props) {
  const seasonLabel = COURSE_PROPOSAL_SEASON_LABELS[sheet.season];
  const campusLabel =
    sheet.teacherCampuses.length > 0
      ? `校舎 ${sheet.teacherCampuses.join("・")}`
      : "校舎";

  return (
    <div className="course-proposal-sheet mx-auto box-border border border-neutral-300 shadow-sm">
      <div className="course-proposal-sheet-inner">
        <table className="course-proposal-header-table">
          <tbody>
            <tr>
              <td>
                {formatStudentDisplayName(
                  sheet.student.name,
                  sheet.student.gender,
                )}
              </td>
              <td>{formatGradeDisplay(sheet.student.grade)}</td>
              <td>{campusLabel}</td>
            </tr>
          </tbody>
        </table>

        <div className="course-proposal-title-block">
          <h1>
            {sheet.year}年 {seasonLabel}提案書
          </h1>
          <p>担当講師より対策内容の詳細</p>
        </div>

        <div className="course-proposal-grid">
          {sheet.subjectSlots.map((subject, slotIndex) => (
            <SubjectBox
              key={slotIndex}
              subject={subject}
              data={sheet.subjects[subject]}
              editable={Boolean(sheet.editableSubjects[subject])}
              availableSubjects={sheet.availableSubjects}
              showSubjectSelect={sheet.availableSubjects.length > 4}
              onSubjectSelect={(nextSubject) =>
                onSlotSubjectChange(slotIndex, nextSubject)
              }
              onChange={(data) => {
                if (!sheet.editableSubjects[subject]) return;
                onSubjectChange(subject, data);
              }}
            />
          ))}
        </div>

        <div className="course-proposal-footer">
          <img
            src={jukenDoctorLogo.src}
            alt="Juken Doctor"
            width={jukenDoctorLogo.width}
            height={jukenDoctorLogo.height}
            className="course-proposal-footer-logo"
          />
        </div>
      </div>
    </div>
  );
}
