const { SlashCommandBuilder } = require("discord.js");
const { jumpTo } = require("../utils/musicManager");
const { checkAccess } = require("../utils/guards");
const { respondWithQueue } = require("../utils/queueAutocomplete");
const { note, fail, who } = require("../utils/reply");
const { mdLink } = require("../utils/format");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("skipto")
    .setDescription("ข้ามไปเล่นเพลงที่เลือกในคิวทันที")
    .addIntegerOption((option) =>
      option
        .setName("ตำแหน่ง")
        .setDescription("เลือกเพลงจากรายการ หรือพิมพ์เลขลำดับจาก /queue")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  autocomplete: respondWithQueue,

  async execute(interaction) {
    const { queue, error } = checkAccess(interaction);
    if (error) return fail(interaction, error);

    const position = interaction.options.getInteger("ตำแหน่ง");
    if (position < 1 || position >= queue.songs.length) {
      return fail(interaction, `ลำดับไม่ถูกต้อง (ในคิวมีเพลงรอ ${queue.songs.length - 1} เพลง)`);
    }

    const target = jumpTo(interaction.guild.id, position);
    if (!target) return fail(interaction, "ข้ามไม่สำเร็จ ลองใหม่อีกครั้ง");
    return interaction.reply({ embeds: [note(`⏭ ${who(interaction)} ข้ามไปเล่น ${mdLink(target.title, target.url, 70)}`)] });
  },
};
