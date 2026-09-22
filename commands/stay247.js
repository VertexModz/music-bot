const { SlashCommandBuilder } = require("discord.js");
const { refreshTimers } = require("../utils/musicManager");
const { checkAccess } = require("../utils/guards");
const { note, fail, who } = require("../utils/reply");
const { COLORS } = require("../utils/format");

module.exports = {
  data: new SlashCommandBuilder().setName("stay247").setDescription("เปิด/ปิดโหมดอยู่ในห้องเสียงตลอด (ไม่ออกเอง)"),

  async execute(interaction) {
    const { queue, error } = checkAccess(interaction, { needSongs: false });
    if (error) return fail(interaction, error);

    queue.stay247 = !queue.stay247;
    refreshTimers(interaction.guild.id); // เปิด = ยกเลิกตัวจับเวลาออกห้อง / ปิด = เริ่มนับใหม่ตามสถานการณ์จริง

    return interaction.reply({
      embeds: [
        note(
          queue.stay247
            ? `📌 ${who(interaction)} เปิดโหมดอยู่ตลอด บอทจะไม่ออกจากห้องเอง`
            : `📍 ${who(interaction)} ปิดโหมดอยู่ตลอด บอทจะออกเองเมื่อไม่มีคนหรือไม่มีเพลง`,
          COLORS.info
        ),
      ],
    });
  },
};
