"use client";

import { useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import TiltCard from "./TiltCard";
import {
  IconBar,
  IconEye,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconThumbs,
  IconTrash,
  IconUsers,
  IconX,
} from "./icons";
import { fmtCompact, fmtTime } from "@/lib/format";
import type { TrackedItem } from "@/lib/types";

type Props = {
  items: TrackedItem[];
  setItems: Dispatch<SetStateAction<TrackedItem[]>>;
};

function Delta({ v }: { v: number | null }) {
  if (v == null) return <span className="text-[10px] text-white/30">нет данных</span>;
  const cls =
    v > 0
      ? "text-emerald-300 bg-emerald-400/10 border-emerald-400/20"
      : v < 0
      ? "text-rose-300 bg-rose-400/10 border-rose-400/20"
      : "text-white/30 bg-white/5 border-white/10";
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {v > 0 ? "+" : ""}
      {fmtCompact(v)}
    </span>
  );
}

function Sparkline({ id, points }: { id: string; points: number[] }) {
  if (points.length < 2) return <div className="h-9 rounded-lg bg-white/[.03]" />;
  const w = 100;
  const h = 32;
  const pad = 3;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = pad + (h - pad * 2) * (1 - (p - min) / range);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const gid = `sg-${id}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-9 w-full">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke="#c4b5fd" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StatRow({
  icon,
  label,
  value,
  delta,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  delta: number | null;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-violet-300/70">{icon}</span>
      <span className="w-20 shrink-0 text-white/40">{label}</span>
      <span className="flex-1 font-medium">{value}</span>
      <Delta v={delta} />
    </div>
  );
}

export default function Tracker({ items, setItems }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<string[]>([]);

  const add = async () => {
    const u = url.trim();
    if (!u) return;
    if (!/youtu\.?be|youtube/i.test(u)) {
      setError("Вставьте корректную ссылку на видео YouTube.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(u)}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Ошибка запроса");
      const item: TrackedItem = {
        id: json.video.id,
        url: json.url,
        title: json.video.title,
        thumbnail: json.video.thumbnail,
        channel: json.channel.name,
        addedAt: Date.now(),
        history: [
          { at: Date.now(), views: json.video.views, likes: json.video.likes, subs: json.channel.subscribers },
        ],
      };
      setItems((prev) => (prev.some((t) => t.id === item.id) ? prev : [item, ...prev]));
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось добавить видео.");
    } finally {
      setLoading(false);
    }
  };

  const refresh = async (item: TrackedItem) => {
    setRefreshingIds((ids) => [...ids, item.id]);
    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(item.url)}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error();
      const snap = { at: Date.now(), views: json.video.views, likes: json.video.likes, subs: json.channel.subscribers };
      setItems((prev) =>
        prev.map((t) => {
          if (t.id !== item.id) return t;
          const last = t.history[t.history.length - 1];
          const same =
            last && last.views === snap.views && last.likes === snap.likes && last.subs === snap.subs;
          return same ? t : { ...t, history: [...t.history, snap] };
        })
      );
    } catch {
      setError(`Не удалось обновить: ${item.title.slice(0, 40)}…`);
    } finally {
      setRefreshingIds((ids) => ids.filter((id) => id !== item.id));
    }
  };

  const refreshAll = () => {
    void Promise.all(items.map(refresh));
  };

  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const refreshing = refreshingIds.length > 0;

  return (
    <div className="flex flex-col gap-5 md:h-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="glass glow-focus flex flex-1 items-center gap-2 rounded-2xl p-2 pl-4">
          <IconSearch className="h-4 w-4 shrink-0 text-white/35" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Добавьте видео для отслеживания статистики…"
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-white/30"
          />
          <button
            onClick={add}
            disabled={loading}
            className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 text-sm font-semibold text-white shadow-lg shadow-fuchsia-500/25 transition-all hover:brightness-110 active:scale-[.97] disabled:opacity-60"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <IconPlus className="h-4 w-4" />
            )}
            Добавить
          </button>
        </div>
        <button
          onClick={refreshAll}
          disabled={items.length === 0 || refreshing}
          className="glass flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-medium text-white/70 transition hover:text-white disabled:opacity-50"
        >
          <IconRefresh className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Обновить всё
        </button>
      </div>

      {error && (
        <div className="fade-up flex items-center justify-between gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 px-5 py-3.5 text-sm text-red-200">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 opacity-70 transition hover:opacity-100">
            <IconX className="h-4 w-4" />
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="glass fade-up flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl p-10 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500/20 to-cyan-400/20">
            <IconBar className="h-9 w-9 text-violet-300" />
          </div>
          <div>
            <div className="text-lg font-semibold">Пока нет отслеживаемых видео</div>
            <div className="mx-auto mt-1 max-w-xs text-sm text-white/40">
              Добавьте ссылку — будем сохранять историю просмотров, лайков и подписчиков канала.
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const last = item.history[item.history.length - 1];
              const prev = item.history[item.history.length - 2];
              const dViews = prev && last ? last.views - prev.views : null;
              const dLikes = prev && last && last.likes != null && prev.likes != null ? last.likes - prev.likes : null;
              const dSubs = prev && last && last.subs != null && prev.subs != null ? last.subs - prev.subs : null;
              const isRefreshing = refreshingIds.includes(item.id);
              const count = item.history.length;
              const plural = count === 1 ? "замер" : count < 5 ? "замера" : "замеров";

              return (
                <TiltCard key={item.id} className="glass fade-up overflow-hidden rounded-3xl">
                  <div className="flex h-full flex-col">
                    <div className="relative shrink-0">
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" className="h-32 w-full object-cover" />
                      ) : (
                        <div className="h-32 w-full bg-white/5" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c18] to-transparent" />
                      <button
                        onClick={() => refresh(item)}
                        disabled={isRefreshing}
                        className="glass absolute right-11 top-3 rounded-lg p-1.5 text-white/50 transition hover:text-white disabled:opacity-50"
                        title="Обновить"
                      >
                        <IconRefresh className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        onClick={() => remove(item.id)}
                        className="glass absolute right-3 top-3 rounded-lg p-1.5 text-white/50 transition hover:text-rose-300"
                        title="Удалить"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                      <div className="absolute bottom-2 left-3 flex items-center gap-1.5 text-[11px] font-medium text-white/60">
                        <IconUsers className="h-3 w-3" />
                        {item.channel}
                      </div>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{item.title}</h3>
                      <div className="space-y-1.5">
                        <StatRow icon={<IconEye className="h-3.5 w-3.5" />} label="Просмотры" value={fmtCompact(last.views)} delta={dViews} />
                        <StatRow
                          icon={<IconThumbs className="h-3.5 w-3.5" />}
                          label="Лайки"
                          value={last.likes != null ? fmtCompact(last.likes) : "—"}
                          delta={dLikes}
                        />
                        <StatRow
                          icon={<IconUsers className="h-3.5 w-3.5" />}
                          label="Подписчики"
                          value={last.subs != null ? fmtCompact(last.subs) : "—"}
                          delta={dSubs}
                        />
                      </div>
                      <div className="mt-auto">
                        <Sparkline id={item.id} points={item.history.map((h) => h.views)} />
                        <div className="mt-1.5 flex justify-between text-[10px] text-white/30">
                          <span>
                            {count} {plural} · обновлено в {fmtTime(last.at)}
                          </span>
                          <span className="text-violet-300/50">просмотры</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </TiltCard>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
