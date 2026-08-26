import { NextRequest } from "next/server";
import { findFormat } from "@/lib/youtube";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")?.trim() ?? "";
  const itag = Number(req.nextUrl.searchParams.get("itag"));

  if (!url || !itag) {
    return new Response("Missing params", { status: 400 });
  }

  try {
    const found = await findFormat(url, itag);
    if (!found) {
      return new Response("Format not found", { status: 404 });
    }
    const { info, fmt } = found;

    const title =
      info.video.title
        .replace(/[^\p{L}\p{N}\s\-_.()]/gu, "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 90) || "video";
    const ext = fmt.container;
    const ascii = title.replace(/[^\x20-\x7E]/g, "_").replace(/\s+/g, "_");

    const upstream = await fetch(fmt.url, { headers: { "User-Agent": UA } });
    if (!upstream.ok || !upstream.body) {
      return new Response("Upstream download failed", { status: 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${encodeURIComponent(`${title}.${ext}`)}`
    );
    headers.set("Cache-Control", "no-store, no-transform");
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);

    const body = Readable.fromWeb(upstream.body as never) as unknown as ReadableStream;
    return new Response(body, { headers });
  } catch {
    return new Response("Download failed", { status: 500 });
  }
}
