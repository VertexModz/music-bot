// ตัวดึงเสียง/ค้นหาเพลง ใช้ yt-dlp (ดาวน์โหลดและอัปเดตให้เองอัตโนมัติ)
const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const BIN_DIR = path.join(ROOT, "bin");
const IS_WIN = process.platform === "win32";
const BIN = process.env.YTDLP_PATH || path.join(BIN_DIR, IS_WIN ? "yt-dlp.exe" : "yt-dlp");

const NODE_MAJOR = Number(process.versions.node.split(".")[0]);
let useJsRuntime = true;

// JS runtime ที่ yt-dlp ใช้แก้โจทย์ของ YouTube: โหลด QuickJS มาเองจะได้ไม่ต้องพึ่ง Node 22
const QJS = path.join(BIN_DIR, IS_WIN ? "qjs.exe" : "qjs");
function qjsAsset() {
  if (IS_WIN) return "qjs-windows-x86_64.exe";
  if (process.platform === "darwin") return process.arch === "arm64" ? "qjs-darwin" : "qjs-darwin-x86_64";
  return process.arch === "arm64" ? "qjs-linux-aarch64" : "qjs-linux-x86_64";
}

// ---------- ติดตั้ง / อัปเดต ----------
function assetName() {
  if (IS_WIN) return "yt-dlp.exe";
  if (process.platform === "darwin") return "yt-dlp_macos";
  return process.arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux";
}

function download(url, dest, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 6) return reject(new Error("redirect เยอะเกินไป"));
    https
      .get(url, { headers: { "User-Agent": "discord-music-bot" } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          return resolve(download(new URL(res.headers.location, url).toString(), dest, hops + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`ดาวน์โหลดไม่ได้ (HTTP ${res.statusCode})`));
        }
        const tmp = dest + ".tmp";
        const file = fs.createWriteStream(tmp);
        res.pipe(file);
        file.on("finish", () =>
          file.close(() => {
            try {
              fs.renameSync(tmp, dest);
              fs.chmodSync(dest, 0o755);
              resolve();
            } catch (e) {
              reject(e);
            }
          })
        );
        file.on("error", reject);
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function runRaw(args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const p = spawn(BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const t = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error("หมดเวลา"));
    }, timeout);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(t);
      code === 0 ? resolve(out) : reject(new Error(out.trim().split("\n").pop() || `exit ${code}`));
    });
  });
}

// อัปเดต yt-dlp เป็นรุ่น nightly (แก้ปัญหา YouTube ได้เร็วกว่ารุ่นปกติ)
let updatePromise = null;
function updateYtdlp() {
  if (!updatePromise) {
    updatePromise = (async () => {
      try {
        const out = await runRaw(["--update-to", "nightly"], 90000);
        console.log("[yt-dlp]", out.trim().split("\n").pop());
      } catch (e) {
        try {
          const out = await runRaw(["-U"], 60000);
          console.log("[yt-dlp]", out.trim().split("\n").pop());
        } catch (e2) {
          console.log("[yt-dlp] อัปเดตไม่สำเร็จ (ใช้รุ่นเดิมต่อ):", e2.message);
        }
      }
    })().finally(() => {
      updatePromise = null;
    });
  }
  return updatePromise;
}

let readyPromise = null;
function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      const firstRun = !fs.existsSync(BIN);
      if (firstRun) {
        fs.mkdirSync(BIN_DIR, { recursive: true });
        console.log("[yt-dlp] กำลังดาวน์โหลด (ครั้งแรกครั้งเดียว)...");
        await download(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName()}`, BIN);
      }
      if (!fs.existsSync(QJS)) {
        try {
          console.log("[yt-dlp] กำลังดาวน์โหลด JS runtime (QuickJS)...");
          await download(`https://github.com/quickjs-ng/quickjs/releases/latest/download/${qjsAsset()}`, QJS);
          await new Promise((res, rej) => {
            const t = spawn(QJS, ["-e", "1+1"], { stdio: "ignore" });
            t.on("error", rej);
            t.on("close", (c) => (c === 0 ? res() : rej(new Error("qjs exit " + c))));
          });
        } catch (e) {
          console.log("[yt-dlp] ใช้ QuickJS ไม่ได้:", e.message);
          try {
            fs.unlinkSync(QJS);
          } catch {}
        }
      }
      // ครั้งแรกต้องรอให้อัปเดตเสร็จ แต่รอบถัดไปให้อัปเดตเบื้องหลัง เพลงแรกจะได้ไม่ต้องรอ
      if (firstRun) await updateYtdlp();
      else updateYtdlp();
      // อัปเดตซ้ำทุก 12 ชั่วโมง เผื่อบอทเปิดค้างไว้นานๆ แล้ว YouTube เปลี่ยนระบบ
      const timer = setInterval(() => updateYtdlp(), 12 * 60 * 60 * 1000);
      if (timer.unref) timer.unref();
    })().catch((e) => {
      readyPromise = null;
      throw e;
    });
  }
  return readyPromise;
}

