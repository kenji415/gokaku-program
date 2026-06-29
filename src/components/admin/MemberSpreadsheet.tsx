"use client";

import { useCallback, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { useAutoSave } from "@/hooks/use-auto-save";
import {
  MEMBER_CAMPUS_NAMES,
  MEMBER_ROLES,
  supportsAssignedCampus,
  type MemberRole,
} from "@/lib/member-constants";
import type { MemberRecord } from "@/lib/members";

type RowItem = MemberRecord & { _key: string };

type Props = {
  initialRows: MemberRecord[];
};

function newRow(partial?: Partial<MemberRecord>): RowItem {
  return {
    id: partial?.id ?? "",
    name: partial?.name ?? "",
    loginId: partial?.loginId ?? "",
    password: partial?.password ?? "",
    memberRole: partial?.memberRole ?? "社員",
    assignedCampus: partial?.assignedCampus ?? "",
    _key: uuid(),
  };
}

export function MemberSpreadsheet({ initialRows }: Props) {
  const [rows, setRows] = useState<RowItem[]>(() => [
    ...initialRows.map((row) => newRow(row)),
    newRow(),
    newRow(),
  ]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [saveRevision, setSaveRevision] = useState(0);

  const rowsRef = useRef(rows);
  const deletedIdsRef = useRef(deletedIds);
  rowsRef.current = rows;
  deletedIdsRef.current = deletedIds;

  const bumpSave = () => setSaveRevision((r) => r + 1);

  const updateCell = (
    index: number,
    field: keyof MemberRecord,
    value: string,
  ) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, [field]: value };
        if (field === "memberRole" && !supportsAssignedCampus(value)) {
          next.assignedCampus = "";
        }
        return next;
      }),
    );
    bumpSave();
  };

  const removeRow = (index: number) => {
    setRows((prev) => {
      const target = prev[index];
      if (target?.id) {
        setDeletedIds((ids) => [...ids, target.id]);
      }
      return prev.filter((_, i) => i !== index);
    });
    bumpSave();
  };

  const saveRows = useCallback(async (): Promise<boolean> => {
    const payload = rowsRef.current
      .filter((row) => row.name.trim() || row.loginId.trim())
      .map((row) => ({
        id: row.id || undefined,
        name: row.name,
        loginId: row.loginId,
        password: row.password,
        memberRole: row.memberRole,
        assignedCampus: row.assignedCampus,
      }));

    const res = await fetch("/api/admin/members/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: payload,
        deletedIds: deletedIdsRef.current,
      }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus(data.error ?? "保存に失敗しました");
      return false;
    }

    const data = (await res.json()) as { rows: MemberRecord[] };
    setRows([
      ...data.rows.map((row) => newRow(row)),
      newRow(),
      newRow(),
    ]);
    setDeletedIds([]);
    setStatus("保存しました");
    return true;
  }, []);

  const { statusLabel } = useAutoSave(saveRows, saveRevision);

  return (
    <div className="rounded border bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">メンバー一覧</h2>
          <p className="mt-1 text-xs text-gray-500">
            氏名・漢字のアカウント名・パスワード・管理権限・担当校舎（校長・校舎担当の管理者）を編集できます。ログインはアカウント名（漢字）とパスワードです。変更は自動保存されます。
          </p>
        </div>
        <span className="text-sm text-green-700">{statusLabel || status}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-[#1e3a5f] text-left text-xs text-white">
              <th className="p-2 font-medium">氏名</th>
              <th className="p-2 font-medium">アカウント名（漢字）</th>
              <th className="p-2 font-medium">パスワード</th>
              <th className="p-2 font-medium">管理権限</th>
              <th className="p-2 font-medium">担当校舎</th>
              <th className="w-10 p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row._key} className="border-b last:border-b-0">
                <td className="p-1">
                  <input
                    className="w-full rounded border px-2 py-1"
                    value={row.name}
                    onChange={(e) => updateCell(index, "name", e.target.value)}
                  />
                </td>
                <td className="p-1">
                  <input
                    className="w-full rounded border px-2 py-1"
                    value={row.loginId}
                    onChange={(e) => updateCell(index, "loginId", e.target.value)}
                    placeholder="吉岡"
                  />
                </td>
                <td className="p-1">
                  <input
                    className="w-full rounded border px-2 py-1 font-mono text-xs"
                    value={row.password}
                    onChange={(e) => updateCell(index, "password", e.target.value)}
                    placeholder="yamaguchi"
                  />
                </td>
                <td className="p-1">
                  <select
                    className="w-full rounded border px-2 py-1"
                    value={row.memberRole}
                    onChange={(e) =>
                      updateCell(index, "memberRole", e.target.value)
                    }
                  >
                    {MEMBER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-1">
                  <select
                    className="w-full rounded border px-2 py-1 disabled:bg-gray-100"
                    value={row.assignedCampus}
                    disabled={!supportsAssignedCampus(row.memberRole)}
                    onChange={(e) =>
                      updateCell(index, "assignedCampus", e.target.value)
                    }
                  >
                    <option value="">未設定</option>
                    {MEMBER_CAMPUS_NAMES.map((campus) => (
                      <option key={campus} value={campus}>
                        {campus}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-1 text-center">
                  <button
                    type="button"
                    className="text-xs text-red-600 underline"
                    onClick={() => removeRow(index)}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
