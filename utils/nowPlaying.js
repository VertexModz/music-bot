// การ์ด "กำลังเล่น" และปุ่มควบคุม
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { COLORS, formatDuration, progressBar, truncate, loopLabel, safeUrl, mdLink } = require("./format");

function isPaused(queue) {
  const s = queue.player.state.status;
  return s === "paused" || s === "autopaused";
}

// วินาทีที่เล่นไปแล้ว (ไม่นับช่วงที่หยุดชั่วคราว)
function elapsedSeconds(queue) {
  const res = queue.player.state.resource;
  return res ? Math.floor(res.playbackDuration / 1000) : 0;
}

function peekNext(queue) {
  return queue.loop === "song" ? null : queue.songs[1] || null;
}

function buildNowPlayingEmbed(queue, song = queue.songs[0]) {
  const paused = isPaused(queue);
  const author = song.author ? `🎤 ${truncate(song.author, 60)}\n` : "";

  const embed = new EmbedBuilder()
    .setColor(paused ? COLORS.paused : COLORS.playing)
    .setAuthor({ name: paused ? "⏸ หยุดชั่วคราว" : "🎶 กำลังเล่น" })
    .setTitle(truncate(song.title, 250))
    .setDescription(`${author}${progressBar(elapsedSeconds(queue), song.durationInSec)}`)
    .addFields(
      { name: "🔊 เสียง", value: `${queue.volume}%`, inline: true },
      { name: "🔁 วนเพลง", value: loopLabel(queue.loop), inline: true },
      { name: "📋 ในคิว", value: `${Math.max(queue.songs.length - 1, 0)} เพลง`, inline: true }
    );

  const url = safeUrl(song.url);
  if (url) embed.setURL(url);
  const thumb = safeUrl(song.thumbnail);
  if (thumb) embed.setThumbnail(thumb);

  const next = peekNext(queue);
  embed.setFooter({
    text: `ขอโดย ${song.requestedBy || "ไม่ทราบ"}${next ? ` • ถัดไป: ${truncate(next.title, 60)}` : ""}`,
  });
  return embed;
}

// การ์ดย่อหลังเพลงจบ/ถูกข้าม (เหลือไว้เป็นประวัติในแชท ไม่มีปุ่ม)
function buildEndedEmbed(song, label) {
  return new EmbedBuilder()
    .setColor(COLORS.ended)
    .setDescription(`${label} · ${mdLink(song.title, song.url, 70)} · \`${formatDuration(song.durationInSec)}\``);
}

const btn = (id, emoji, style) => new ButtonBuilder().setCustomId(id).setEmoji(emoji).setStyle(style);

function buildControls(queue) {
  const paused = isPaused(queue);
  const S = ButtonStyle;
  return [
    new ActionRowBuilder().addComponents(
      btn("music_pauseresume", paused ? "▶️" : "⏸️", paused ? S.Success : S.Primary),
      btn("music_skip", "⏭️", S.Secondary),
      btn("music_stop", "⏹️", S.Danger),
      btn("music_loop", queue.loop === "song" ? "🔂" : "🔁", queue.loop === "off" ? S.Secondary : S.Success),
      btn("music_shuffle", "🔀", S.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      btn("music_voldown", "🔉", S.Secondary),
      btn("music_volup", "🔊", S.Secondary),
      btn("music_queue", "📜", S.Secondary)
    ),
  ];
}

module.exports = { buildNowPlayingEmbed, buildEndedEmbed, buildControls, elapsedSeconds, peekNext, isPaused };
