import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DEMO_PASSWORDS: Record<string, string> = {
  admin: "admin",
  yoshioka: "teacher",
};

export function seedDatabase(db: BetterSQLite3Database<typeof schema>) {
  const existing = db.select().from(schema.users).all();

  if (existing.length > 0) {
    for (const user of existing) {
      const password = DEMO_PASSWORDS[user.loginId];
      if (password && !user.password) {
        db.update(schema.users)
          .set({ password })
          .where(eq(schema.users.id, user.id))
          .run();
      }
    }
    ensureTestSchedules(db);
    return;
  }

  const adminId = uuid();
  const teacherId = uuid();
  const studentId = uuid();

  db.insert(schema.users).values([
    {
      id: adminId,
      name: "管理者",
      loginId: "admin",
      password: "admin",
      role: "admin",
    },
    {
      id: teacherId,
      name: "吉岡 英慈",
      loginId: "yoshioka",
      password: "teacher",
      role: "teacher",
    },
  ]).run();

  db.insert(schema.students).values({
    id: studentId,
    name: "森田 敏弘",
    gender: "男",
    grade: "4年",
    cramSchool: "SAPIX",
    campus: "四谷校",
    className: "",
    mockExamPattern: "SAPIX",
    initialChallenges:
      "3月度組分けテスト　4科56.8　算59　社56　理55　社48\nテストで時間が足りない　計算ミスや転記ミスが多い　図形や文章",
    goal: "志望校合格に向けて",
    startDate: "2026/06/01",
  }).run();

  db.insert(schema.studentAssignments).values({
    id: uuid(),
    studentId,
    teacherId,
    subject: "算数",
  }).run();

  const tests = [
    {
      grade: "4年",
      testName: "6月度マンスリーテスト",
      testDate: "6/13",
      displayText: "06/13 6月公開組分け(第3回)",
      yearMonth: "2026-06",
    },
    {
      grade: "4年",
      testName: "7月度マンスリーテスト",
      testDate: "7/18",
      displayText: "07/18 7月度マンスリーテスト(第4回)",
      yearMonth: "2026-07",
    },
    {
      grade: "4年",
      testName: "8月度マンスリーテスト",
      testDate: "8/30",
      displayText: "08/30 8月度マンスリーテスト(第5回)",
      yearMonth: "2026-08",
    },
    {
      grade: "4年",
      testName: "10月度マンスリーテスト",
      testDate: "10/4",
      displayText: "10/04 10月度マンスリーテスト(第6回)",
      yearMonth: "2026-10",
    },
    {
      grade: "4年",
      testName: "11月度マンスリーテスト",
      testDate: "11/8",
      displayText: "11/08 11月度マンスリーテスト(第7回)",
      yearMonth: "2026-11",
    },
  ];

  for (const t of tests) {
    db.insert(schema.testSchedules).values({
      id: uuid(),
      cramSchool: "SAPIX",
      inTestCourse: 1,
      ...t,
    }).run();
  }

  ensureTestSchedules(db);
}

const EXTRA_TESTS = [
  {
    grade: "6年",
    testName: "6月度マンスリーテスト",
    testDate: "6/13",
    displayText: "06/13 6月度マンスリーテスト",
    yearMonth: "2026-06",
  },
  {
    grade: "6年",
    testName: "7月度マンスリーテスト",
    testDate: "7/18",
    displayText: "07/18 7月度マンスリーテスト",
    yearMonth: "2026-07",
  },
  {
    grade: "6年",
    testName: "8月度マンスリーテスト",
    testDate: "8/30",
    displayText: "08/30 8月度マンスリーテスト",
    yearMonth: "2026-08",
  },
  {
    grade: "6年",
    testName: "9月度マンスリーテスト",
    testDate: "9/15",
    displayText: "09/15 9月度マンスリーテスト",
    yearMonth: "2026-09",
  },
  {
    grade: "6年",
    testName: "10月度マンスリーテスト",
    testDate: "10/4",
    displayText: "10/04 10月度マンスリーテスト",
    yearMonth: "2026-10",
  },
  {
    grade: "6年",
    testName: "11月度マンスリーテスト",
    testDate: "11/8",
    displayText: "11/08 11月度マンスリーテスト",
    yearMonth: "2026-11",
  },
];

function ensureTestSchedules(db: BetterSQLite3Database<typeof schema>) {
  for (const t of EXTRA_TESTS) {
    const found = db
      .select()
      .from(schema.testSchedules)
      .where(eq(schema.testSchedules.displayText, t.displayText))
      .get();
    if (!found) {
      db.insert(schema.testSchedules).values({
        id: uuid(),
        cramSchool: "SAPIX",
        inTestCourse: 1,
        ...t,
      }).run();
    }
  }
}
