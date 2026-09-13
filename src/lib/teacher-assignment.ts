import {
  compactStudentName,
  studentNameMatchesQuery,
  studentNamesMatch,
} from "./student-name";

export type TeacherOption = {
  id: string;
  name: string;
};

/** 「吉田先生」「吉田 」など入力ゆれを姓・本名照合用に整える */
export function normalizeTeacherQuery(input: string): string {
  return input
    .trim()
    .replace(/[　\s]+$/g, "")
    .replace(/(先生|先生。)+$/u, "")
    .trim();
}

function teacherSurname(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.split(/[\s　]+/)[0] ?? trimmed;
}

/** 候補は全件返す（UI側でスクロール）。途中入力で他講師に吸い込まれないよう、一意一致の強制確定はしない。 */
export function filterTeacherOptions(
  options: TeacherOption[],
  query: string,
): TeacherOption[] {
  const trimmed = normalizeTeacherQuery(query);
  if (!trimmed) return options;
  return options.filter((teacher) =>
    studentNameMatchesQuery(teacher.name, trimmed),
  );
}

export function findExactTeacherOption(
  options: TeacherOption[],
  inputName: string,
): TeacherOption | undefined {
  const trimmed = normalizeTeacherQuery(inputName);
  if (!trimmed) return undefined;

  const exact =
    options.find((teacher) => teacher.name === trimmed) ??
    options.find((teacher) => studentNamesMatch(teacher.name, trimmed));
  if (exact) return exact;

  // 「吉田」「吉田先生」→ 姓が一意ならその講師に確定
  const compact = compactStudentName(trimmed);
  const surnameMatches = options.filter((teacher) => {
    const surname = teacherSurname(teacher.name);
    return (
      surname === trimmed ||
      compactStudentName(surname) === compact ||
      studentNamesMatch(surname, trimmed)
    );
  });
  if (surnameMatches.length === 1) return surnameMatches[0];

  return undefined;
}

export function resolveTeacherAssignment(
  inputName: string,
  currentTeacherId: string,
  options: TeacherOption[],
): { teacherId: string; teacherName: string } {
  const trimmed = normalizeTeacherQuery(inputName);
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
      (current.name === trimmed ||
        studentNamesMatch(current.name, trimmed) ||
        findExactTeacherOption([current], trimmed))
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
