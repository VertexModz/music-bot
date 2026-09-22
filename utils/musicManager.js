// ตัวจัดการเพลง/คิว แยกตามเซิร์ฟเวอร์ (guild)
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior,
  StreamType,
} = require("@discordjs/voice");
const yt = require("./ytdlp");
const { COLORS, truncate, escapeMd } = require("./format");
const { note } = require("./reply");
const { buildNowPlayingEmbed, buildEndedEmbed, buildControls, elapsedSeconds, peekNext } = require("./nowPlaying");

const queues = new Map(); // guildId -> queueData

const IDLE_DISCONNECT_MS = 5 * 60 * 1000; // คิวว่าง 5 นาที -> ออกจากห้อง
const EMPTY_CHANNEL_DISCONNECT_MS = 60 * 1000; // ไม่มีคนในห้อง 1 นาที -> ออกจากห้อง
const MAX_FAIL_STREAK = 3; // เล่นไม่ได้ติดกันกี่เพลงถึงจะหยุดคิว
const MAX_QUEUE = 500; // จำนวนเพลงในคิวสูงสุดต่อเซิร์ฟเวอร์
const PROGRESS_INTERVAL_MS = 15 * 1000; // อัปเดตแถบเวลาบนการ์ดทุกกี่วินาที
const PREFETCH_ENABLED = process.env.PREFETCH !== "off"; // ตั้ง PREFETCH=off เพื่อปิดการโหลดเพลงถัดไปล่วงหน้า
const PREFETCH_LEAD_SEC = 20; // เริ่มโหลดเพลงถัดไปเมื่อเหลือเวลาเล่นอีกกี่วินาที
const PREFETCH_TTL_MS = 90 * 1000; // โหลดล่วงหน้าแล้วไม่ได้ใช้ภายในเวลานี้ให้ทิ้ง

let onChange = () => {};
function setOnChange(fn) {
  onChange = fn;
}
function notifyChange() {
  try {
    onChange();
  } catch {}
}

function getQueue(guildId) {
  return queues.get(guildId);
}

function send(queue, payload) {
  return queue.textChannel.send(payload).catch(() => null);
}

function sendNote(queue, text, color) {
  return send(queue, { embeds: [note(text, color)] });
}

// ---------- ตัวจับเวลา ----------
function clearIdle(queue) {
  if (queue.idleTimeout) clearTimeout(queue.idleTimeout);
  queue.idleTimeout = null;
}

function clearTimers(queue) {
  clearIdle(queue);
  if (queue.emptyTimeout) clearTimeout(queue.emptyTimeout);
  queue.emptyTimeout = null;
}

function humanCount(queue) {
  const ch = queue.guild.channels.cache.get(queue.voiceChannel.id) || queue.voiceChannel;
  return ch.members.filter((m) => !m.user.bot).size;
}

function scheduleIdleDisconnect(guildId) {
  const queue = getQueue(guildId);
  if (!queue || queue.stay247) return;
  clearIdle(queue);
  queue.idleTimeout = setTimeout(() => {
    const q = getQueue(guildId);
    if (q === queue && q.songs.length === 0 && !q.stay247) {
      sendNote(q, "😴 ไม่มีเพลงในคิวนานแล้ว ออกจากห้องเสียงนะ", COLORS.info);
      destroyQueue(guildId, "😴 ออกจากห้องแล้ว");
    }
  }, IDLE_DISCONNECT_MS);
}

function scheduleEmptyChannelDisconnect(guildId) {
  const queue = getQueue(guildId);
  if (!queue || queue.stay247) return;
  clearTimers(queue);
  queue.emptyTimeout = setTimeout(() => {
    const q = getQueue(guildId);
    if (q === queue && !q.stay247) {
      sendNote(q, "👋 ไม่มีคนในห้องเสียงแล้ว ออกจากห้องนะ", COLORS.info);
      destroyQueue(guildId, "👋 ออกจากห้องแล้ว");
    }
  }, EMPTY_CHANNEL_DISCONNECT_MS);
}

// ประเมินตัวจับเวลาใหม่ทั้งหมดตามสถานการณ์ตอนนี้ (มีคนอยู่ไหม / คิวว่างไหม / โหมด 24/7)
function refreshTimers(guildId) {
  const q = getQueue(guildId);
  if (!q) return;
  clearTimers(q);
  if (q.stay247) return;
  if (humanCount(q) === 0) return scheduleEmptyChannelDisconnect(guildId);
  if (!q.playing && q.songs.length === 0) scheduleIdleDisconnect(guildId);
}

