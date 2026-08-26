import { Innertube } from "youtubei.js";
import youtubedl from "youtube-dl-exec";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AudioFormat, VideoFormat, VideoInfo } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FALLBACK_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

const ANDROID_CLIENT = {
  clientName: "ANDROID",
  clientVersion: "20.10.38",
  androidSdkVersion: 35,
  hl: "en",
  gl: "US",
};

const IOS_CLIENT = {
  clientName: "IOS",
  clientVersion: "20.10.4",
  hl: "en",
  gl: "US",
  deviceMake: "Apple",
  deviceModel: "iPhone16,2",
  osName: "iPhone",
  osVersion: "18.1.0",
};

const EMBEDDED_CLIENT = {
  clientName: "WEB_EMBEDDED_PLAYER",
  clientVersion: "1.20240925.00.00",
  hl: "en",
  gl: "US",
};

const TV_CLIENT = {
  clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
  clientVersion: "2.0",
  hl: "en",
  gl: "US",
};

type WebAuthor = {
  name?: string;
  subscriber_count?: number;
  verified?: boolean;
  thumbnails?: { url?: string; width?: number }[];
} | null;

type StrategyFormat = {
  itag: number;
  url: string;
  mimeType: string;
  qualityLabel?: string;
  height?: number;
  fps?: number;
  audioBitrate?: number;
  bitrate?: number;
};

type StrategyResult = {
  formats: StrategyFormat[];
  basic: {
    title: string;
    views: number;
    duration: number;
    description: string;
    thumbnail: string | null;
    channelId: string | null;
    authorName: string | null;
    isLive: boolean;
    isPrivate: boolean;
    channelName?: string | null;
    subscribers?: number | null;
    channelUrl?: string | null;
    verified?: boolean;
    uploadDate?: string | null;
  };
  likeCount: number | null;
};

type Diag = { name: string; detail: string };

export class YoutubeApiError extends Error {}

export function extractVideoId(input: string): string | null {
  const s = input.trim();
  const m = s.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/i
  );
  if (m) return m[1];
  if (/^[\w-]{11}$/.test(s)) return s;
  return null;
}

async function fetchText(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function postJson(url: string, body: unknown, timeoutMs = 15000): Promise<string> {
  return fetchText(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify(body),
    },
    timeoutMs
  );
}

function cutAfterJson(s: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

async function fetchWatchPage(videoId: string) {
  const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  const key = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || FALLBACK_API_KEY;
  const webVer = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] || "2.20260824.10.00";
  const uploadDate = html.match(/"uploadDate"\s*:\s*"([^"]+)"/)?.[1] || null;

  let webAuthor: WebAuthor = null;
  let webLikes: number | null = null;
  let category: string | null = null;
  const idx = html.indexOf("ytInitialPlayerResponse");
  if (idx !== -1) {
    const braceIdx = html.indexOf("{", idx);
    const jsonStr = cutAfterJson(html, braceIdx);
    if (jsonStr) {
      try {
        const pr = JSON.parse(jsonStr);
        const vd = pr.videoDetails;
        if (vd) {
          const a = vd.author;
          if (a && typeof a === "object") webAuthor = a;
          if (typeof vd.likes === "number") webLikes = vd.likes;
          if (typeof vd.category === "string") category = vd.category;
        }
      } catch {
        /* ignore */
      }
    }
  }
  return { key, webVer, uploadDate, webAuthor, webLikes, category };
}

function parseCompact(value: string, unit: string): number {
  const n = parseFloat(value.replace(/,/g, ""));
  const mult = unit === "B" ? 1e9 : unit === "M" ? 1e6 : 1e3;
  return Math.round(n * mult);
}

function parseSubsText(s: string | undefined): number | null {  if (!s) return null;
  const m = s.match(/([\d.,]+)\s*([KMB])\s*subscribers/i) || s.match(/([\d.,]+)\s*([KMB])/i);
  if (!m) return null;
  return parseCompact(m[1], m[2].toUpperCase());
}

