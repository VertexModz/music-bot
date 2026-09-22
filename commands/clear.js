const { SlashCommandBuilder } = require("discord.js");
const { refreshCard } = require("../utils/musicManager");
const { checkAccess } = require("../utils/guards");
const { note, fail, who } = require("../utils/reply");

module.exports = {
  data: new SlashCommandBuilder().setName("clear").setDescription("ล้างคิวเพลง (เพลงที่กำลังเล่นยังเล่นต่อ)"),

  async execute(interaction) {
    const { queue, error } = checkAccess(interaction);
    if (error) return fail(interaction, error);
    if (queue.songs.length <= 1) return fail(interaction, "ไม่มีเพลงรอในคิว");

    const removedCount = queue.songs.length - 1;
    queue.songs = [queue.songs[0]]; // เก็บเฉพาะเพลงที่กำลังเล่นอยู่
    refreshCard(queue);
    return interaction.reply({ embeds: [note(`🧹 ${who(interaction)} ล้างคิวแล้ว ${removedCount} เพลง`)] });
  },
};