// ---------- โปรเซสเสียง / โหลดล่วงหน้า ----------
function killAudio(audio) {
  try {
    audio && audio.proc && audio.proc.kill("SIGKILL");
  } catch {}
}

function discardAudio(promise) {
  promise.then(killAudio).catch(() => {});
}

function audioAlive(audio) {
  const p = audio && audio.proc;
  return !!p && p.exitCode === null && p.signalCode === null && !!p.stdout && !p.stdout.destroyed;
}

function killProc(queue) {
  if (queue.proc) {
    try {
      queue.proc.kill("SIGKILL");
    } catch {}
    queue.proc = null;
  }
}

function dropPrefetch(queue) {
  const pf = queue.prefetch;
  if (!pf) return;
  queue.prefetch = null;
  clearTimeout(pf.timer);
  discardAudio(pf.promise);
}

// เริ่มโหลดเสียงของเพลงถัดไปไว้ก่อน เพื่อให้ต่อเพลงได้ทันทีไม่มีช่วงเงียบรอโหลด
function startPrefetch(queue) {
  if (!PREFETCH_ENABLED || queue.destroyed || queue.prefetch) return;
  const next = peekNext(queue);
  if (!next || next === queue.songs[0]) return;
  const promise = yt.openAudio(next);
  promise.catch(() => {}); // ถ้าพัง ตอนถึงคิวเล่นจะรายงานสาเหตุเอง
  const pf = { song: next, promise, timer: null };
  pf.timer = setTimeout(() => {
    if (queue.prefetch === pf) dropPrefetch(queue);
  }, PREFETCH_TTL_MS);
  queue.prefetch = pf;
}

function schedulePrefetch(queue) {
  clearTimeout(queue.prefetchTimer);
  queue.prefetchTimer = null;
  const song = queue.songs[0];
  if (!PREFETCH_ENABLED || !song || !song.durationInSec) return;
  const delay = Math.max(0, song.durationInSec - PREFETCH_LEAD_SEC) * 1000;
  queue.prefetchTimer = setTimeout(() => startPrefetch(queue), delay);
}

// ถ้ามีเสียงที่โหลดล่วงหน้าไว้ตรงกับเพลงนี้ ให้ใช้เลย (ถ้าโปรเซสตายไปแล้วค่อยเปิดใหม่)
function takePrefetch(queue, song) {
  const pf = queue.prefetch;
  if (!pf) return null;
  queue.prefetch = null;
  clearTimeout(pf.timer);
  if (pf.song !== song) {
    discardAudio(pf.promise);
    return null;
  }
  return pf.promise.then((audio) => {
    if (audioAlive(audio)) return audio;
    killAudio(audio);
    return yt.openAudio(song);
  });
}

// ---------- การ์ดกำลังเล่น ----------
function stopProgress(queue) {
  if (queue.progressTimer) clearInterval(queue.progressTimer);
  queue.progressTimer = null;
}

// อัปเดตแถบเวลาบนการ์ดเป็นระยะ (ข้ามรอบถ้าหยุดชั่วคราว/กำลังโหลด)
function startProgress(queue) {
  stopProgress(queue);
  queue.progressTimer = setInterval(async () => {
    const msg = queue.nowPlayingMessage;
    if (queue.destroyed || !msg || !queue.songs.length) return stopProgress(queue);
    if (queue.editing || queue.player.state.status !== AudioPlayerStatus.Playing) return;
    queue.editing = true;
    try {
      await msg.edit({ embeds: [buildNowPlayingEmbed(queue)], components: buildControls(queue) });
    } catch {
      // ข้อความถูกลบหรือแก้ไม่ได้ เลิกอัปเดต
      stopProgress(queue);
      queue.nowPlayingMessage = null;
    } finally {
      queue.editing = false;
    }
  }, PROGRESS_INTERVAL_MS);
}

// ทำให้การ์ดเก่าเป็นแบบย่อ ไม่มีปุ่ม (กันคนกดปุ่มของเพลงที่จบไปแล้ว)
function retireCard(queue, label) {
  const msg = queue.nowPlayingMessage;
  const song = queue.cardSong;
  queue.nowPlayingMessage = null;
  queue.cardSong = null;
  stopProgress(queue);
  if (msg && song) {
    msg.edit({ embeds: [buildEndedEmbed(song, label)], components: [] }).catch(() => {});
  }
}