function pickLast<T extends { url?: string }>(arr: T[] | undefined): string | null {
  if (!arr || arr.length === 0) return null;
  return arr[arr.length - 1].url || null;
}

function containerOf(mimeType: string, isAudio: boolean): string {
  const m = mimeType.split(";")[0].split("/")[1] || "mp4";
  if (m === "webm") return "webm";
  if (m === "mp4") return isAudio ? "m4a" : "mp4";
  return m;
}

function rawFormatsOf(sd: unknown): StrategyFormat[] {
  const stream = sd as { formats?: unknown[]; adaptiveFormats?: unknown[] } | undefined;
  const all = stream ? [...(stream.formats || []), ...(stream.adaptiveFormats || [])] : [];
  const out: StrategyFormat[] = [];
  for (const f of all) {
    const raw = f as {
      itag?: number;
      url?: string;
      mimeType?: string;
      qualityLabel?: string;
      height?: number;
      fps?: number;
      audioBitrate?: number;
      bitrate?: number;
    };
    if (!raw.url || !raw.itag || !raw.mimeType) continue;
    out.push({
      itag: raw.itag,
      url: raw.url,
      mimeType: raw.mimeType,
      qualityLabel: raw.qualityLabel,
      height: raw.height,
      fps: raw.fps,
      audioBitrate: raw.audioBitrate,
      bitrate: raw.bitrate,
    });
  }
  return out;
}

async function rawStrategy(
  name: string,
  videoId: string,
  key: string,
  client: Record<string, unknown>,
  extra: Record<string, unknown>
): Promise<StrategyResult | null> {
  let text: string;
  try {
    text = await postJson(
      `https://www.youtube.com/youtubei/v1/player?key=${key}`,
      { context: { client }, videoId, contentCheckOk: true, racyCheckOk: true, ...extra },
      20000
    );
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "network error");
  }
  const json = JSON.parse(text);
  const status = json.playabilityStatus?.status;
  if (status !== "OK") {
    const reason = json.playabilityStatus?.reason || "";
    throw new Error(`${status}${reason ? `: ${reason}` : ""}`);
  }
  const vd = json.videoDetails;
  if (!vd) throw new Error("no video details");
  const formats = rawFormatsOf(json.streamingData);
  return {
    formats,
    basic: {
      title: vd.title || "Без названия",
      views: parseInt(vd.viewCount || "0") || 0,
      duration: parseInt(vd.lengthSeconds || "0") || 0,
      description: vd.shortDescription || "",
      thumbnail: pickLast(vd.thumbnail?.thumbnails),
      channelId: vd.channelId || null,
      authorName: typeof vd.author === "string" ? vd.author : null,
      isLive: Boolean(vd.isLiveContent),
      isPrivate: Boolean(vd.isPrivate),
    },
    likeCount: null,
  };
}

let innertubePromise: Promise<Innertube> | null = null;

function getInnertube(): Promise<Innertube> {
  if (!innertubePromise) {
    innertubePromise = Innertube.create({
      lang: "en",
      location: "US",
      retrieve_player: true,
    }).catch((e) => {
      innertubePromise = null;
      throw e;
    });
  }
  return innertubePromise;
}

