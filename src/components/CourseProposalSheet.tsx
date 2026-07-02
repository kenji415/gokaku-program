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
};

const subjectGridOrder: CourseProposalSubject[] = [
  "算数",
  "国語",
  "理科",
  "社会",
];

function SubjectBox({
  subject,
  data,
  editable,
  onChange,
}: {
  subject: CourseProposalSubject;
  data: CourseProposalSubjectData;
  editable: boolean;
  onChange: (data: CourseProposalSubjectData) => void;
}) {
  return (
    <div
      className={`course-proposal-subject-box${
        editable ? "" : " course-proposal-subject-box--readonly"
      }`}
    >
      <div className="course-proposal-subject-head">{subject}</div>
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

export function CourseProposalSheet({ sheet, onSubjectChange }: Props) {
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
          {subjectGridOrder.map((subject) => (
            <SubjectBox
              key={subject}
              subject={subject}
              data={sheet.subjects[subject]}
              editable={sheet.editableSubjects[subject]}
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
