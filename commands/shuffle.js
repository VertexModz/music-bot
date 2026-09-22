const { SlashCommandBuilder } = require("discord.js");
const { shuffleQueue, refreshCard } = require("../utils/musicManager");
const { checkAccess } = require("../utils/guards");
const { note, fail, who } = require("../utils/reply");

module.exports = {
  data: new SlashCommandBuilder().setName("shuffle").setDescription("สลับลำดับเพลงในคิว"),

  async execute(interaction) {
    const { queue, error } = checkAccess(interaction);
    if (error) return fail(interaction, error);
    if (!shuffleQueue(queue)) return fail(interaction, "ต้องมีเพลงรอในคิวอย่างน้อย 2 เพลงถึงจะสลับได้");

    refreshCard(queue);
    return interaction.reply({ embeds: [note(`🔀 ${who(interaction)} สลับคิวแล้ว (${queue.songs.length - 1} เพลง)`)] });
  },
};
