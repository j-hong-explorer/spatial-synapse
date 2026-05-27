import { NextResponse } from "next/server";
import { getAllViews, incrementView } from "@/lib/views";

// Always run on the server, never cached, so the counter stays live.
export const dynamic = "force-dynamic";

export async function GET() {
  const views = await getAllViews();
  return NextResponse.json(views);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { slug?: string };
    const slug = body?.slug;
    // Slug allow-list — only basic url-safe chars
    if (typeof slug === "string" && /^[a-z0-9-]+$/i.test(slug) && slug.length <= 80) {
      await incrementView(slug);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "invalid slug" }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
}
