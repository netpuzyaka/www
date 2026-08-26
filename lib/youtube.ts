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

type WebAuthor = {
  name?: string;
  subscriber_count?: number;
  verified?: boolean;
  thumbnails?: { url?: string; width?: number }[];
} | null;

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

type RawFormat = {
  itag?: number;
  url?: string;
  mimeType?: string;
  qualityLabel?: string;
  height?: number;
  fps?: number;
  audioBitrate?: number;
  bitrate?: number;
};

export async function getVideoInfo(input: string): Promise<VideoInfo> {
  const videoId = extractVideoId(input);
  if (!videoId) throw new YoutubeApiError("Не удалось распознать ссылку на видео YouTube.");

  const page = await fetchWatchPage(videoId);
  const key = page.key;

  const androidText = await postJson(
    `https://www.youtube.com/youtubei/v1/player?key=${key}`,
    { context: { client: ANDROID_CLIENT }, videoId },
    20000
  );
  const android = JSON.parse(androidText);
  const status = android.playabilityStatus;
  if (!status || status.status !== "OK") {
    const reason = status?.reason || "";
    let msg = "Видео недоступно для скачивания.";
    if (/login/i.test(reason)) msg = "Видео требует входа или имеет возрастные ограничения.";
    if (/age/i.test(reason)) msg = "Видео имеет возрастные ограничения.";
    if (/private/i.test(reason)) msg = "Видео приватное.";
    if (/removed|deleted|unavailable|not found/i.test(reason)) msg = "Видео удалено или недоступно.";
    throw new YoutubeApiError(msg);
  }

  const vd = android.videoDetails;
  if (!vd) throw new YoutubeApiError("Не удалось получить информацию о видео.");
  if (vd.isLiveContent) throw new YoutubeApiError("Прямые трансляции нельзя скачать.");
  if (vd.isPrivate) throw new YoutubeApiError("Видео приватное.");

  const sd = android.streamingData;
  const all = (sd ? [...(sd.formats || []), ...(sd.adaptiveFormats || [])] : []) as RawFormat[];
  const playable = all.filter((f) => f.url && f.mimeType);

  const seenVideo = new Set<string>();
  const videoFormats: VideoFormat[] = [];
  for (const f of playable) {
    if (!f.height || !f.mimeType!.startsWith("video/")) continue;
    const fps = f.fps || 30;
    const vkey = `${f.height}-${fps}`;
    if (seenVideo.has(vkey)) continue;
    seenVideo.add(vkey);
    videoFormats.push({
      itag: f.itag!,
      quality: f.qualityLabel || `${f.height}p`,
      height: f.height,
      fps,
      container: containerOf(f.mimeType!, false),
      url: f.url!,
    });
  }
  videoFormats.sort((a, b) => b.height - a.height || b.fps - a.fps);

  const seenAudio = new Set<number>();
  const audioFormats: AudioFormat[] = [];
  for (const f of playable) {
    if (!f.mimeType!.startsWith("audio/")) continue;
    const bitrate = f.audioBitrate || f.bitrate || 0;
    if (!bitrate) continue;
    if (seenAudio.has(bitrate)) continue;
    seenAudio.add(bitrate);
    audioFormats.push({
      itag: f.itag!,
      bitrate: Math.round(bitrate / 1000),
      container: containerOf(f.mimeType!, true),
      url: f.url!,
    });
  }
  audioFormats.sort((a, b) => b.bitrate - a.bitrate);
  audioFormats.splice(4);

  const channelId = vd.channelId;
  let channelName: string | null = null;
  let subscribers: number | null = null;
  let avatar: string | null = null;
  let channelUrl: string | null = null;
  let verified = false;
  let likes: number | null = null;

  const jobs: Promise<void>[] = [];

  if (channelId) {
    const webClient = { clientName: "WEB", clientVersion: page.webVer, hl: "en", gl: "US" };
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
            channelName = vm.title?.dynamicTextViewModel?.text?.content || null;
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
      try {
        const nextText = await postJson(
          `https://www.youtube.com/youtubei/v1/next?key=${key}`,
          { context: { client: IOS_CLIENT }, videoId },
          20000
        );
        const m = nextText.match(/(\d[\d.,\s\u00A0]*\d)\s*other people/);
        if (m) likes = Number(m[1].replace(/[.,\s\u00A0]/g, ""));
      } catch {
        /* ignore */
      }
    })()
  );

  await Promise.allSettled(jobs);

  const wa = page.webAuthor;
  if (!channelName) {
    if (wa && typeof wa.name === "string") channelName = wa.name;
    else if (typeof vd.author === "string") channelName = vd.author;
    else channelName = "Канал";
  }
  if (subscribers == null && wa && typeof wa.subscriber_count === "number") subscribers = wa.subscriber_count;
  if (!avatar && wa?.thumbnails?.length) {
    avatar = [...wa.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0))[0].url || null;
  }
  if (!verified && wa?.verified) verified = true;
  if (likes == null && page.webLikes != null) likes = page.webLikes;
  if (!channelUrl) channelUrl = channelId ? `https://www.youtube.com/channel/${channelId}` : null;

  const thumbs = vd.thumbnail?.thumbnails || [];
  const thumbnail = pickLast(thumbs);

  return {
    url: `https://www.youtube.com/watch?v=${videoId}`,
    video: {
      id: videoId,
      title: vd.title || "Без названия",
      duration: parseInt(vd.lengthSeconds || "0") || 0,
      views: parseInt(vd.viewCount || "0") || 0,
      likes,
      uploadDate: page.uploadDate,
      description: vd.shortDescription || "",
      thumbnail,
      category: page.category,
    },
    channel: {
      id: channelId || null,
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
