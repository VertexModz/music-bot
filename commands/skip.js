const { SlashCommandBuilder } = require("discord.js");
const { skipCurrent } = require("../utils/musicManager");
const { checkAccess } = require("../utils/guards");
const { note, fail, who } = require("../utils/reply");
const { mdLink } = require("../utils/format");

module.exports = {
  data: new SlashCommandBuilder().setName("skip").setDescription("ข้ามเพลงนี้"),

  async execute(interaction) {
    const { error } = checkAccess(interaction);
    if (error) return fail(interaction, error);

    const skipped = skipCurrent(interaction.guild.id);
    if (!skipped) return fail(interaction, "ไม่มีเพลงที่กำลังเล่นอยู่");
    return interaction.reply({ embeds: [note(`⏭ ${who(interaction)} ข้าม ${mdLink(skipped.title, skipped.url, 70)}`)] });
  },
};