// อัปเดตการ์ดให้ตรงกับสถานะล่าสุด (เช่นหลังหยุด/วน/ปรับเสียง)
async function refreshCard(queue) {
  const msg = queue.nowPlayingMessage;
  if (!msg || !queue.songs.length) return;
  try {
    await msg.edit({ embeds: [buildNowPlayingEmbed(queue)], components: buildControls(queue) });
  } catch {}
}

async function showCard(queue, song) {
  // วนเพลงเดิม: ใช้การ์ดเดิมต่อ ไม่ต้องส่งใหม่ให้แชทรก
  if (queue.cardSong === song && queue.nowPlayingMessage) return;
  if (queue.songs[0] !== song) return;

  let msg;
  try {
    msg = await queue.textChannel.send({ embeds: [buildNowPlayingEmbed(queue, song)], components: buildControls(queue) });
  } catch (e) {
    console.error("[การ์ด] ส่งการ์ดเพลงไม่ได้:", e.message);
    return;
  }
  if (queue.destroyed || queue.songs[0] !== song) {
    // ระหว่างส่ง เพลงเปลี่ยนหรือคิวถูกปิดไปแล้ว
    msg.edit({ embeds: [buildEndedEmbed(song, "⏹ จบแล้ว")], components: [] }).catch(() => {});
    return;
  }
  queue.cardSong = song;
  queue.nowPlayingMessage = msg;
  startProgress(queue);
}

// ---------- สร้าง / ปิดคิว ----------
function createQueue(guild, voiceChannel, textChannel) {
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
  });
  connection.subscribe(player);

  const queue = {
    guild,
    guildId: guild.id,
    connection,
    player,
    voiceChannel,
    textChannel,
    songs: [], // { title, url, thumbnail, durationInSec, author, requestedBy }
    volume: 100,
    loop: "off", // off | song | queue
    playing: false, // true ตั้งแต่เริ่มโหลดเพลงจนเพลงจบ
    stay247: false,
    destroyed: false,
    idleTimeout: null,
    emptyTimeout: null,
    nowPlayingMessage: null,
    cardSong: null,
    progressTimer: null,
    editing: false,
    ignoreNextIdle: false,
    advance: null, // null | "skip" | "fail" บอกเหตุผลที่เพลงจบรอบนี้
    failStreak: 0,
    loadId: 0,
    proc: null,
    prefetch: null,
    prefetchTimer: null,
  };
  queues.set(guild.id, queue);

  connection.on("stateChange", (oldS, newS) => {
    console.log(`[เสียง] ${oldS.status} -> ${newS.status}`);
  });
  connection.on("error", (e) => console.error("[เสียง] connection error:", e.message));

  player.on(AudioPlayerStatus.Idle, () => {
    if (queue.destroyed || getQueue(guild.id) !== queue) return;
    if (queue.ignoreNextIdle) {
      queue.ignoreNextIdle = false;
      return;
    }
    const mode = queue.advance;
    queue.advance = null;
    advance(guild.id, mode);
  });

  player.on("error", (error) => {
    console.error("[เสียง] player error:", error.message);
    if (queue.destroyed) return;
    queue.advance = "fail"; // หลัง error ให้ข้ามเพลงนี้ (ไม่วนซ้ำ)
    sendNote(queue, `⚠️ เล่นเพลงนี้ไม่ต่อเนื่อง ข้ามไปเพลงถัดไป: ${escapeMd(truncate(queue.songs[0]?.title || "", 80))}`, COLORS.error);
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      destroyQueue(guild.id, "🔌 หลุดจากห้องเสียง");
    }
  });

  return queue;
}

function destroyQueue(guildId, label = "⏹ หยุดแล้ว") {
  const queue = getQueue(guildId);
  if (!queue) return;
  queue.destroyed = true;
  clearTimers(queue);
  clearTimeout(queue.prefetchTimer);
  dropPrefetch(queue);
  queue.loadId += 1;
  killProc(queue);
  retireCard(queue, label);
  try {
    queue.player.stop(true);
    queue.connection.destroy();
  } catch {}
  queues.delete(guildId);
  notifyChange();
}

// ปิดทุกคิวและฆ่าโปรเซส yt-dlp ที่ค้าง (ใช้ตอนบอทปิดตัว)
function killAll() {
  for (const queue of queues.values()) {
    try {
      dropPrefetch(queue);
      killProc(queue);
    } catch {}
  }
}

