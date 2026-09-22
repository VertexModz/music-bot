// หน้าแสดงคิวเพลง (แบ่งหน้า กดปุ่ม ◀ ▶ ได้)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { COLORS, formatDuration, sumDuration, loopLabel, mdLink } = require("./format");

const PAGE_SIZE = 10;

// ตัวเลขหน้าเพลงคือ "ลำดับในคิวที่รอ" (1 = เพลงถัดไป) ใช้กับ /remove และ /skipto ได้ตรงๆ
function buildQueuePage(queue, requestedPage = 0) {
  const upcoming = queue.songs.slice(1);
  const pages = Math.max(1, Math.ceil(upcoming.length / PAGE_SIZE));
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), pages - 1);
  const start = page * PAGE_SIZE;
  const now = queue.songs[0];

  const lines = [];
  if (now) {
    lines.push(
      `**🎶 กำลังเล่น**\n${mdLink(now.title, now.url, 60)} \`${formatDuration(now.durationInSec)}\` · ${now.requestedBy || ""}`
    );
  }
  if (upcoming.length) {
    lines.push("\n**⏭ ถัดไป**");
    upcoming.slice(start, start + PAGE_SIZE).forEach((s, i) => {
      lines.push(`\`${start + i + 1}.\` ${mdLink(s.title, s.url, 50)} \`${formatDuration(s.durationInSec)}\``);
    });
  } else {
    lines.push("\n_ยังไม่มีเพลงรอในคิว ใช้ /play เพิ่มได้เลย_");
  }

  const total = sumDuration(queue.songs);
  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle("📜 คิวเพลง")
    .setDescription(lines.join("\n").slice(0, 4000))
    .setFooter({
      text: `หน้า ${page + 1}/${pages} · ${queue.songs.length} เพลง${total ? ` · รวม ${formatDuration(total)}` : ""} · วน: ${loopLabel(queue.loop)}`,
    });

  const components = [];
  if (pages > 1) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`queue_page:${page - 1}`).setEmoji("◀️").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId("queue_indicator").setLabel(`${page + 1}/${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`queue_page:${page + 1}`).setEmoji("▶️").setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1)
      )
    );
  }
  return { embeds: [embed], components };
}

module.exports = { buildQueuePage, PAGE_SIZE };
