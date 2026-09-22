const { SlashCommandBuilder } = require("discord.js");
const { AudioPlayerStatus } = require("@discordjs/voice");
const { refreshCard } = require("../utils/musicManager");
const { checkAccess } = require("../utils/guards");
const { note, fail, who } = require("../utils/reply");
const { COLORS } = require("../utils/format");

module.exports = {
  data: new SlashCommandBuilder().setName("resume").setDescription("เล่นเพลงต่อ"),

  async execute(interaction) {
    const { queue, error } = checkAccess(interaction);
    if (error) return fail(interaction, error);

    const status = queue.player.state.status;
    if (status !== AudioPlayerStatus.Paused && status !== AudioPlayerStatus.AutoPaused) {
      return fail(interaction, "ตอนนี้ไม่ได้หยุดเพลงอยู่");
    }

    queue.player.unpause();
    refreshCard(queue);
    return interaction.reply({ embeds: [note(`▶️ ${who(interaction)} เล่นเพลงต่อ`, COLORS.success)] });
  },
};
