import {
  studentNameMatchesQuery,
  studentNamesMatch,
} from "./student-name";

export type TeacherOption = {
  id: string;
  name: string;
};

/** 候補は全件返す（UI側でスクロール）。途中入力で他講師に吸い込まれないよう、一意一致の強制確定はしない。 */
export function filterTeacherOptions(
  options: TeacherOption[],
  query: string,
): TeacherOption[] {
  const trimmed = query.trim();
  if (!trimmed) return options;
  return options.filter((teacher) =>
    studentNameMatchesQuery(teacher.name, trimmed),
  );
}

export function findExactTeacherOption(
  options: TeacherOption[],
  inputName: string,
): TeacherOption | undefined {
  const trimmed = inputName.trim();
  if (!trimmed) return undefined;
  return (
    options.find((teacher) => teacher.name === trimmed) ??
    options.find((teacher) => studentNamesMatch(teacher.name, trimmed))
  );
}

export function resolveTeacherAssignment(
  inputName: string,
  currentTeacherId: string,
  options: TeacherOption[],
): { teacherId: string; teacherName: string } {
  const trimmed = inputName.trim();
  if (!trimmed) {
    return { teacherId: "", teacherName: "" };
  }

  const exact = findExactTeacherOption(options, trimmed);
  if (exact) {
    return { teacherId: exact.id, teacherName: exact.name };
  }

  // 途中入力の部分一致では確定しない。保存時は正式名との一致のみ採用する。
  if (currentTeacherId) {
    const current = options.find((teacher) => teacher.id === currentTeacherId);
    if (
      current &&
      (current.name === trimmed || studentNamesMatch(current.name, trimmed))
    ) {
      return { teacherId: current.id, teacherName: current.name };
    }
  }

  return { teacherId: "", teacherName: trimmed };
}

export function teacherDisplayName(
  teacherId: string,
  options: TeacherOption[],
): string {
  if (!teacherId) return "";
  return options.find((teacher) => teacher.id === teacherId)?.name ?? "";
}
