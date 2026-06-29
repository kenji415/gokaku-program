import { AppHeader } from "@/components/AppHeader";
import { StudentSpreadsheet } from "@/components/admin/StudentSpreadsheet";
import {
  getStudentAssignments,
  listStudents,
  listTeachers,
  repairBrokenStudentsInDb,
} from "@/lib/students";
import {
  expandBrokenStudentRows,
  studentRowFromDb,
} from "@/lib/student-spreadsheet-utils";

export const dynamic = "force-dynamic";

export default function AdminStudentsPage() {
  repairBrokenStudentsInDb();

  const students = listStudents();
  const teachers = listTeachers().map((t) => ({ id: t.id, name: t.name }));

  const initialRows = expandBrokenStudentRows(
    students.map((s) =>
      studentRowFromDb(
        s,
        getStudentAssignments(s.id).map((a) => ({
          subject: a.subject,
          teacherId: a.teacherId,
        })),
      ),
    ),
  ).rows;

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader title="生徒管理" />
      <main className="p-6">
        <StudentSpreadsheet initialRows={initialRows} teachers={teachers} />
      </main>
    </div>
  );
}
