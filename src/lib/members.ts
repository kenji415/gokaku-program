import { eq, like } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import * as schema from "./db/schema";
import {
  INITIAL_MEMBERS,
  isMemberRole,
  memberRoleToAccessRole,
  resolveAssignedCampus,
  type MemberRole,
} from "./member-constants";

export type MemberRecord = {
  id: string;
  name: string;
  loginId: string;
  password: string;
  memberRole: MemberRole;
  assignedCampus: string;
};

export type MemberInput = {
  id?: string;
  name: string;
  loginId: string;
  password: string;
  memberRole: MemberRole;
  assignedCampus?: string;
};

function resolveMemberRole(
  memberRole: string | null | undefined,
  accessRole: string,
): MemberRole {
  if (isMemberRole(memberRole ?? "")) return memberRole as MemberRole;
  return accessRole === "admin" ? "管理者" : "社員";
}

function rowToMember(row: typeof schema.users.$inferSelect): MemberRecord {
  return {
    id: row.id,
    name: row.name,
    loginId: row.loginId,
    password: row.password,
    memberRole: resolveMemberRole(row.memberRole, row.role),
    assignedCampus: row.assignedCampus?.trim() ?? "",
  };
}

export function listMembers(): MemberRecord[] {
  const db = getDb();
  return db
    .select()
    .from(schema.users)
    .all()
    .map(rowToMember)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function upsertMember(input: MemberInput): MemberRecord {
  const db = getDb();
  const loginId = input.loginId.trim();
  const name = input.name.trim();
  const password = input.password;
  const memberRole = input.memberRole;
  const assignedCampus = resolveAssignedCampus(
    memberRole,
    input.assignedCampus,
  );
  const role = memberRoleToAccessRole(memberRole);

  if (!loginId || !name) {
    throw new Error("氏名とアカウント名は必須です");
  }

  const duplicate = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.loginId, loginId))
    .get();
  if (duplicate && duplicate.id !== input.id) {
    throw new Error(`アカウント名「${loginId}」は既に使われています`);
  }

  if (input.id) {
    const existing = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, input.id))
      .get();
    if (!existing) throw new Error("メンバーが見つかりません");

    db.update(schema.users)
      .set({
        name,
        loginId,
        password,
        role,
        memberRole,
        assignedCampus,
      })
      .where(eq(schema.users.id, input.id))
      .run();

    return rowToMember(
      db.select().from(schema.users).where(eq(schema.users.id, input.id)).get()!,
    );
  }

  const id = uuid();
  db.insert(schema.users)
    .values({
      id,
      name,
      loginId,
      password,
      role,
      memberRole,
      assignedCampus,
      defaultCampus: null,
    })
    .run();

  return rowToMember(
    db.select().from(schema.users).where(eq(schema.users.id, id)).get()!,
  );
}

export function deleteMember(id: string): void {
  const db = getDb();
  db.delete(schema.users).where(eq(schema.users.id, id)).run();
}

export function bulkSaveMembers(
  rows: MemberInput[],
  deletedIds: string[] = [],
): MemberRecord[] {
  for (const id of deletedIds) {
    if (id.trim()) deleteMember(id);
  }

  for (const row of rows) {
    if (!row.name.trim() && !row.loginId.trim()) continue;
    upsertMember(row);
  }

  return listMembers();
}

export function seedMembersIfNeeded(
  sqlite: import("better-sqlite3").Database,
  db: BetterSQLite3Database<typeof schema>,
): void {

  for (const member of INITIAL_MEMBERS) {
    let existing =
      db
        .select()
        .from(schema.users)
        .where(eq(schema.users.loginId, member.loginId))
        .get() ??
      db
        .select()
        .from(schema.users)
        .where(eq(schema.users.name, member.name))
        .get() ??
      db
        .select()
        .from(schema.users)
        .where(like(schema.users.name, `${member.loginId}%`))
        .get() ??
      db
        .select()
        .from(schema.users)
        .where(eq(schema.users.loginId, member.password))
        .get();

    if (!existing && member.legacyLoginIds) {
      for (const legacyId of member.legacyLoginIds) {
        existing = db
          .select()
          .from(schema.users)
          .where(eq(schema.users.loginId, legacyId))
          .get();
        if (existing) break;
      }
    }

    const role = memberRoleToAccessRole(member.memberRole);
    const assignedCampus = resolveAssignedCampus(
      member.memberRole,
      member.assignedCampus,
    );

    if (existing) {
      db.update(schema.users)
        .set({
          name: member.name,
          loginId: member.loginId,
          password: member.password,
          role,
          memberRole: member.memberRole,
          assignedCampus,
        })
        .where(eq(schema.users.id, existing.id))
        .run();
      continue;
    }

    db.insert(schema.users)
      .values({
        id: uuid(),
        name: member.name,
        loginId: member.loginId,
        password: member.password,
        role,
        memberRole: member.memberRole,
        assignedCampus,
        defaultCampus: null,
      })
      .run();
  }

  const flag = sqlite
    .prepare(`SELECT value FROM app_meta WHERE key = 'seed_members_v1'`)
    .get() as { value: string } | undefined;

  if (!flag) {
    sqlite
      .prepare(`INSERT INTO app_meta (key, value) VALUES ('seed_members_v1', '1')`)
      .run();
  }
}
