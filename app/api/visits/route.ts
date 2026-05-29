import { NextResponse } from "next/server";
import { getVisits, incrementVisits } from "@/lib/views";

export const dynamic = "force-dynamic";

export async function GET() {
  const visits = await getVisits();
  return NextResponse.json({ visits });
}

export async function POST() {
  await incrementVisits();
  return NextResponse.json({ ok: true });
}
