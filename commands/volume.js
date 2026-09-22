const { SlashCommandBuilder } = require("discord.js");
const { setVolume, refreshCard } = require("../utils/musicManager");
const { checkAccess } = require("../utils/guards");
const { note, fail, who, EPHEMERAL } = require("../utils/reply");

const volumeIcon = (v) => (v === 0 ? "🔇" : v < 50 ? "🔈" : v <= 100 ? "🔉" : "🔊");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("ปรับเสียง (0-150) ไม่ใส่ตัวเลข = ดูระดับเสียงตอนนี้")
    .addIntegerOption((option) =>
      option.setName("ระดับ").setDescription("100 = ปกติ").setMinValue(0).setMaxValue(150)
    ),

  async execute(interaction) {
    const { queue, error } = checkAccess(interaction, { needSongs: false });
    if (error) return fail(interaction, error);

    const level = interaction.options.getInteger("ระดับ");
    if (level === null) {
      return interaction.reply({ content: `${volumeIcon(queue.volume)} เสียงตอนนี้ ${queue.volume}%`, flags: EPHEMERAL });
    }

    setVolume(queue, level);
    refreshCard(queue);
    return interaction.reply({ embeds: [note(`${volumeIcon(level)} ${who(interaction)} ปรับเสียงเป็น **${level}%**`)] });
  },
};
