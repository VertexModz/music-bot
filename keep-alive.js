// เว็บเซิร์ฟเวอร์เล็กๆ ไว้ให้ cron-job.org / UptimeRobot (หรือบริการ ping ฟรีอื่นๆ) เรียกเข้ามาเรื่อยๆ
// เพื่อไม่ให้ Render (free tier) สั่ง sleep โปรเจกต์เรา และเป็นหน้าดูสถานะบอทด้วย
const express = require("express");

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function keepAlive(getStatus = () => ({})) {
  const app = express();
  const startedAt = Date.now();

  app.get("/health", (req, res) => res.json({ ok: true, uptimeSec: Math.round((Date.now() - startedAt) / 1000) }));

  app.get("/", (req, res) => {
    const s = getStatus();
    const hours = ((Date.now() - startedAt) / 3600000).toFixed(1);
    const playing = (s.playing || []).length
      ? `🎶 ${(s.playing || []).map(escapeHtml).join("<br>🎶 ")}`
      : "ยังไม่มีเพลงเล่นอยู่";
    res.type("html").send(`<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>บอทเพลง</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111827;color:#e5e7eb;font-family:system-ui,sans-serif}
.card{background:#1f2937;border-radius:16px;padding:28px 32px;max-width:420px;box-shadow:0 8px 30px #0006}
h1{margin:0 0 8px;font-size:22px}.ok{color:#57f287}.muted{color:#9ca3af;font-size:14px;line-height:1.7}</style></head>
<body><div class="card"><h1>🎵 บอทเพลง Discord</h1><div class="ok">● ทำงานอยู่</div>
<p class="muted">บอท: ${escapeHtml(s.botName || "กำลังเชื่อมต่อ...")}<br>เซิร์ฟเวอร์: ${s.guilds ?? 0}<br>เปิดมาแล้ว: ${hours} ชั่วโมง</p>
<p>${playing}</p></div></body></html>`);
  });

  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, () => {
    console.log(`[keep-alive] เว็บเซิร์ฟเวอร์พร้อมรับ ping ที่พอร์ต ${port}`);
  });
  server.on("error", (e) => console.error("[keep-alive] เปิดเว็บเซิร์ฟเวอร์ไม่ได้:", e.message));
  return server;
}

module.exports = keepAlive;
