"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import TiltCard from "./TiltCard";
import {
  IconBadge,
  IconBar,
  IconCalendar,
  IconClock,
  IconDownload,
  IconExternal,
  IconEye,
  IconFilm,
  IconMusic,
  IconSearch,
  IconThumbs,
  IconUsers,
  IconX,
  IconZap,
} from "./icons";
import { fmtCompact, fmtDate, fmtDuration, fmtFull } from "@/lib/format";
import type { AudioFormat, VideoFormat, VideoInfo } from "@/lib/types";

type Props = { onTrack: (info: VideoInfo) => void; trackedIds: string[] };

type Selected = {
  kind: "video" | "audio";
  itag: number;
  label: string;
  container: string;
  url: string;
};

const chipCls = (act: boolean) =>
  `flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
    act
      ? "border-fuchsia-400/60 bg-fuchsia-500/15 text-white shadow-[0_0_18px_rgba(217,70,239,.28)]"
      : "border-white/10 bg-white/[.03] text-white/60 hover:border-white/25 hover:text-white"
  }`;

function Chip({ icon, value, label }: { icon: ReactNode; value: string; label?: string }) {
  return (
    <span className="glass flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs text-white/70">
      <span className="text-violet-300/80">{icon}</span>
      <span className="font-semibold">{value}</span>
      {label && <span className="text-white/40">{label}</span>}
    </span>
  );
}

