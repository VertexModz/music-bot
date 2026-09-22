const { SlashCommandBuilder } = require("discord.js");
const { refreshCard } = require("../utils/musicManager");
const { checkAccess } = require("../utils/guards");
const { note, fail, who } = require("../utils/reply");
const { loopLabel } = require("../utils/format");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("ตั้งค่าโหมดวนเพลง")
    .addStringOption((option) =>
      option
        .setName("โหมด")
        .setDescription("เลือกโหมดวนเพลง")
        .setRequired(true)
        .addChoices(
          { name: "ปิด", value: "off" },
          { name: "วนเพลงเดียว", value: "song" },
          { name: "วนทั้งคิว", value: "queue" }
        )
    ),

  async execute(interaction) {
    const { queue, error } = checkAccess(interaction, { needSongs: false });
    if (error) return fail(interaction, error);

    queue.loop = interaction.options.getString("โหมด");
    refreshCard(queue);
    return interaction.reply({ embeds: [note(`${queue.loop === "off" ? "➡️" : "🔁"} ${who(interaction)} ตั้งโหมดวน: **${loopLabel(queue.loop)}**`)] });
  },
};
