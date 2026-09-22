// คำแนะนำคำค้นตอนพิมพ์ใน /play (ใช้ระบบแนะนำคำค้นของ YouTube ตอบเร็วกว่าค้นเพลงจริงมาก)
// ถ้าดึงไม่ได้ก็แค่ไม่มีคำแนะนำ ไม่กระทบการเล่นเพลง
const https = require("https");

const TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 300;
const cache = new Map();

function fetchSuggestions(query) {
  return new Promise((resolve) => {
    const url =
      "https://suggestqueries.clients.google.com/complete/search?client=firefox&ds=yt&hl=th&ie=utf-8&oe=utf-8&q=" +
      encodeURIComponent(query);
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Charset": "utf-8" } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve([]);
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const list = (Array.isArray(data[1]) ? data[1] : [])
            .map((x) => (Array.isArray(x) ? x[0] : x))
            .filter((x) => typeof x === "string" && x && !/\uFFFD|Ã|Â|à¸/.test(x)); // ตัดข้อความที่ถอดรหัสเพี้ยน
          resolve(list.slice(0, 10));
        } catch {
          resolve([]);
        }
      });
      res.on("error", () => resolve([]));
    });
    req.setTimeout(1500, () => req.destroy());
    req.on("error", () => resolve([]));
  });
}

async function suggest(query) {
  const key = query.trim().toLowerCase();
  if (key.length < 2) return [];
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.list;

  const list = await fetchSuggestions(query.trim());
  if (list.length) {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), list });
  }
  return list;
}

module.exports = { suggest };