export default function Downloader({ onTrack, trackedIds }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<VideoInfo | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  const analyze = async () => {
    const u = url.trim();
    if (!u) return;
    if (!/youtu\.?be|youtube/i.test(u)) {
      setError("Вставьте корректную ссылку на видео YouTube.");
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    setSelected(null);
    setProgress(null);
    setTotal(null);
    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(u)}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Ошибка запроса");
      setData(json as VideoInfo);
      const vf = json.videoFormats as VideoFormat[];
      setSelected(
        vf.length
          ? { kind: "video", itag: vf[0].itag, label: vf[0].quality, container: vf[0].container, url: vf[0].url }
          : null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось получить данные. Проверьте ссылку.");
    } finally {
      setLoading(false);
    }
  };

  const fileName = (sel: Selected) => {
    const t = (data?.video.title || "video")
      .replace(/[^\p{L}\p{N}\s\-_.]/gu, "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 90);
    return `${t} · ${sel.label}.${sel.container}`;
  };

  const download = async (direct: boolean) => {
    if (!data || !selected || busy) return;
    const name = fileName(selected);

    if (direct) {
      const a = document.createElement("a");
      a.href = selected.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    setBusy(true);
    setError(null);
    setProgress(0);
    setTotal(null);
    try {
      const res = await fetch(`/api/download?url=${encodeURIComponent(data.url)}&itag=${selected.itag}`);
      if (!res.ok || !res.body) throw new Error("bad");
      const len = Number(res.headers.get("Content-Length"));
      if (len > 0) setTotal(len);
      const reader = res.body.getReader();
      const chunks: BlobPart[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (len > 0) setProgress(Math.min(99.5, (received / len) * 100));
      }
      const blob = new Blob(chunks, { type: "application/octet-stream" });
      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(obj), 10000);
      setProgress(100);
    } catch {
      setError("Не удалось скачать через сервер. Попробуйте «Прямую ссылку» ниже.");
    } finally {
      setBusy(false);
    }
  };

  const already = data ? trackedIds.includes(data.video.id) : false;

  return (
    <div className="flex flex-col gap-5 md:h-full">
      <div className="glass glow-focus fade-up mx-auto flex w-full max-w-3xl items-center gap-2 rounded-2xl p-2 pl-5">
        <IconSearch className="h-5 w-5 shrink-0 text-white/35" />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && analyze()}
          placeholder="Вставьте ссылку на видео YouTube…"
          className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-white/30"
        />
        <button
          onClick={analyze}
          disabled={loading}
          className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/25 transition-all hover:brightness-110 hover:shadow-fuchsia-500/45 active:scale-[.97] disabled:opacity-60"
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <IconZap className="h-4 w-4" />
          )}
          {loading ? "Анализ…" : "Показать"}
        </button>
      </div>

      {error && (
        <div className="fade-up mx-auto flex w-full max-w-3xl items-center justify-between gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 px-5 py-3.5 text-sm text-red-200">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 opacity-70 transition hover:opacity-100">
            <IconX className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 md:grid-cols-12">
          <div className="glass skeleton rounded-3xl md:col-span-7" />
          <div className="flex flex-col gap-5 md:col-span-5">
            <div className="glass skeleton h-28 rounded-3xl" />
            <div className="glass skeleton flex-1 rounded-3xl" />
          </div>
        </div>
      )}

      {data && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 md:grid-cols-12">
          <TiltCard className="glass fade-up overflow-hidden rounded-3xl md:col-span-7">
            <div className="flex h-full flex-col">
              <div className="relative shrink-0">
                {data.video.thumbnail ? (
                  <img src={data.video.thumbnail} alt="" className="aspect-video w-full object-cover" />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-white/5">
                    <IconFilm className="h-10 w-10 text-white/20" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c18] via-transparent to-transparent" />
                <span className="absolute bottom-3 right-3 rounded-lg bg-black/70 px-2 py-1 text-xs font-medium backdrop-blur">
                  {fmtDuration(data.video.duration)}
                </span>
                {data.video.category && (
                  <span className="absolute left-3 top-3 rounded-lg bg-black/60 px-2 py-1 text-[11px] uppercase tracking-wider text-white/70 backdrop-blur">
                    {data.video.category}
                  </span>
                )}
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
                <h2 className="line-clamp-2 text-base font-semibold leading-snug">{data.video.title}</h2>
                <div className="flex flex-wrap gap-2">
                  <Chip icon={<IconEye className="h-3.5 w-3.5" />} value={fmtCompact(data.video.views)} label="просмотров" />
                  <Chip
                    icon={<IconThumbs className="h-3.5 w-3.5" />}
                    value={data.video.likes != null ? fmtCompact(data.video.likes) : "—"}
                    label="лайков"
                  />
                  <Chip icon={<IconCalendar className="h-3.5 w-3.5" />} value={fmtDate(data.video.uploadDate)} />
                  <Chip icon={<IconClock className="h-3.5 w-3.5" />} value={fmtDuration(data.video.duration)} />
                </div>
                <p className="line-clamp-3 text-xs leading-relaxed text-white/45">
                  {data.video.description || "Описание отсутствует."}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => onTrack(data)}
                    disabled={already}
                    className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3.5 text-xs font-medium text-white/75 transition hover:border-cyan-300/40 hover:text-white disabled:opacity-50"
                  >
                    <IconBar className="h-3.5 w-3.5 text-cyan-300" />
                    {already ? "Уже отслеживается" : "Отслеживать статистику"}
                  </button>
                  <a
                    href={data.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3.5 text-xs font-medium text-white/75 transition hover:border-white/30 hover:text-white"
                  >
                    <IconExternal className="h-3.5 w-3.5" />
                    YouTube
                  </a>
                </div>
              </div>
            </div>
          </TiltCard>

          <div className="flex min-h-0 flex-col gap-5 md:col-span-5">
            <TiltCard className="glass fade-up rounded-3xl">
              <div className="flex items-center gap-4 p-5">
                {data.channel.avatar ? (
                  <img src={data.channel.avatar} alt="" className="h-14 w-14 shrink-0 rounded-full border border-white/10 object-cover" />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <IconUsers className="h-6 w-6 text-white/25" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{data.channel.name}</span>
                    {data.channel.verified && <IconBadge className="h-4 w-4 shrink-0 text-cyan-300" />}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-white/50">
                    <IconUsers className="h-3.5 w-3.5" />
                    {data.channel.subscribers != null
                      ? `${fmtFull(data.channel.subscribers)} подписчиков`
                      : "Подписчики скрыты"}
                  </div>
                </div>
                <a
                  href={data.channel.url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/60 transition hover:text-white"
                >
                  <IconExternal className="h-4 w-4" />
                </a>
              </div>
            </TiltCard>

            <TiltCard className="glass fade-up min-h-0 flex-1 rounded-3xl">
              <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                    Видео · оригинальное качество
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.videoFormats.map((f: VideoFormat) => {
                      const act = selected?.kind === "video" && selected.itag === f.itag;
                      return (
                        <button
                          key={f.itag}
                          onClick={() =>
                            setSelected({ kind: "video", itag: f.itag, label: f.quality, container: f.container, url: f.url })
                          }
                          className={chipCls(act)}
                        >
                          {f.quality}
                          <span className={act ? "text-white/60" : "text-white/35"}>{f.container.toUpperCase()}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {data.audioFormats.length > 0 && (
                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                      Только аудио
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {data.audioFormats.map((f: AudioFormat) => {
                        const act = selected?.kind === "audio" && selected.itag === f.itag;
                        return (
                          <button
                            key={f.itag}
                            onClick={() =>
                              setSelected({
                                kind: "audio",
                                itag: f.itag,
                                label: `Аудио ${f.bitrate} kbps`,
                                container: f.container,
                                url: f.url,
                              })
                            }
                            className={chipCls(act)}
                          >
                            <IconMusic className="h-3.5 w-3.5" />
                            {f.bitrate} kbps
                            <span className={act ? "text-white/60" : "text-white/35"}>{f.container.toUpperCase()}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-auto flex flex-col gap-2.5 pt-2">
                  {progress !== null && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] text-white/45">
                        <span>{busy ? "Загрузка…" : "Готово"}</span>
                        <span>{total ? `${Math.round(progress)}%` : busy ? "поток" : "100%"}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-[width] duration-200 ${
                            total === null && busy ? "w-full animate-pulse" : ""
                          }`}
                          style={total ? { width: `${progress}%` } : undefined}
                        />
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => download(false)}
                    disabled={!selected || busy}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 bg-[length:200%_auto] bg-left text-sm font-bold text-white shadow-xl shadow-fuchsia-500/25 transition-all hover:bg-right hover:shadow-fuchsia-500/40 active:scale-[.98] disabled:opacity-50"
                  >
                    {busy ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <IconDownload className="h-4 w-4" />
                    )}
                    {busy ? "Загрузка…" : `Скачать · ${selected?.label || "—"}`}
                  </button>
                  <button
                    onClick={() => download(true)}
                    disabled={!selected || busy}
                    className="text-xs text-white/35 transition hover:text-white/70 disabled:opacity-40"
                  >
                    Файл обрезался или не скачался? Используйте прямую ссылку (рекомендуется для 4K)
                  </button>
                </div>
              </div>
            </TiltCard>
          </div>
        </div>
      )}

      {!data && !loading && (
        <div className="fade-up flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <div
            className="glass flex h-24 w-24 items-center justify-center rounded-[28px] shadow-[0_0_60px_rgba(139,92,246,.25)]"
            style={{ transform: "rotateX(14deg)" }}
          >
            <IconDownload className="text-gradient h-10 w-10" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Скачайте любое видео с <span className="text-gradient">YouTube</span>
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-white/45">
              Вставьте ссылку выше — покажем информацию о видео и канале, а затем предложим скачивание в оригинальном
              качестве без водяных знаков.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              { icon: <IconFilm className="h-4 w-4" />, t: "4K · оригинал", d: "Без перекодирования" },
              { icon: <IconZap className="h-4 w-4" />, t: "Без водяных знаков", d: "Чистый файл" },
              { icon: <IconBar className="h-4 w-4" />, t: "Статистика", d: "Канал и видео" },
            ].map((f) => (
              <div key={f.t} className="glass w-44 rounded-2xl p-4 text-left">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/25 to-cyan-400/25 text-violet-300">
                  {f.icon}
                </div>
                <div className="text-sm font-semibold">{f.t}</div>
                <div className="text-xs text-white/40">{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
