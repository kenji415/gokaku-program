/** 月ボックス内「対策内容」の共通フォントサイズ（px） */
export const PROGRAM_CONTENT_FONT_SIZES = [10, 9, 8, 7, 6] as const;

export type ProgramContentFontSize =
  (typeof PROGRAM_CONTENT_FONT_SIZES)[number];

export const DEFAULT_PROGRAM_CONTENT_FONT_SIZE: ProgramContentFontSize = 10;

export function normalizeProgramContentFontSize(
  value: unknown,
): ProgramContentFontSize {
  const n = typeof value === "number" ? value : Number(value);
  if (PROGRAM_CONTENT_FONT_SIZES.includes(n as ProgramContentFontSize)) {
    return n as ProgramContentFontSize;
  }
  return DEFAULT_PROGRAM_CONTENT_FONT_SIZE;
}

export function adjustProgramContentFontSize(
  current: ProgramContentFontSize,
  direction: "smaller" | "larger",
): ProgramContentFontSize {
  const index = PROGRAM_CONTENT_FONT_SIZES.indexOf(current);
  const nextIndex =
    direction === "smaller"
      ? Math.min(PROGRAM_CONTENT_FONT_SIZES.length - 1, index + 1)
      : Math.max(0, index - 1);
  return PROGRAM_CONTENT_FONT_SIZES[nextIndex] ?? current;
}
