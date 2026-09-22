const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
  getQueue,
  createQueue,
  destroyQueue,
  playSong,
  addSongs,
  secondsUntil,
  refreshCard,
  refreshTimers,
} = require("../utils/musicManager");
const yt = require("../utils/ytdlp");
const { suggest } = require("../utils/suggest");
const { COLORS, formatDuration, sumDuration, truncate, mdLink, safeUrl } = require("../utils/format");
const { note, fail, who } = require("../utils/reply");

function isPlaylistUrl(u) {
  try {
    const x = new URL(u);
    const host = x.hostname.replace(/^www\.|^music\./, "");
    if (host === "youtube.com" && x.pathname === "/playlist") return true;
    if (host.endsWith("soundcloud.com") && x.pathname.includes("/sets/")) return true;
    return false;
  } catch {
    return false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("เล่นเพลงจากชื่อหรือลิงก์ (YouTube / SoundCloud / เพลย์ลิสต์)")
    .addStringOption((option) =>
      option
        .setName("เพลง")
        .setDescription("พิมพ์ชื่อเพลง หรือวางลิงก์ (YouTube/SoundCloud)")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addBooleanOption((option) =>
      option.setName("แทรกคิว").setDescription("ให้เล่นต่อจากเพลงนี้เลย (ไม่ต่อท้ายคิว)")
    ),

  // แนะนำคำค้นตอนพิมพ์
  async autocomplete(interaction) {
    const typed = String(interaction.options.getFocused() ?? "").trim();
    if (!typed || /^https?:\/\//i.test(typed)) return interaction.respond([]).catch(() => {});

    const list = await Promise.race([suggest(typed), new Promise((resolve) => setTimeout(() => resolve([]), 2000))]);
    const values = [typed, ...list.filter((s) => s.toLowerCase() !== typed.toLowerCase())]
      .filter((s) => s.length <= 100)
      .slice(0, 10);
    return interaction
      .respond(values.map((s) => ({ name: truncate(`🔎 ${s}`, 100), value: s })))
      .catch(() => {});
  },

  async execute(interaction) {
    const query = interaction.options.getString("เพลง").trim();
    const playNext = interaction.options.getBoolean("แทรกคิว") ?? false;
    const voiceChannel = interaction.member.voice.channel;
    const guildId = interaction.guild.id;

    if (!voiceChannel) return fail(interaction, "เข้าห้องเสียงก่อนนะ แล้วค่อยใช้ /play");
    if (!voiceChannel.joinable || !voiceChannel.speakable) {
      return fail(interaction, "บอทเข้าหรือพูดในห้องนี้ไม่ได้ (ไม่มีสิทธิ์)");
    }
    const existing = getQueue(guildId);
    if (existing && existing.voiceChannel.id !== voiceChannel.id) {
      return fail(interaction, `บอทกำลังเล่นอยู่ที่ <#${existing.voiceChannel.id}> เข้าห้องเดียวกันก่อนนะ`);
    }

    await interaction.deferReply();

    // เริ่มต่อห้องเสียงไปพร้อมๆ กับค้นหาเพลง ช่วยให้เพลงเริ่มเร็วขึ้น
    let queue = existing;
    let created = false;
    if (!queue) {
      queue = createQueue(interaction.guild, voiceChannel, interaction.channel);
      created = true;
    } else {
      queue.textChannel = interaction.channel; // ให้การ์ดเพลงขึ้นในห้องแชทที่ใช้ล่าสุด
    }
    const abandon = () => {
      const q = getQueue(guildId);
      if (created && q === queue && !q.playing && q.songs.length === 0) destroyQueue(guildId, "❌ ไม่พบเพลง");
    };

    let songs = [];
    let playlistTitle = null;

    try {
      if (/^https?:\/\//i.test(query)) {
        if (isPlaylistUrl(query)) {
          const pl = await yt.getPlaylist(query);
          songs = pl.songs;
          playlistTitle = pl.title;
        } else {
          let song = null;
          try {
            song = await yt.getVideo(query);
          } catch {}
          songs = [song || { title: query, url: query, thumbnail: null, durationInSec: 0, author: null }];
        }
      } else {
        songs = await yt.search(query, 1);
      }
    } catch (error) {
      console.error("[play] โหลดข้อมูลไม่สำเร็จ:", error.detail || error.message);
      abandon();
      return interaction.editReply({
        embeds: [note(`❌ หาเพลงไม่ได้: ${yt.friendly(error.detail || error.message)}`, COLORS.error)],
      });
    }

    if (!songs.length) {
      abandon();
      return interaction.editReply({
        embeds: [note(`🔍 ไม่เจอเพลง "${truncate(query, 80)}" ลองใช้คำอื่นดูนะ`, COLORS.error)],
      });
    }

    // ระหว่างค้นหา คิวอาจถูกปิดไปแล้ว (เช่นมีคนสั่ง /stop) -> สร้างใหม่
    queue = getQueue(guildId);
    if (!queue) queue = createQueue(interaction.guild, voiceChannel, interaction.channel);

    const requester = who(interaction);
    songs.forEach((s) => (s.requestedBy = requester));

    const wasIdle = !queue.playing;
    const before = queue.songs.length;
    const { added, dropped } = addSongs(queue, songs, { next: playNext });

    if (added === 0) {
      return interaction.editReply({ embeds: [note("📛 คิวเต็มแล้ว ลองรอให้เพลงเล่นจบก่อนนะ", COLORS.error)] });
    }

    // สั่งเริ่มเล่นทันที (ก่อนรอตอบกลับ) กันกรณีมีคนสั่ง /play พร้อมกันแล้วเริ่มเล่นซ้อน
    if (wasIdle) playSong(guildId);

    // ---- ข้อความตอบกลับ ----
    let embed;
    if (playlistTitle) {
      embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setDescription(
          `📚 เพิ่มเพลย์ลิสต์ **${truncate(playlistTitle, 80)}**\n${added} เพลง · รวม ${formatDuration(sumDuration(songs.slice(0, added)))}` +
            (dropped ? `\n(คิวเต็ม ข้ามไป ${dropped} เพลง)` : "")
        )
        .setFooter({ text: `ขอโดย ${requester}` });
    } else if (wasIdle) {
      embed = note(`🔎 เจอแล้ว ${mdLink(songs[0].title, songs[0].url, 70)} — กำลังโหลด...`, COLORS.success);
    } else {
      const index = playNext ? 1 : before; // ลำดับในคิวที่รอ (1 = เพลงถัดไป)
      const wait = secondsUntil(queue, index);
      const song = songs[0];
      embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setAuthor({ name: playNext ? "⏭ แทรกเป็นเพลงถัดไป" : "➕ เพิ่มเข้าคิวแล้ว" })
        .setTitle(truncate(song.title, 250))
        .addFields(
          { name: "⏱ ความยาว", value: formatDuration(song.durationInSec), inline: true },
          { name: "📍 ลำดับในคิว", value: `${index}`, inline: true },
          { name: "⏳ เล่นในอีก", value: wait > 0 ? `~${formatDuration(wait)}` : "ไม่นาน", inline: true }
        )
        .setFooter({ text: `ขอโดย ${requester}` });
      const url = safeUrl(song.url);
      if (url) embed.setURL(url);
      const thumb = safeUrl(song.thumbnail);
      if (thumb) embed.setThumbnail(thumb);
    }
    await interaction.editReply({ embeds: [embed] });

    if (wasIdle) {
      if (!playlistTitle) setTimeout(() => interaction.deleteReply().catch(() => {}), 10000); // การ์ดเพลงจะขึ้นแทน
    } else {
      refreshCard(queue); // อัปเดตจำนวนคิว / เพลงถัดไปบนการ์ด
    }
    refreshTimers(guildId);
  },
};
