import { studentNameMatchesQuery } from "./student-name";

export type TeacherOption = {
  id: string;
  name: string;
};

export function filterTeacherOptions(
  options: TeacherOption[],
  query: string,
  limit = 8,
): TeacherOption[] {
  const trimmed = query.trim();
  if (!trimmed) return options.slice(0, limit);
  return options
    .filter((teacher) => studentNameMatchesQuery(teacher.name, trimmed))
    .slice(0, limit);
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

  const exact = options.find((teacher) => teacher.name === trimmed);
  if (exact) {
    return { teacherId: exact.id, teacherName: exact.name };
  }

  const matches = options.filter((teacher) =>
    studentNameMatchesQuery(teacher.name, trimmed),
  );
  if (matches.length === 1) {
    return { teacherId: matches[0].id, teacherName: matches[0].name };
  }

  if (currentTeacherId) {
    const current = options.find((teacher) => teacher.id === currentTeacherId);
    if (
      current &&
      (current.name === trimmed ||
        studentNameMatchesQuery(current.name, trimmed))
    ) {
      return { teacherId: current.id, teacherName: current.name };
    }
  }

  return { teacherId: currentTeacherId, teacherName: trimmed };
}

export function teacherDisplayName(
  teacherId: string,
  options: TeacherOption[],
): string {
  if (!teacherId) return "";
  return options.find((teacher) => teacher.id === teacherId)?.name ?? "";
}
