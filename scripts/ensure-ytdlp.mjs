import { writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const binDir = join(__dirname, "..", "node_modules", "youtube-dl-exec", "bin");
const isWin = process.platform === "win32";
const binaryName = isWin ? "yt-dlp.exe" : "yt-dlp";
const binaryPath = join(binDir, binaryName);

if (existsSync(binaryPath)) {
  console.log(`[ensure-ytdlp] binary already present: ${binaryPath}`);
  process.exit(0);
}

const url = isWin
  ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
  : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

console.log(`[ensure-ytdlp] downloading ${url}`);

try {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "ensure-ytdlp/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(binaryPath), { recursive: true });
  writeFileSync(binaryPath, buf, { mode: 0o755 });
  if (!isWin) {
    try {
      chmodSync(binaryPath, 0o755);
    } catch {
      /* ignore */
    }
  }
  console.log(`[ensure-ytdlp] saved ${buf.length} bytes to ${binaryPath}`);
} catch (e) {
  console.warn(`[ensure-ytdlp] download failed: ${e instanceof Error ? e.message : e}`);
  console.warn("[ensure-ytdlp] continuing build; runtime will fall back to innertube clients");
  process.exit(0);
}
