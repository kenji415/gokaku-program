export type ExtraScoreField = {
  label: string;
  value: string;
};

export type StudentTestResultInput = {
  deviation: string;
  fourSubjects: string;
  math: string;
  japanese: string;
  science: string;
  social: string;
  notes: string;
  extraScores: ExtraScoreField[];
};

export const EMPTY_TEST_RESULT: StudentTestResultInput = {
  deviation: "",
  fourSubjects: "",
  math: "",
  japanese: "",
  science: "",
  social: "",
  notes: "",
  extraScores: [],
};

export function parseExtraScores(raw: string | null | undefined): ExtraScoreField[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as { label?: unknown; value?: unknown };
        return {
          label: typeof row.label === "string" ? row.label : "",
          value: typeof row.value === "string" ? row.value : "",
        };
      })
      .filter((item): item is ExtraScoreField => item !== null);
  } catch {
    return [];
  }
}

export function serializeExtraScores(scores: ExtraScoreField[]): string {
  const filtered = scores.filter(
    (row) => row.label.trim() !== "" || row.value.trim() !== "",
  );
  return filtered.length > 0 ? JSON.stringify(filtered) : "";
}

export function hasScoreResult(result: StudentTestResultInput): boolean {
  const standard = [
    result.deviation,
    result.fourSubjects,
    result.math,
    result.japanese,
    result.science,
    result.social,
  ].some((v) => v.trim() !== "");
  const extra = (result.extraScores ?? []).some((row) => row.value.trim() !== "");
  return standard || extra;
}

export function formatTestResultScores(result: StudentTestResultInput): string {
  const parts: string[] = [];
  if (result.fourSubjects.trim()) {
    parts.push(`四科${result.fourSubjects.trim()}`);
  }
  if (result.math.trim()) parts.push(`算${result.math.trim()}`);
  if (result.japanese.trim()) parts.push(`国${result.japanese.trim()}`);
  if (result.science.trim()) parts.push(`理${result.science.trim()}`);
  if (result.social.trim()) parts.push(`社${result.social.trim()}`);
  for (const row of result.extraScores ?? []) {
    if (!row.value.trim()) continue;
    const label = row.label.trim() || "他";
    parts.push(`${label}${row.value.trim()}`);
  }
  return parts.join("");
}

export function formatRecentTestResultLine(
  displayText: string,
  result: StudentTestResultInput,
): string {
  const scores = formatTestResultScores(result);
  if (!scores) return displayText;
  return `${displayText}　${scores}`;
}
