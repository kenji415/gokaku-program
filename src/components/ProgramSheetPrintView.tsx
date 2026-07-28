import { ProgramSheet } from "@/components/ProgramSheet";
import type { ProgramSheetData } from "@/lib/programs";
import {
  DEFAULT_PROGRAM_CONTENT_FONT_SIZE,
  type ProgramContentFontSize,
} from "@/lib/program-content-font";

/** Puppeteer PDF 出力・印刷プレビュー用の編集なし1枚表示 */
export function ProgramSheetPrintView({
  sheet,
  contentFontSize = DEFAULT_PROGRAM_CONTENT_FONT_SIZE,
}: {
  sheet: ProgramSheetData;
  contentFontSize?: ProgramContentFontSize;
}) {
  return (
    <div className="program-print-page">
      <ProgramSheet
          studentName={sheet.student.name}
          gender={sheet.student.gender}
          grade={sheet.student.grade}
          subject={sheet.subject}
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
          contentFontSize={contentFontSize}
        />
    </div>
  );
}
