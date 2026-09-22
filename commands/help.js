const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { COLORS } = require("../utils/format");
const { EPHEMERAL } = require("../utils/reply");

module.exports = {
  data: new SlashCommandBuilder().setName("help").setDescription("ดูวิธีใช้และคำสั่งทั้งหมด"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.playing)
      .setTitle("🎵 วิธีใช้บอทเพลง")
      .setDescription("เข้าห้องเสียง แล้วพิมพ์ `/play` ตามด้วยชื่อเพลงหรือลิงก์ ก็ฟังได้เลย")
      .addFields(
        {
          name: "▶️ เล่นเพลง",
          value: [
            "`/play` ชื่อเพลง / ลิงก์ YouTube / SoundCloud / เพลย์ลิสต์",
            "ตัวเลือก `แทรกคิว` = ให้เล่นต่อจากเพลงนี้เลย",
            "`/skip` ข้าม · `/skipto` ข้ามไปเพลงที่เลือก",
            "`/pause` `/resume` หยุดชั่วคราว / เล่นต่อ",
          ].join("\n"),
        },
        {
          name: "📜 จัดการคิว",
          value: [
            "`/queue` ดูคิว · `/nowplaying` ดูเพลงที่เล่นอยู่",
            "`/remove` ลบเพลง · `/clear` ล้างคิว · `/shuffle` สลับคิว",
          ].join("\n"),
        },
        {
          name: "⚙️ ตั้งค่า",
          value: [
            "`/loop` วนเพลงเดียว / ทั้งคิว · `/volume` ปรับเสียง (0-150)",
            "`/stay247` อยู่ในห้องตลอด · `/stop` หยุดและออกจากห้อง",
          ].join("\n"),
        },
        {
          name: "💡 เคล็ดลับ",
          value:
            "• กดปุ่มใต้การ์ดเพลงแทนการพิมพ์คำสั่งได้ (⏯ ⏭ ⏹ 🔁 🔀 🔉 🔊 📜)\n• ตอนพิมพ์ `/play` จะมีคำแนะนำขึ้นให้เลือก\n• `/remove` และ `/skipto` เลือกเพลงจากชื่อได้เลย",
        }
      );

    return interaction.reply({ embeds: [embed], flags: EPHEMERAL });
  },
};
