const { SlashCommandBuilder } = require("discord.js");
const { destroyQueue } = require("../utils/musicManager");
const { checkAccess } = require("../utils/guards");
const { note, fail, who } = require("../utils/reply");
const { COLORS } = require("../utils/format");

module.exports = {
  data: new SlashCommandBuilder().setName("stop").setDescription("หยุดเพลงและออกจากห้องเสียง"),

  async execute(interaction) {
    const { error } = checkAccess(interaction, { needSongs: false });
    if (error) return fail(interaction, error);

    const name = who(interaction);
    destroyQueue(interaction.guild.id, `⏹ หยุดโดย ${name}`);
    return interaction.reply({ embeds: [note(`⏹ ${name} หยุดเพลงและให้บอทออกจากห้องแล้ว`, COLORS.error)] });
  },
};
