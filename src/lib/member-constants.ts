import { EXAM_DR_CAMPUS_NAMES } from "./constants";

export const MEMBER_ROLES = ["管理者", "校長", "社員", "非常勤"] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

export type MemberSeed = {
  name: string;
  loginId: string;
  password: string;
  memberRole: MemberRole;
  assignedCampus?: string;
  /** 旧ローマ字アカウント名など、移行時に照合する loginId */
  legacyLoginIds?: string[];
};

/** 氏名＝フルネーム、アカウント名＝姓（漢字 loginId）、パスワード＝ローマ字 */
export const INITIAL_MEMBERS: MemberSeed[] = [
  { name: "久米　光太郎", loginId: "久米", password: "ikuno", memberRole: "社員" },
  {
    name: "吉野　真治",
    loginId: "吉野",
    password: "iwase",
    memberRole: "校長",
    assignedCampus: "御茶ノ水校",
  },
  { name: "勝山　利信", loginId: "勝山", password: "gouukon", memberRole: "社員" },
  {
    name: "坂井　智則",
    loginId: "坂井",
    password: "kotsuta",
    memberRole: "校長",
    assignedCampus: "東京校",
  },
  { name: "桑田　陽一", loginId: "桑田", password: "suganuma", memberRole: "校長" },
  { name: "清水　栄太", loginId: "清水", password: "takeuchi", memberRole: "社員" },
  {
    name: "高田　いさむ",
    loginId: "高田",
    password: "takeda",
    memberRole: "校長",
    assignedCampus: "代々木校",
  },
  {
    name: "江田　勝",
    loginId: "江田",
    password: "tazawa",
    memberRole: "校長",
    assignedCampus: "麻布十番校",
  },
  { name: "永田　理", loginId: "永田", password: "nagaosa", memberRole: "社員" },
  { name: "佐倉　沙良", loginId: "佐倉", password: "natsume", memberRole: "社員" },
  {
    name: "亀井　章三",
    loginId: "亀井",
    password: "niikawa",
    memberRole: "校長",
    assignedCampus: "自由が丘校",
  },
  { name: "佐々木　裕子", loginId: "佐々木", password: "barada", memberRole: "社員" },
  { name: "安部　公一郎", loginId: "安部", password: "higashi", memberRole: "管理者" },
  {
    name: "海田　真凛",
    loginId: "海田",
    password: "matsuura",
    memberRole: "管理者",
    assignedCampus: "四谷校",
  },
  { name: "天野　源太郎", loginId: "天野", password: "mizuta", memberRole: "社員" },
  { name: "白石　聡", loginId: "白石", password: "mineoka", memberRole: "社員" },
  { name: "千葉　誠", loginId: "千葉", password: "mori", memberRole: "社員" },
  {
    name: "吉岡　英慈",
    loginId: "吉岡",
    password: "yamaguchi",
    memberRole: "管理者",
    assignedCampus: "横浜校",
    legacyLoginIds: ["yoshioka"],
  },
  {
    name: "大木　快",
    loginId: "大木",
    password: "yamasaki",
    memberRole: "校長",
    assignedCampus: "成城学園校",
  },
  { name: "咲山　祐樹", loginId: "咲山", password: "yamazaki", memberRole: "社員" },
  { name: "太田　陽光", loginId: "太田", password: "yokota", memberRole: "社員" },
  { name: "広瀬　亜依", loginId: "広瀬", password: "ikeda", memberRole: "非常勤" },
  { name: "長門　明", loginId: "長門", password: "takahashi", memberRole: "非常勤" },
  { name: "伊藤　渉", loginId: "伊藤", password: "takeda", memberRole: "非常勤" },
  { name: "小林　宏斗", loginId: "小林", password: "naitou", memberRole: "非常勤" },
  { name: "森　鉄之助", loginId: "森", password: "nakazawa", memberRole: "非常勤" },
  { name: "吉田　健太郎", loginId: "吉田", password: "nagase", memberRole: "非常勤" },
  { name: "高倉　香", loginId: "高倉", password: "nukanobu", memberRole: "非常勤" },
  { name: "宮下　善紀", loginId: "宮下", password: "miyashita", memberRole: "非常勤" },
  { name: "笹田　晋平", loginId: "笹田", password: "sasada", memberRole: "非常勤" },
  { name: "手塚　勝吾", loginId: "手塚", password: "tezuka", memberRole: "非常勤" },
  { name: "佐藤　絵利子", loginId: "佐藤", password: "sato", memberRole: "非常勤" },
  { name: "川内　陽次朗", loginId: "川内", password: "kawauchi", memberRole: "非常勤" },
  { name: "上西　嘉乃", loginId: "上西", password: "uenishi", memberRole: "非常勤" },
  { name: "藤吉　史朗", loginId: "藤吉", password: "fujiyoshi", memberRole: "非常勤" },
  { name: "浅田　康介", loginId: "浅田", password: "asada", memberRole: "非常勤" },
  { name: "河添　淳一郎", loginId: "河添", password: "kouzoe", memberRole: "非常勤" },
  { name: "篠崎　慶太", loginId: "篠崎", password: "sinozaki", memberRole: "非常勤" },
  { name: "八尾　嘉信", loginId: "八尾", password: "yao", memberRole: "非常勤" },
  { name: "合田　結衣子", loginId: "合田", password: "ogita", memberRole: "非常勤" },
];

export { EXAM_DR_CAMPUS_NAMES as MEMBER_CAMPUS_NAMES };

export function memberRoleToAccessRole(
  memberRole: string,
): "admin" | "teacher" {
  return memberRole === "管理者" ? "admin" : "teacher";
}

export function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}

/** 担当校舎を持てる権限（校長、または校舎担当の管理者） */
export function supportsAssignedCampus(memberRole: MemberRole | string): boolean {
  return memberRole === "校長" || memberRole === "管理者";
}

export function resolveAssignedCampus(
  memberRole: MemberRole,
  assignedCampus?: string,
): string | null {
  if (!supportsAssignedCampus(memberRole)) return null;
  return assignedCampus?.trim() || null;
}
