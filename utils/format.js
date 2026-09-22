// ฟังก์ชันช่วยจัดรูปแบบข้อความและสี ที่ใช้ร่วมกันทั้งบอท

const COLORS = {
  playing: 0xa855f7, // ม่วง: กำลังเล่น
  paused: 0xfee75c, // เหลือง: หยุดชั่วคราว
  info: 0x5865f2, // น้ำเงิน Discord: ข้อมูลทั่วไป
  success: 0x57f287, // เขียว: สำเร็จ
  error: 0xed4245, // แดง: ผิดพลาด
  ended: 0x4f545c, // เทา: เล่นจบแล้ว
};

const pad = (n) => String(n).padStart(2, "0");

// เวลาแบบนาฬิกา 0:00 / 1:02:03 (0 วินาทีก็แสดงได้)
function clock(totalSeconds) {
  const t = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// ความยาวเพลง (ถ้าไม่ทราบให้บอกว่าไม่ทราบ)
function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return "ไม่ทราบ";
  return clock(totalSeconds);
}

// แถบความคืบหน้า เช่น `1:05` ▬▬▬🔘▬▬▬▬▬▬▬ `3:45`
function progressBar(elapsedSec, totalSec, size = 14) {
  const cur = clock(elapsedSec);
  if (!totalSec || totalSec <= 0) return `\`${cur}\` ▶️ ไม่ทราบความยาว`;
  const ratio = Math.min(Math.max(elapsedSec / totalSec, 0), 1);
  const pos = Math.min(size - 1, Math.floor(ratio * size));
  const bar = "▬".repeat(pos) + "🔘" + "▬".repeat(size - 1 - pos);
  return `\`${cur}\` ${bar} \`${clock(totalSec)}\``;
}

function truncate(text, max) {
  const s = String(text ?? "");
  return s.length > max ? s.slice(0, Math.max(0, max - 1)) + "…" : s;
}

function loopLabel(mode) {
  return mode === "song" ? "🔂 เพลงเดียว" : mode === "queue" ? "🔁 ทั้งคิว" : "ปิด";
}

function sumDuration(songs) {
  return songs.reduce((total, s) => total + (s.durationInSec || 0), 0);
}

// ป้องกันชื่อเพลงที่มีเครื่องหมายพิเศษทำให้ markdown เพี้ยน
function escapeMd(text) {
  return String(text ?? "").replace(/([\\*_~`|>\[\]])/g, "\\$1");
}

// คืน URL ที่ Discord ยอมรับ (ไม่งั้น null)
function safeUrl(u) {
  try {
    const x = new URL(String(u));
    return /^https?:$/.test(x.protocol) ? x.href : null;
  } catch {
    return null;
  }
}

// ลิงก์แบบ markdown ที่ปลอดภัย: [ชื่อเพลง](url)
function mdLink(title, url, max = 60) {
  const label = escapeMd(truncate(title, max));
  const href = safeUrl(url);
  return href ? `[${label}](${href.replace(/\)/g, "%29")})` : `**${label}**`;
}

module.exports = {
  COLORS,
  clock,
  formatDuration,
  progressBar,
  truncate,
  loopLabel,
  sumDuration,
  escapeMd,
  safeUrl,
  mdLink,
};
