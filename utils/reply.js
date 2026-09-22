// ตัวช่วยตอบกลับ: การ์ดข้อความสั้นๆ และข้อความผิดพลาดที่เห็นเฉพาะผู้ใช้คนนั้น
const { EmbedBuilder, MessageFlags } = require("discord.js");
const { COLORS } = require("./format");

const EPHEMERAL = MessageFlags.Ephemeral;

// การ์ดข้อความสั้นๆ (ใช้แจ้งผลการกระทำ)
function note(text, color = COLORS.info) {
  return new EmbedBuilder().setColor(color).setDescription(String(text).slice(0, 4000));
}

// แจ้งข้อผิดพลาดเฉพาะคนที่กดคำสั่ง
function fail(interaction, text) {
  const payload = { content: `❌ ${text}`, flags: EPHEMERAL };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
  return interaction.reply(payload);
}

function who(interaction) {
  return interaction.member?.displayName || interaction.user.username;
}

module.exports = { EPHEMERAL, note, fail, who };