// ---------- cookies / อาร์กิวเมนต์พื้นฐาน ----------
function cookieFile() {
  const manual = process.env.YTDLP_COOKIES || path.join(ROOT, "cookies.txt");
  if (fs.existsSync(manual)) return manual;
  if (process.env.YOUTUBE_COOKIE) {
    // แปลง cookie แบบ "a=1; b=2" เป็นไฟล์ที่ yt-dlp อ่านได้
    const lines = ["# Netscape HTTP Cookie File"];
    for (const part of process.env.YOUTUBE_COOKIE.split(";")) {
      const i = part.indexOf("=");
      if (i < 1) continue;
      const name = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();
      lines.push(`.youtube.com\tTRUE\t/\tTRUE\t2147483647\t${name}\t${value}`);
    }
    const file = path.join(BIN_DIR, "cookies.generated.txt");
    fs.mkdirSync(BIN_DIR, { recursive: true });
    fs.writeFileSync(file, lines.join("\n") + "\n");
    return file;
  }
  return null;
}

function hasCookies() {
  return !!cookieFile();
}

function baseArgs(useCookies = true) {
  const a = ["--ignore-config", "--socket-timeout", "15", "--retries", "3"];
  if (useJsRuntime) {
    if (fs.existsSync(QJS)) a.push("--js-runtimes", `quickjs:${QJS}`);
    if (NODE_MAJOR >= 22) a.push("--js-runtimes", `node:${process.execPath}`);
  }
  try {
    const ff = require("ffmpeg-static");
    if (ff) a.push("--ffmpeg-location", ff);
  } catch {}
  const cookies = useCookies ? cookieFile() : null;
  if (cookies) a.push("--cookies", cookies);
  if (process.env.YTDLP_PROXY) a.push("--proxy", process.env.YTDLP_PROXY);
  return a;
}

// ---------- แปลง error เป็นภาษาคนอ่านง่าย ----------
function lastError(text) {
  const lines = String(text || "").trim().split("\n").filter(Boolean);
  const err = [...lines].reverse().find((l) => /ERROR/i.test(l));
  return (err || lines[lines.length - 1] || "").replace(/^ERROR:\s*/i, "").slice(0, 200);
}

// สรุป WARNING/ERROR ท้ายๆ ของ yt-dlp ไว้แสดงใน Console
function summary(text) {
  const lines = String(text || "")
    .split("\n")
    .filter((l) => /WARNING|ERROR/.test(l))
    .slice(-4)
    .map((l) => l.replace(/^(WARNING|ERROR):\s*/i, "").trim().slice(0, 170));
  return lines.join(" | ") || lastError(text);
}

