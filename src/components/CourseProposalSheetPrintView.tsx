import {
  COURSE_PROPOSAL_SEASON_LABELS,
  type CourseProposalSheetData,
} from "@/lib/course-proposal-types";
import { formatGradeDisplay } from "@/lib/constants";
import { formatStudentDisplayName } from "@/lib/months";
import jukenDoctorLogo from "../../public/juken-doctor-logo.png";

function MultilineText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  return (
    <>
      {lines.map((line, index) => (
        <span key={index}>
          {line}
          {index < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </>
  );
}

/** Puppeteer PDF 出力・印刷用（サーバー描画・編集不可） */
export function CourseProposalSheetPrintView({
  sheet,
}: {
  sheet: CourseProposalSheetData;
}) {
  const seasonLabel = COURSE_PROPOSAL_SEASON_LABELS[sheet.season];
  const campusLabel =
    sheet.teacherCampuses.length > 0
      ? `校舎 ${sheet.teacherCampuses.join("・")}`
      : "校舎";

  return (
    <div className="course-proposal-print-page">
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
            {sheet.subjectSlots.map((subject) => {
              const data = sheet.subjects[subject];
              return (
                <div
                  key={subject}
                  className="course-proposal-subject-box course-proposal-subject-box--readonly"
                >
                  <div className="course-proposal-subject-head">{subject}</div>
                  <div className="course-proposal-subject-body">
                    <div className="course-proposal-subject-advice">
                      <MultilineText text={data.advice} />
                    </div>
                  </div>
                  <div className="course-proposal-subject-meta">
                    <div className="course-proposal-subject-meta-cell course-proposal-subject-meta-cell--count">
                      <span>提案コマ数</span>
                      <span className="course-proposal-subject-meta-value">
                        {data.sessionCount}
                      </span>
                      <span>コマ</span>
                    </div>
                    <div className="course-proposal-subject-meta-cell">
                      <span>担当講師</span>
                      <span className="course-proposal-subject-meta-value">
                        {data.teacherName}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
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
    </div>
  );
}
