import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createStudent,
  listStudents,
  listTeachers,
} from "@/lib/students";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const students = listStudents();
  const teachers = listTeachers();
  return NextResponse.json({ students, teachers });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const id = createStudent(body, body.assignments ?? []);
  return NextResponse.json({ id });
}