function cleanTitle(t) {
  return String(t || "")
    .replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, " ")
    .replace(/\b(official|m\/v|mv|music video|lyric video|lyrics?|audio|hd|4k|visualizer)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function friendly(detail) {
  const t = String(detail || "");
  if (/private video/i.test(t)) return "วิดีโอเป็นส่วนตัว";
  if (/Sign in to confirm|not a bot/i.test(t)) return "YouTube บล็อกเซิร์ฟเวอร์นี้ (ต้องใส่ cookies)";
  if (/confirm your age|age.restricted|inappropriate/i.test(t)) return "วิดีโอจำกัดอายุ (ต้องใส่ cookies)";
  if (/page needs to be reloaded/i.test(t)) return "YouTube ปฏิเสธคำขอ (cookies อาจหมดอายุ หรือ IP ถูกบล็อก)";
  if (/429|Too Many Requests/i.test(t)) return "โดนจำกัดคำขอชั่วคราว ลองใหม่ภายหลัง";
  if (/not available in your country|blocked it in your country|geo/i.test(t)) return "วิดีโอเล่นในประเทศนี้ไม่ได้";
  if (/unavailable|removed|does not exist|no longer available|terminated/i.test(t)) return "วิดีโอถูกลบหรือใช้งานไม่ได้";
  if (/js runtime|javascript/i.test(t)) return "ต้องใช้ Node 22 ขึ้นไป";
  if (/ENOENT|EACCES|ENOEXEC/i.test(t)) return "ติดตั้ง yt-dlp ไม่สมบูรณ์";
  if (/หมดเวลา/.test(t)) return "โหลดนานเกินไป";
  return lastError(t) || "ไม่ทราบสาเหตุ";
}

function mkErr(message, detail) {
  const e = new Error(message);
  e.detail = detail || message;
  return e;
}

async function withCompat(fn) {
  try {
    return await fn();
  } catch (e) {
    if (useJsRuntime && /no such option|unrecognized arguments|js-runtimes/i.test(e.detail || e.message)) {
      useJsRuntime = false;
      return fn();
    }
    throw e;
  }
}

// ---------- อ่านข้อมูล (JSON) ----------
function runJson(target, extra = [], timeout = 40000) {
  return withCompat(async () => {
    await ensureReady();
    return new Promise((resolve, reject) => {
      const p = spawn(BIN, [...baseArgs(), ...extra, "-J", target], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      const t = setTimeout(() => {
        p.kill("SIGKILL");
        reject(mkErr("หมดเวลา", err));
      }, timeout);
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (err += d));
      p.on("error", (e) => {
        clearTimeout(t);
        reject(mkErr(e.message, err));
      });
      p.on("close", (code) => {
        clearTimeout(t);
        if (code !== 0) return reject(mkErr(lastError(err) || `exit ${code}`, err));
        try {
          resolve(JSON.parse(out));
        } catch {
          reject(mkErr("อ่านข้อมูลไม่ได้", err));
        }
      });
    });
  });
}

function toSong(e) {
  if (!e) return null;
  const url = e.webpage_url || e.url || (e.id && `https://www.youtube.com/watch?v=${e.id}`);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const thumbs = e.thumbnails || [];
  return {
    title: e.title || "ไม่ทราบชื่อเพลง",
    url,
    thumbnail: e.thumbnail || (thumbs.length ? thumbs[thumbs.length - 1].url : null) || null,
    durationInSec: Math.round(e.duration || 0),
    author: e.uploader || e.channel || e.artist || null,
  };
}

// เก็บผลค้นหา/ข้อมูลเพลงไว้ชั่วคราว ค้นซ้ำจะได้ทันที
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map();
function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value.map((song) => ({ ...song })); // ส่งสำเนากลับ กันเพลงซ้ำในคิวเป็นออบเจ็กต์เดียวกัน
}
function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value: value.map((song) => ({ ...song })) });
}