// ---------- ไปเพลงถัดไป ----------
// mode: null = เพลงจบเอง | "skip" = ผู้ใช้กดข้าม | "fail" = เล่นไม่ได้
function advance(guildId, mode = null) {
  const queue = getQueue(guildId);
  if (!queue || queue.destroyed) return;
  const prev = queue.songs[0];
  const has = queue.songs.length > 0;

  if (mode === "fail") {
    queue.songs.shift();
  } else if (mode === "skip") {
    // ข้ามตอนวนทั้งคิว: ย้ายเพลงนี้ไปท้ายคิว / ข้ามตอนวนเพลงเดียว: ไปเพลงถัดไปจริงๆ
    if (queue.loop === "queue" && has) queue.songs.push(queue.songs.shift());
    else queue.songs.shift();
  } else if (queue.loop === "song" && has) {
    // วนเพลงเดิม
  } else if (queue.loop === "queue" && has) {
    queue.songs.push(queue.songs.shift());
  } else {
    queue.songs.shift();
  }

  if (queue.songs[0] !== prev) {
    retireCard(queue, mode === "skip" ? "⏭ ข้ามแล้ว" : mode === "fail" ? "⚠️ เล่นไม่ได้" : "✅ เล่นจบแล้ว");
  }

  if (queue.songs.length > 0) {
    playSong(guildId);
  } else {
    queue.playing = false;
    stopProgress(queue);
    scheduleIdleDisconnect(guildId);
    notifyChange();
  }
}

// เล่นไม่ได้ -> ตัดเพลงนี้ทิ้งแล้วไปต่อ (ถ้าพังติดกันหลายเพลงให้หยุดคิว)
function skipFailed(guildId) {
  const queue = getQueue(guildId);
  if (!queue || queue.destroyed) return;
  queue.failStreak += 1;

  if (queue.failStreak >= MAX_FAIL_STREAK) {
    queue.songs = [];
    queue.playing = false;
    queue.failStreak = 0;
    retireCard(queue, "⚠️ เล่นไม่ได้");
    sendNote(queue, `⚠️ เล่นไม่ได้ติดกัน ${MAX_FAIL_STREAK} เพลง หยุดคิวแล้ว ลองใหม่อีกครั้งภายหลัง`, COLORS.error);
    scheduleIdleDisconnect(guildId);
    notifyChange();
    return;
  }
  advance(guildId, "fail");
}

async function playSong(guildId) {
  const queue = getQueue(guildId);
  if (!queue || queue.destroyed || queue.songs.length === 0) return;

  clearIdle(queue);
  clearTimeout(queue.prefetchTimer);
  killProc(queue);
  const song = queue.songs[0];
  const loadId = ++queue.loadId;
  queue.playing = true; // กันการเรียกเล่นซ้อนตอนกำลังโหลด
  const stale = () => queue.destroyed || getQueue(guildId) !== queue || queue.loadId !== loadId;

  // เริ่มโหลดเสียงทันที (หรือใช้ตัวที่โหลดล่วงหน้าไว้) ขณะรอห้องเสียงพร้อม ประหยัดเวลาไปหลายวินาที
  const audioPromise = takePrefetch(queue, song) || yt.openAudio(song);
  audioPromise.catch(() => {});

  try {
    await entersState(queue.connection, VoiceConnectionStatus.Ready, 20000);
  } catch {
    discardAudio(audioPromise);
    if (stale()) return;
    sendNote(queue, "❌ เข้าห้องเสียงไม่ได้ ลอง /stop แล้ว /play ใหม่", COLORS.error);
    destroyQueue(guildId, "❌ เข้าห้องเสียงไม่ได้");
    return;
  }

  let audio;
  try {
    audio = await audioPromise;
  } catch (err) {
    if (stale()) return;
    console.error(`[เพลง] เล่นไม่ได้: ${song.url}\n${err.detail || err.message}`);
    sendNote(
      queue,
      `❌ เล่นไม่ได้: **${escapeMd(truncate(song.title, 80))}**\nสาเหตุ: ${err.reason || err.message}`,
      COLORS.error
    );
    return skipFailed(guildId);
  }

  if (stale()) {
    killAudio(audio);
    return;
  }

  queue.proc = audio.proc;
  audio.proc.stdout.on("error", () => {});
  const resource = createAudioResource(audio.proc.stdout, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true,
  });
  resource.volume.setVolume(queue.volume / 100);
  queue.player.play(resource);
  queue.failStreak = 0;
  schedulePrefetch(queue);
  notifyChange();

  if (audio.fallback) {
    console.log(`[เพลง] YouTube ไม่ได้ ใช้ SoundCloud แทน: ${song.title}\n${audio.errors}`);
    sendNote(queue, "🔁 หาเพลงนี้บน YouTube ไม่ได้ เล่นจาก SoundCloud แทน", COLORS.info);
  }

  await showCard(queue, song);
}

