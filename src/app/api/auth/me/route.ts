import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getTeacherDefaultCampus,
  updateTeacherDefaultCampus,
} from "@/lib/teachers";

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({
    user,
    defaultCampus: getTeacherDefaultCampus(user.id),
  });
}

export async function PATCH(request: Request) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { defaultCampus?: string };
  if (body.defaultCampus === undefined) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  updateTeacherDefaultCampus(user.id, body.defaultCampus);
  return NextResponse.json({
    defaultCampus: getTeacherDefaultCampus(user.id),
  });
}
