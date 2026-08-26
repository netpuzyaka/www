import { createWriteStream, existsSync, mkdirSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

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

await new Promise((resolve, reject) => {
  const req = https.get(
    url,
    { headers: { "User-Agent": "ensure-ytdlp" } },
    (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https
          .get(res.headers.location, { headers: { "User-Agent": "ensure-ytdlp" } }, (res2) => {
            pipeAndSave(res2, binaryPath, resolve, reject);
          })
          .on("error", reject);
        res.resume();
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      pipeAndSave(res, binaryPath, resolve, reject);
    }
  );
  req.on("error", reject);
});

function pipeAndSave(res, path, resolve, reject) {
  mkdirSync(dirname(path), { recursive: true });
  const file = createWriteStream(path, { mode: 0o755 });
  res.pipe(file);
  file.on("finish", () => {
    if (!isWin) {
      try {
        chmodSync(path, 0o755);
      } catch {
        /* ignore */
      }
    }
    console.log(`[ensure-ytdlp] saved to ${path}`);
    resolve();
  });
  file.on("error", reject);
  res.on("error", reject);
}
