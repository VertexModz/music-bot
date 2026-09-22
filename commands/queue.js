const { SlashCommandBuilder } = require("discord.js");
const { getQueue } = require("../utils/musicManager");
const { buildQueuePage } = require("../utils/queueView");
const { fail } = require("../utils/reply");

module.exports = {
  data: new SlashCommandBuilder().setName("queue").setDescription("ดูคิวเพลง"),

  async execute(interaction) {
    const queue = getQueue(interaction.guild.id);
    if (!queue || queue.songs.length === 0) return fail(interaction, "คิวว่าง ใช้ /play เพื่อเพิ่มเพลงได้เลย");
    return interaction.reply(buildQueuePage(queue, 0));
  },
};
