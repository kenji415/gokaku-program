/**
 * プログラムシートのボックス配置パラメータ。
 * 上段: topLeft〜(100% - topRightInset) の範囲に均等配置
 * 下段: 上段ボックスの隙間の中央に配置
 */
export const PROGRAM_BOX_LAYOUT = {
  /** 各ボックスの横幅 */
  width: "59.4mm",
  /** 上段・一番左ボックスの左端（ボックス列レイヤー内側から） */
  topLeft: "0mm",
  /** 上段・一番右ボックスの右端の右余白（レイヤー内側右端からの距離） */
  topRightInset: "0mm",
  /** 上段のボックス数（指導開始時 + 月3つ） */
  topCount: 4,
  /** 下段のボックス数（月3つ） */
  bottomCount: 3,
} as const;

export function topSlotForMonthIndex(monthIndex: number): number | null {
  if (monthIndex % 2 !== 1) return null;
  return (monthIndex + 1) / 2;
}

export function bottomGapIndexForMonthIndex(monthIndex: number): number | null {
  if (monthIndex % 2 !== 0) return null;
  return monthIndex / 2;
}

export function axisStyleForMonthIndex(
  monthIndex: number,
): Record<string, string | number> {
  const topSlot = topSlotForMonthIndex(monthIndex);
  if (topSlot !== null) {
    return { ["--program-box-slot"]: topSlot };
  }
  const gapIndex = bottomGapIndexForMonthIndex(monthIndex);
  if (gapIndex !== null) {
    return { ["--program-box-gap-index"]: gapIndex };
  }
  return {};
}

export function topBoxSlotStyle(
  slot: number,
): Record<string, string | number> {
  return { ["--program-box-slot"]: slot };
}