async function yiStrategy(
  yt: Innertube,
  client: "ANDROID" | "IOS" | "WEB",
  videoId: string
): Promise<StrategyResult | null> {
  const info = await yt.getInfo(videoId, client === "WEB" ? undefined : { client });
  const ps = info.playability_status as { status?: string; reason?: string } | undefined;
  if (!ps || ps.status !== "OK") {
    throw new Error(`${ps?.status || "unknown"}${ps?.reason ? `: ${ps.reason}` : ""}`);
  }
  const sd = info.streaming_data as unknown as {
    formats?: unknown[];
    adaptive_formats?: unknown[];
  };
  const all = sd ? [...(sd.formats || []), ...(sd.adaptive_formats || [])] : [];

  const formats: StrategyFormat[] = [];
  for (const f of all) {
    const raw = f as {
      itag?: number;
      url?: string;
      signature_cipher?: string;
      cipher?: string;
      mime_type?: string;
      quality_label?: string;
      height?: number;
      fps?: number;
      audio_bitrate?: number;
      bitrate?: number;
    };
    if (!raw.itag || !raw.mime_type) continue;
    let url: string | undefined = raw.url;
    if (!url && (raw.signature_cipher || raw.cipher) && yt.session.player) {
      try {
        url = await yt.session.player.decipher(raw.url, raw.signature_cipher, raw.cipher);
      } catch {
        /* ignore */
      }
    }
    if (!url) continue;
    formats.push({
      itag: raw.itag,
      url,
      mimeType: raw.mime_type,
      qualityLabel: raw.quality_label,
      height: raw.height,
      fps: raw.fps,
      audioBitrate: raw.audio_bitrate,
      bitrate: raw.bitrate,
    });
  }

  const b = info.basic_info as unknown as {
    title?: string;
    view_count?: number;
    duration?: number;
    short_description?: string;
    thumbnail?: { url?: string }[];
    channel_id?: string;
    like_count?: number;
    author?: unknown;
    is_live?: boolean;
    is_private?: boolean;
  };
  const a = b.author as { name?: string } | string | undefined;
  return {
    formats,
    basic: {
      title: b.title || "Без названия",
      views: b.view_count || 0,
      duration: b.duration || 0,
      description: b.short_description || "",
      thumbnail: pickLast(b.thumbnail),
      channelId: b.channel_id || null,
      authorName: typeof a === "string" ? a : a?.name || null,
      isLive: Boolean(b.is_live),
      isPrivate: Boolean(b.is_private),
    },
    likeCount: typeof b.like_count === "number" ? b.like_count : null,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function yyyymmddToIso(s: string | undefined | null): string | null {
  if (!s || s.length !== 8) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

async function tryYtDlp(input: string): Promise<{ result: StrategyResult | null; diag: Diag | null }> {
  try {
    const binName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
    const binPath = join(process.cwd(), "node_modules", "youtube-dl-exec", "bin", binName);
    if (!existsSync(binPath)) {
      return { result: null, diag: { name: "YT-DLP", detail: `binary missing at ${binPath}` } };
    }
    const raw = (await withTimeout(
      youtubedl(input, { dumpSingleJson: true, noWarnings: true, noPlaylist: true }),
      55000
    )) as {
      id?: string;
      title?: string;
      view_count?: number;
      like_count?: number;
      duration?: number;
      description?: string;
      thumbnail?: string;
      channel_id?: string;
      channel?: string;
      uploader?: string;
      channel_url?: string;
      channel_follower_count?: number;
      channel_is_verified?: boolean;
      is_live?: boolean;
      live_status?: string;
      upload_date?: string;
      formats?: {
        format_id?: string;
        url?: string;
        ext?: string;
        resolution?: string;
        height?: number;
        fps?: number;
        vcodec?: string;
        acodec?: string;
        abr?: number;
        tbr?: number;
      }[];
    };
    if (!raw || !raw.id) return { result: null, diag: { name: "YT-DLP", detail: "no info returned" } };

    const formats: StrategyFormat[] = [];
    for (const f of raw.formats || []) {
      if (!f.url || !f.format_id) continue;
      const ext = String(f.ext || "mp4").toLowerCase();
      const hasAudio = (f.acodec || "none") !== "none";
      const hasVideo = (f.vcodec || "none") !== "none";
      if (!hasAudio && !hasVideo) continue;
      if (hasAudio && hasVideo) continue;
      formats.push({
        itag: Number(f.format_id),
        url: f.url,
        mimeType: !hasVideo
          ? ext === "webm"
            ? "audio/webm"
            : ext === "m4a"
            ? "audio/mp4"
            : `audio/${ext}`
          : ext === "webm"
          ? "video/webm"
          : "video/mp4",
        qualityLabel: f.resolution || (f.height ? `${f.height}p` : undefined),
        height: f.height,
        fps: f.fps,
        audioBitrate: f.abr ? Math.round(f.abr * 1000) : f.tbr ? Math.round(f.tbr * 1000) : undefined,
      });
    }

    return {
      result: {
        formats,
        basic: {
          title: raw.title || "Без названия",
          views: raw.view_count || 0,
          duration: Math.round(raw.duration || 0),
          description: (raw.description || "").slice(0, 400),
          thumbnail: raw.thumbnail || null,
          channelId: raw.channel_id || null,
          authorName: raw.channel || raw.uploader || null,
          isLive: Boolean(raw.is_live) || raw.live_status === "is_live",
          isPrivate: false,
          channelName: raw.channel || raw.uploader || null,
          subscribers:
            typeof raw.channel_follower_count === "number" ? raw.channel_follower_count : null,
          channelUrl: raw.channel_url || null,
          verified: Boolean(raw.channel_is_verified),
          uploadDate: yyyymmddToIso(raw.upload_date),
        },
        likeCount: typeof raw.like_count === "number" ? raw.like_count : null,
      },
      diag: null,
    };
  } catch (e) {
    const err = e as { stderr?: string };
    const lines = [String(err.stderr || ""), e instanceof Error ? e.message : String(e)]
      .join("\n")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const firstLine = lines[0]?.slice(0, 140) || "failed";
    console.error("[novatube] yt-dlp failed:", firstLine);
    return { result: null, diag: { name: "YT-DLP", detail: firstLine } };
  }
}

async function fetchLikesFallback(videoId: string, key: string): Promise<number | null> {
  try {
    const text = await postJson(
      `https://www.youtube.com/youtubei/v1/next?key=${key}`,
      { context: { client: IOS_CLIENT }, videoId },
      20000
    );
    const m = text.match(/(\d[\d.,\s\u00A0]*\d)\s*other people/);
    if (m) return Number(m[1].replace(/[.,\s\u00A0]/g, ""));
    const ru = text.match(/понравилось\s*([\d\s\u00A0]+)\s*пользовател/i);
    if (ru) return Number(ru[1].replace(/[^\d]/g, ""));
  } catch {
    /* ignore */
  }
  return null;
}

export async function getVideoInfo(input: string): Promise<VideoInfo> {
  const videoId = extractVideoId(input);
  if (!videoId) throw new YoutubeApiError("Не удалось распознать ссылку на видео YouTube.");

  const [page, yt] = await Promise.all([
    fetchWatchPage(videoId).catch(() => null),
    getInnertube().catch(() => null),
  ]);
  const key = page?.key || FALLBACK_API_KEY;

  const diags: Diag[] = [];
  let result: StrategyResult | null = null;

  const dlp = await tryYtDlp(input);
  if (dlp.diag) diags.push(dlp.diag);
  result = dlp.result;

  if (!result) {
    const attempts: Array<[string, () => Promise<StrategyResult | null>]> = [
      ["ANDROID", () => rawStrategy("ANDROID", videoId, key, ANDROID_CLIENT, {})],
      ["IOS", () => rawStrategy("IOS", videoId, key, IOS_CLIENT, {})],
      ["YI-ANDROID", () => (yt ? yiStrategy(yt, "ANDROID", videoId) : Promise.resolve(null))],
      ["YI-IOS", () => (yt ? yiStrategy(yt, "IOS", videoId) : Promise.resolve(null))],
      ["YI-WEB", () => (yt ? yiStrategy(yt, "WEB", videoId) : Promise.resolve(null))],
      [
        "WEB_EMBEDDED",
        () =>
          rawStrategy("WEB_EMBEDDED", videoId, key, EMBEDDED_CLIENT, {
            thirdParty: { embedUrl: "https://www.youtube.com/" },
          }),
      ],
      ["TV", () => rawStrategy("TV", videoId, key, TV_CLIENT, { thirdParty: { embedUrl: "https://www.youtube.com/" } })],
    ];

    for (const [name, fn] of attempts) {
      try {
        const r = await fn();
        if (r && r.formats.length > 0) {
          result = r;
          break;
        }
        if (r) diags.push({ name, detail: "no playable formats" });
        else diags.push({ name, detail: "client unavailable" });
      } catch (e) {
        const detail = e instanceof Error ? e.message : "unknown error";
        diags.push({ name, detail });
      }
    }
  }

  if (!result) {
    console.error("[novatube] all player strategies failed:", JSON.stringify(diags));
    let msg = "Видео недоступно для скачивания.";
    const d = diags[0];
    if (d) {
      const det = d.detail.toLowerCase();
      if (/sign in|login|confirm.*bot|unusual traffic|captcha/i.test(det)) {
        msg = "YouTube запросил проверку на робота. Попробуйте позже или другое видео.";
      } else if (/age/i.test(det)) {
        msg = "Видео имеет возрастные ограничения.";
      } else if (/private/i.test(det)) {
        msg = "Видео приватное.";
      } else if (/removed|deleted|not found|unavailable/i.test(det)) {
        msg = "Видео удалено или недоступно.";
      } else {
        msg = "Видео недоступно для скачивания.";
      }
    }
    const tail = diags
      .slice(0, 3)
      .map((x) => `${x.name}: ${x.detail}`)
      .join(" | ")
      .slice(0, 200);
    if (tail) msg += ` [${tail}]`;
    throw new YoutubeApiError(msg);
  }

  if (result.basic.isLive) throw new YoutubeApiError("Прямые трансляции нельзя скачать.");
  if (result.basic.isPrivate) throw new YoutubeApiError("Видео приватное.");

  const channelId = result.basic.channelId;
  let channelName: string | null = result.basic.authorName || result.basic.channelName || null;
  let subscribers: number | null = result.basic.subscribers ?? null;
  let avatar: string | null = null;
  let channelUrl: string | null = result.basic.channelUrl || null;
  let verified = result.basic.verified || false;
  let likes = result.likeCount;
  const uploadDate = result.basic.uploadDate || page?.uploadDate || null;

  const jobs: Promise<void>[] = [];

  if (channelId) {
    const webClient = { clientName: "WEB", clientVersion: page?.webVer || "2.20260824.10.00", hl: "en", gl: "US" };
    jobs.push(
      (async () => {
        try {
          const browseText = await postJson(
            `https://www.youtube.com/youtubei/v1/browse?key=${key}`,
            { context: { client: webClient }, browseId: channelId },
            20000
          );
          const browse = JSON.parse(browseText);
          verified = /Official artist channel|Официальный канал|VERIFIED/i.test(browseText);
          const vm = browse?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
          if (vm) {
            if (!channelName) channelName = vm.title?.dynamicTextViewModel?.text?.content || null;
            const rows = vm.metadata?.contentMetadataViewModel?.metadataRows || [];
            for (const row of rows) {
              for (const part of row.metadataParts || []) {
                const txt = part.text?.content;
                if (!txt) continue;
                const m = txt.match(/([\d.,]+)\s*([KMB])\s*subscribers/i);
                if (m) subscribers = parseCompact(m[1], m[2]);
              }
            }
            avatar =
              pickLast(vm.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources) || null;
          }
          const mt = browse?.metadata?.channelMetadataRenderer;
          if (!channelName && mt?.title) channelName = mt.title;
          if (!avatar) avatar = pickLast(mt?.avatar?.thumbnails) || null;
          if (mt?.vanityChannelUrl) channelUrl = mt.vanityChannelUrl;
        } catch {
          /* ignore */
        }
      })()
    );
  }

  jobs.push(
    (async () => {
      if (likes == null) likes = await fetchLikesFallback(videoId, key);
      if (likes == null && page?.webLikes != null) likes = page.webLikes;
    })()
  );

  jobs.push(
    (async () => {
      if (yt && channelId && (!subscribers || !avatar || !channelName)) {
        try {
          const ch = await yt.getChannel(channelId);
          const md = ch.metadata as unknown as {
            title?: string;
            subscribers?: string;
            vanity_channel_url?: string;
            avatar?: { thumbnails?: { url?: string }[] };
          };
          const author = (ch.header as unknown as {
            author?: {
              name?: string;
              thumbnails?: { url?: string }[];
              is_verified?: boolean;
              is_verified_artist?: boolean;
              subscriber_count?: number;
            };
          })?.author;
          if (!channelName && md?.title) channelName = md.title;
          if (!channelName && author?.name) channelName = author.name;
          if (subscribers == null) {
            subscribers = parseSubsText(md?.subscribers);
            if (subscribers == null && typeof author?.subscriber_count === "number") {
              subscribers = author.subscriber_count;
            }
          }
          if (!avatar) {
            avatar = pickLast(md?.avatar?.thumbnails) || pickLast(author?.thumbnails) || null;
          }
          if (!channelUrl && md?.vanity_channel_url) channelUrl = md.vanity_channel_url;
          if (!verified && (author?.is_verified || author?.is_verified_artist)) verified = true;
        } catch {
          /* ignore */
        }
      }
    })()
  );

  await Promise.allSettled(jobs);

  const wa = page?.webAuthor;
  if (!channelName) {
    if (wa && typeof wa.name === "string") channelName = wa.name;
    else channelName = "Канал";
  }
  if (subscribers == null && wa && typeof wa.subscriber_count === "number") subscribers = wa.subscriber_count;
  if (!avatar && wa?.thumbnails?.length) {
    avatar = [...wa.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0))[0].url || null;
  }
  if (!verified && wa?.verified) verified = true;
  if (!channelUrl) channelUrl = channelId ? `https://www.youtube.com/channel/${channelId}` : null;

  const seenVideo = new Set<string>();
  const videoFormats: VideoFormat[] = [];
  for (const f of result.formats) {
    if (!f.height || !f.mimeType.startsWith("video/")) continue;
    const fps = f.fps || 30;
    const vkey = `${f.height}-${fps}`;
    if (seenVideo.has(vkey)) continue;
    seenVideo.add(vkey);
    videoFormats.push({
      itag: f.itag,
      quality: f.qualityLabel || `${f.height}p`,
      height: f.height,
      fps,
      container: containerOf(f.mimeType, false),
      url: f.url,
    });
  }
  videoFormats.sort((a, b) => b.height - a.height || b.fps - a.fps);

  const seenAudio = new Set<number>();
  const audioFormats: AudioFormat[] = [];
  for (const f of result.formats) {
    if (!f.mimeType.startsWith("audio/")) continue;
    const bitrate = f.audioBitrate || f.bitrate || 0;
    if (!bitrate) continue;
    const kbps = Math.round(bitrate / 1000);
    if (seenAudio.has(kbps)) continue;
    seenAudio.add(kbps);
    audioFormats.push({
      itag: f.itag,
      bitrate: kbps,
      container: containerOf(f.mimeType, true),
      url: f.url,
    });
  }
  audioFormats.sort((a, b) => b.bitrate - a.bitrate);
  audioFormats.splice(4);

  return {
    url: `https://www.youtube.com/watch?v=${videoId}`,
    video: {
      id: videoId,
      title: result.basic.title,
      duration: result.basic.duration,
      views: result.basic.views,
      likes,
      uploadDate,
      description: result.basic.description,
      thumbnail: result.basic.thumbnail,
      category: page?.category || null,
    },
    channel: {
      id: channelId,
      name: channelName || "Канал",
      verified,
      subscribers,
      avatar,
      url: channelUrl,
    },
    videoFormats,
    audioFormats,
  };
}

export async function findFormat(input: string, itag: number) {
  const info = await getVideoInfo(input);
  const fmt = [...info.videoFormats, ...info.audioFormats].find((f) => f.itag === itag);
  if (!fmt) return null;
  return { info, fmt };
}
