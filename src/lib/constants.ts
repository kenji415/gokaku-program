export const SUBJECTS = ["算数", "国語", "理科", "社会", "数学", "英語"] as const;

export type Subject = (typeof SUBJECTS)[number];

export function isFixedSubject(subject: string): boolean {
  return (SUBJECTS as readonly string[]).includes(subject.trim());
}

export const GRADES = [
  "6年",
  "5年",
  "4年",
  "3年",
  "2年",
  "1年",
  "中学1年",
  "中学2年",
  "中学3年",
] as const;

export function gradeSortRank(grade: string): number {
  const idx = (GRADES as readonly string[]).indexOf(grade);
  return idx >= 0 ? idx : GRADES.length;
}

/** 講習提案書など帳票向けの学年表記（例: 5年 → 小学5年） */
export function formatGradeDisplay(grade: string): string {
  const trimmed = grade.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("小学") || trimmed.startsWith("中学")) {
    return trimmed;
  }
  if (/^[1-6]年$/.test(trimmed)) {
    return `小学${trimmed}`;
  }
  return trimmed;
}

export function compareByGradeThenName(
  a: { grade: string; name: string },
  b: { grade: string; name: string },
): number {
  const gradeCmp = gradeSortRank(a.grade) - gradeSortRank(b.grade);
  if (gradeCmp !== 0) return gradeCmp;
  return a.name.localeCompare(b.name, "ja");
}

export const GENDERS = ["男", "女"] as const;

/** 塾名・模試パターンの候補（リスト外は手入力可） */
export const CRAM_SCHOOL_NAMES = [
  "Dr.おまかせ",
  "通塾なし",
  "SAPIX",
  "四谷大塚",
  "早稲田アカデミー",
  "グノーブル",
  "日能研",
  "浜学園",
  "希学園",
  "栄光ゼミナール",
  "フォトン",
  "おぎしん",
  "市進",
  "啓明館",
  "四谷準拠塾",
  "ジーニアス",
  "臨海セミナー",
  "ena",
  "TOMAS",
  "早稲田アカデミー(高校受験)",
] as const;

/** 受験Dr.校舎（プログラムシート右上）の候補 */
export const EXAM_DR_CAMPUS_NAMES = [
  "四谷校",
  "麻布十番校",
  "代々木校",
  "東京校",
  "成城学園校",
  "吉祥寺校",
  "自由が丘校",
  "横浜校",
  "御茶ノ水校",
] as const;

/** テスト日程マスタの塾別表示順（リスト外・未登録塾はこの後） */
export const TEST_SCHEDULE_CRAM_SCHOOL_ORDER = [
  "SAPIX",
  "四谷大塚",
  "早稲田アカデミー",
  "グノーブル",
  "日能研",
  "浜学園",
  "希学園",
  "栄光ゼミナール",
  "フォトン",
  "おぎしん",
  "市進",
  "啓明館",
  "四谷準拠塾",
  "ジーニアス",
  "臨海セミナー",
  "ena",
  "TOMAS",
  "早稲田アカデミー(高校受験)",
] as const;