// ---------- คำสั่งที่คำสั่ง/ปุ่มเรียกใช้ร่วมกัน ----------
// เพิ่มเพลงเข้าคิว next=true แทรกเป็นเพลงถัดไป
function addSongs(queue, songs, { next = false } = {}) {
  const room = Math.max(0, MAX_QUEUE - queue.songs.length);
  const list = songs.slice(0, room);
  if (next && queue.songs.length > 0) queue.songs.splice(1, 0, ...list);
  else queue.songs.push(...list);
  return { added: list.length, dropped: songs.length - list.length };
}

// อีกกี่วินาทีเพลงลำดับที่ index (นับจาก 0) จะเริ่มเล่น
function secondsUntil(queue, index) {
  let total = 0;
  for (let i = 0; i < index && i < queue.songs.length; i++) total += queue.songs[i].durationInSec || 0;
  return Math.max(0, total - elapsedSeconds(queue));
}

// ข้ามเพลงที่กำลังเล่น (ทำงานได้แม้เพลงยังโหลดอยู่) คืนเพลงที่ถูกข้าม
function skipCurrent(guildId) {
  const queue = getQueue(guildId);
  if (!queue || queue.destroyed || queue.songs.length === 0) return null;
  const skipped = queue.songs[0];

  if (queue.player.state.status === AudioPlayerStatus.Idle) {
    // ยังโหลดเพลงอยู่ (ยังไม่เริ่มเล่น): ยกเลิกการโหลดแล้วไปต่อ
    queue.loadId += 1;
    killProc(queue);
    advance(guildId, "skip");
  } else {
    queue.advance = "skip";
    queue.player.stop(true); // force: เข้า Idle ทันที แล้ว advance จะถูกเรียกจาก event
    queue.advance = null;
  }
  return skipped;
}

// ข้ามไปเล่นเพลงลำดับที่ index ในคิว (นับจาก 0) คืนเพลงเป้าหมาย
function jumpTo(guildId, index) {
  const queue = getQueue(guildId);
  if (!queue || queue.destroyed || index < 1 || index >= queue.songs.length) return null;
  const target = queue.songs[index];
  const skipped = queue.songs.slice(0, index);
  // วนทั้งคิว: เพลงที่ข้ามไปต่อท้ายคิวแทนการทิ้ง
  queue.songs = queue.loop === "queue" ? [...queue.songs.slice(index), ...skipped] : queue.songs.slice(index);

  retireCard(queue, "⏭ ข้ามแล้ว");
  queue.loadId += 1; // (เสียงที่โหลดล่วงหน้าไว้ ถ้าตรงกับเพลงเป้าหมาย playSong จะนำไปใช้เอง)
  killProc(queue);
  queue.ignoreNextIdle = true;
  queue.player.stop(true); // Idle ถูกส่งทันที (ถ้ากำลังเล่นอยู่) แล้วถูก ignore
  queue.ignoreNextIdle = false;
  playSong(guildId);
  return target;
}

function shuffleQueue(queue) {
  if (queue.songs.length < 3) return false; // ต้องมีเพลงรอในคิวอย่างน้อย 2 เพลง
  const current = queue.songs[0];
  const rest = queue.songs.slice(1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  queue.songs = [current, ...rest];
  return true;
}

function setVolume(queue, level) {
  queue.volume = level;
  const res = queue.player.state.resource;
  if (res && res.volume) res.volume.setVolume(level / 100); // ปรับเสียงเพลงที่เล่นอยู่ทันที
}

module.exports = {
  queues,
  getQueue,
  createQueue,
  destroyQueue,
  killAll,
  playSong,
  advance,
  addSongs,
  secondsUntil,
  skipCurrent,
  jumpTo,
  shuffleQueue,
  setVolume,
  refreshCard,
  refreshTimers,
  clearTimers,
  clearIdle,
  scheduleEmptyChannelDisconnect,
  setOnChange,
  MAX_QUEUE,
};
