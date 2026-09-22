const { SlashCommandBuilder } = require("discord.js");
const { getQueue } = require("../utils/musicManager");
const { buildNowPlayingEmbed, buildControls } = require("../utils/nowPlaying");
const { fail } = require("../utils/reply");

module.exports = {
  data: new SlashCommandBuilder().setName("nowplaying").setDescription("ดูเพลงที่กำลังเล่น"),

  async execute(interaction) {
    const queue = getQueue(interaction.guild.id);
    if (!queue || queue.songs.length === 0) return fail(interaction, "ไม่มีเพลงที่กำลังเล่นอยู่");
    return interaction.reply({ embeds: [buildNowPlayingEmbed(queue)], components: buildControls(queue) });
  },
};
