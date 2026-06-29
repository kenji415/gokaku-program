import { FinalStretchSheet } from "@/components/FinalStretchSheet";
import type { FinalStretchSheetData } from "@/lib/final-stretch-types";

/** Puppeteer PDF 出力・印刷プレビュー用の編集なし1枚表示 */
export function FinalStretchSheetPrintView({
  sheet,
}: {
  sheet: FinalStretchSheetData;
}) {
  return (
    <div className="final-stretch-print-page">
      <FinalStretchSheet
        sheet={sheet}
        editable={false}
        alignWithEditorColumns
      />
    </div>
  );
}
