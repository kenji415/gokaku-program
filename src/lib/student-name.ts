const FULL_WIDTH_SPACE = "\u3000";

/** 氏名を全角スペース区切りに正規化（半角・全角・連続空白を統一） */
export function normalizeStudentName(name: string): string {
  return name
    .replace(/[\u3000\s]+/g, FULL_WIDTH_SPACE)
    .replace(new RegExp(`${FULL_WIDTH_SPACE}+`, "g"), FULL_WIDTH_SPACE)
    .trim();
}

/** 検索用：空白をすべて除去した氏名 */
export function compactStudentName(name: string): string {
  return normalizeStudentName(name).replace(/[\u3000\s]/g, "");
}

export function studentNamesMatch(a: string, b: string): boolean {
  const left = compactStudentName(a);
  const right = compactStudentName(b);
  return Boolean(left) && left === right;
}

export function studentNameMatchesQuery(name: string, query: string): boolean {
  const compactQ = compactStudentName(query);
  if (!compactQ) return true;
  return compactStudentName(name).includes(compactQ);
}
