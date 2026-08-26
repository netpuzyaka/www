import { NextRequest, NextResponse } from "next/server";
import { getVideoInfo, YoutubeApiError } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!url) {
    return NextResponse.json({ error: "Укажите ссылку на видео." }, { status: 400 });
  }
  try {
    const info = await getVideoInfo(url);
    return NextResponse.json(info, { headers: { "Cache-Control": "no-store, no-transform" } });
  } catch (e) {
    const msg = e instanceof YoutubeApiError ? e.message : "Не удалось получить данные о видео. Проверьте ссылку.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
