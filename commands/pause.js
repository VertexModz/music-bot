const { SlashCommandBuilder } = require("discord.js");
const { AudioPlayerStatus } = require("@discordjs/voice");
const { refreshCard } = require("../utils/musicManager");
const { checkAccess } = require("../utils/guards");
const { note, fail, who } = require("../utils/reply");
const { COLORS } = require("../utils/format");

module.exports = {
  data: new SlashCommandBuilder().setName("pause").setDescription("หยุดเพลงชั่วคราว"),

  async execute(interaction) {
    const { queue, error } = checkAccess(interaction);
    if (error) return fail(interaction, error);

    const status = queue.player.state.status;
    if (status === AudioPlayerStatus.Paused) return fail(interaction, "หยุดอยู่แล้ว ใช้ /resume เพื่อเล่นต่อ");
    if (status !== AudioPlayerStatus.Playing) return fail(interaction, "เพลงกำลังโหลด รอสักครู่นะ");

    queue.player.pause();
    refreshCard(queue);
    return interaction.reply({ embeds: [note(`⏸ ${who(interaction)} หยุดเพลงชั่วคราว`, COLORS.paused)] });
  },
};
