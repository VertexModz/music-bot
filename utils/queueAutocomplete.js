// ช่วยเลือกเพลงจากคิวตอนพิมพ์ในคำสั่ง /remove และ /skipto (เลือกจากชื่อเพลงได้เลย ไม่ต้องนับเลข)
const { getQueue } = require("./musicManager");
const { truncate } = require("./format");

async function respondWithQueue(interaction) {
  const queue = getQueue(interaction.guild.id);
  const focused = String(interaction.options.getFocused() ?? "").trim().toLowerCase();
  const upcoming = queue ? queue.songs.slice(1) : [];

  const choices = upcoming
    .map((song, i) => ({ n: i + 1, song }))
    .filter(({ n, song }) => !focused || String(n).startsWith(focused) || song.title.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(({ n, song }) => ({ name: truncate(`${n}. ${song.title}`, 100), value: n }));

  return interaction.respond(choices).catch(() => {});
}

module.exports = { respondWithQueue };
