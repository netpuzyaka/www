import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "NovaTube — Скачивание видео и статистика YouTube",
  description:
    "Скачивайте видео с YouTube в оригинальном качестве без водяных знаков и отслеживайте статистику любимых роликов: просмотры, лайки, подписчики.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={inter.variable}>
      <body className="h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
