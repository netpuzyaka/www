"use client";

import { useEffect, useState } from "react";
import Downloader from "@/components/Downloader";
import ParticleField from "@/components/ParticleField";
import Tracker from "@/components/Tracker";
import { IconBar, IconDownload } from "@/components/icons";
import type { TrackedItem, VideoInfo } from "@/lib/types";

const STORAGE_KEY = "novatube-tracked";

export default function Home() {
  const [tab, setTab] = useState<"download" | "track">("download");
  const [tracked, setTracked] = useState<TrackedItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTracked(JSON.parse(raw) as TrackedItem[]);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tracked));
  }, [tracked, ready]);

  const addToTrack = (info: VideoInfo) => {
    setTracked((prev) => {
      if (prev.some((t) => t.id === info.video.id)) return prev;
      const item: TrackedItem = {
        id: info.video.id,
        url: info.url,
        title: info.video.title,
        thumbnail: info.video.thumbnail,
        channel: info.channel.name,
        addedAt: Date.now(),
        history: [
          { at: Date.now(), views: info.video.views, likes: info.video.likes, subs: info.channel.subscribers },
        ],
      };
      return [item, ...prev];
    });
    setTab("track");
  };

  const tabBtn = (active: boolean) =>
    `flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
      active
        ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/25"
        : "text-white/50 hover:text-white"
    }`;

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="orb -left-24 -top-24 h-[420px] w-[420px]"
          style={{ "--orb-color": "rgba(124,58,237,.55)" } as React.CSSProperties}
        />
        <div
          className="orb -right-28 top-1/3 h-[380px] w-[380px]"
          style={{ "--orb-color": "rgba(34,211,238,.4)" } as React.CSSProperties}
        />
        <div
          className="orb -bottom-32 left-1/3 h-[340px] w-[340px]"
          style={{ "--orb-color": "rgba(217,70,239,.38)" } as React.CSSProperties}
        />
        <div className="floor-grid" />
      </div>
      <ParticleField />

      <header className="relative z-10 flex items-center justify-between gap-4 px-6 pt-5">
        <div className="flex items-center gap-3">
          <div className="cube">
            <span className="face f1" />
            <span className="face f2" />
            <span className="face f3" />
            <span className="face f4" />
            <span className="face f5" />
            <span className="face f6" />
          </div>
          <div>
            <div className="text-lg font-bold leading-tight tracking-tight">
              <span className="text-gradient">Nova</span>Tube
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Скачивание · Статистика</div>
          </div>
        </div>

        <nav className="glass flex items-center gap-1 rounded-full p-1">
          <button onClick={() => setTab("download")} className={tabBtn(tab === "download")}>
            <IconDownload className="h-4 w-4" />
            Скачать
          </button>
          <button onClick={() => setTab("track")} className={tabBtn(tab === "track")}>
            <IconBar className="h-4 w-4" />
            Статистика
          </button>
        </nav>

        <div className="glass hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs text-white/60 md:flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          4K · без водяных знаков
        </div>
      </header>

      <section className="relative z-10 min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4 md:overflow-hidden">
        {tab === "download" ? (
          <Downloader onTrack={addToTrack} trackedIds={tracked.map((t) => t.id)} />
        ) : (
          <Tracker items={tracked} setItems={setTracked} />
        )}
      </section>

      <footer className="relative z-10 pb-3 text-center text-[11px] text-white/25">
        Видео скачиваются в оригинальном качестве без перекодирования · Используйте только для личных целей
      </footer>
    </main>
  );
}