async function search(query, count = 1) {
  const key = `s:${count}:${query.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  let list = [];
  try {
    const r = await runJson(`ytsearch${count}:${query}`, ["--flat-playlist"]);
    list = (r.entries || []).map(toSong).filter(Boolean);
  } catch (e) {
    console.error("[ค้นหา] YouTube ไม่สำเร็จ:", friendly(e.detail || e.message));
  }
  if (!list.length) {
    // สำรอง: ค้นหาใน SoundCloud
    const r = await runJson(`scsearch${count}:${query}`, ["--flat-playlist"]);
    list = (r.entries || []).map(toSong).filter(Boolean);
  }
  if (list.length) cacheSet(key, list);
  return list;
}

async function getVideo(url) {
  const key = `v:${url}`;
  const cached = cacheGet(key);
  if (cached) return cached[0];

  const info = await runJson(url, ["--no-playlist", "--skip-download"]);
  const song = toSong(info);
  if (song) cacheSet(key, [song]);
  return song;
}

async function getPlaylist(url) {
  const info = await runJson(url, ["--flat-playlist", "--playlist-end", "100"], 60000);
  const songs = (info.entries || []).map(toSong).filter(Boolean);
  return { title: info.title || "เพลย์ลิสต์", songs };
}

// ---------- ดึงเสียงออกทาง stdout ----------
function startStream(target, extra = [], opts = {}) {
  return withCompat(async () => {
    await ensureReady();
    return new Promise((resolve, reject) => {
      const isSearch = /^[a-z]+search\d*:/i.test(target);
      const args = [
        ...baseArgs(opts.cookies !== false),
        ...(isSearch ? [] : ["--no-playlist"]),
        "-f",
        "bestaudio[acodec=opus]/bestaudio/best",
        ...extra,
        "-o",
        "-",
        target,
      ];
      const proc = spawn(BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
      let err = "";
      let done = false;

      const finish = (e) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        proc.stdout.removeListener("readable", onReadable);
        if (e) {
          proc.kill("SIGKILL");
          reject(mkErr(e.message, err || e.message));
        } else {
          resolve(proc);
        }
      };
      const onReadable = () => {
        if (proc.stdout.readableLength > 0) finish();
      };
      const timer = setTimeout(() => finish(new Error("หมดเวลา")), 25000);

      proc.stderr.on("data", (d) => {
        err += d;
        if (err.length > 6000) err = err.slice(-6000);
      });
      proc.stdout.on("readable", onReadable);
      proc.once("error", (e) => finish(e));
      proc.once("close", (code) => finish(new Error(lastError(err) || `yt-dlp จบการทำงานก่อนได้เสียง (${code})`)));
    });
  });
}

function isYouTube(url) {
  try {
    return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

// จำวิธีที่เคยใช้ได้ไว้ลองก่อนในครั้งต่อไป
let lastGood = null;

function buildPlans(yt) {
  const withCookies = hasCookies();
  const plans = [];
  if (yt) {
    if (withCookies) {
      plans.push({ client: null, cookies: true }, { client: "tv", cookies: true });
    }
    plans.push(
      { client: null, cookies: false },
      { client: "android_vr", cookies: false },
      { client: "mweb", cookies: false },
      { client: "tv", cookies: false }
    );
  } else {
    plans.push({ client: null, cookies: withCookies });
  }
  if (lastGood) {
    const i = plans.findIndex((p) => p.client === lastGood.client && p.cookies === lastGood.cookies);
    if (i > 0) plans.unshift(plans.splice(i, 1)[0]);
  }
  return plans;
}

function planName(p) {
  return `${p.client || "ค่าเริ่มต้น"}, ${p.cookies ? "ใช้ cookies" : "ไม่ใช้ cookies"}`;
}

// เปิดเสียงของเพลง: ลองหลายวิธีบน YouTube ถ้าไม่ได้ค่อยหาเพลงเดียวกันบน SoundCloud
async function openAudio(song, options = {}) {
  const yt = isYouTube(song.url);
  const errors = [];
  let hard = false;

  for (const plan of buildPlans(yt)) {
    try {
      const extra = plan.client ? ["--extractor-args", `youtube:player_client=${plan.client}`] : [];
      const proc = await startStream(song.url, extra, { cookies: plan.cookies });
      if (yt) lastGood = plan;
      return { proc, fallback: false, via: planName(plan) };
    } catch (e) {
      e.plan = planName(plan);
      errors.push(e);
      if (/private video|unavailable|removed|does not exist|terminated/i.test(e.detail || "")) {
        hard = true;
        break;
      }
    }
  }

  if (yt && !hard && !options.noFallback) {
    const queries = [...new Set([cleanTitle(song.title), song.title].filter(Boolean))];
    const ytErrors = errors.map((e) => `[${e.plan}] ${summary(e.detail || e.message)}`).join("\n");
    for (const q of queries) {
      try {
        const proc = await startStream(`scsearch1:${q}`, [], { cookies: false });
        return { proc, fallback: true, via: "SoundCloud", errors: ytErrors };
      } catch (e) {
        e.plan = "SoundCloud";
        errors.push(e);
      }
    }
  }

  const first = errors[0];
  const err = new Error(friendly(first && (first.detail || first.message)));
  err.reason = err.message;
  err.detail = errors.map((e) => `[${e.plan}] ${summary(e.detail || e.message)}`).join("\n");
  throw err;
}

// ตรวจระบบตอนบอทเริ่มทำงาน แล้วบอกผลใน Console
async function selfCheck() {
  try {
    await ensureReady();
    if (updatePromise) await updatePromise; // ตรวจระบบหลังอัปเดตเสร็จ จะได้เห็นเวอร์ชันล่าสุด
    const v = await runRaw(["--version"], 15000);
    const runtime = fs.existsSync(QJS) ? "QuickJS" : NODE_MAJOR >= 22 ? "Node" : "ไม่มี";
    console.log(`[ตรวจระบบ] yt-dlp ${v.trim()} | JS runtime: ${runtime} | cookies: ${hasCookies() ? "มี" : "ไม่มี"}`);
  } catch (e) {
    console.error("[ตรวจระบบ] ❌ yt-dlp ใช้งานไม่ได้:", e.message);
    return;
  }
  try {
    const audio = await openAudio(
      { title: "Me at the zoo", url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" },
      { noFallback: true }
    );
    audio.proc.kill("SIGKILL");
    console.log(`[ตรวจระบบ] ✅ YouTube ใช้ได้ (วิธี: ${audio.via})`);
  } catch (e) {
    console.error("[ตรวจระบบ] ❌ YouTube ใช้ไม่ได้:", e.reason || e.message);
    console.error(e.detail);
    console.error("[ตรวจระบบ] บอทจะเล่นจาก SoundCloud แทนอัตโนมัติ");
  }
}

module.exports = { ensureReady, openAudio, search, getVideo, getPlaylist, friendly, selfCheck };
