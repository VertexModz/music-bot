// ตรวจสิทธิ์ก่อนสั่งงานเพลง (ใช้ทั้งคำสั่ง / และปุ่มบนการ์ด)
const { PermissionFlagsBits } = require("discord.js");
const { getQueue } = require("./musicManager");

// คืน { queue } ถ้าผ่าน หรือ { error: "ข้อความ" } ถ้าไม่ผ่าน
// - ต้องมีเพลงเล่นอยู่ (needSongs)
// - ต้องอยู่ห้องเสียงเดียวกับบอท (คนที่มีสิทธิ์ Manage Server ข้ามข้อนี้ได้)
function checkAccess(interaction, { needSongs = true } = {}) {
  const queue = getQueue(interaction.guild.id);

  if (!queue) return { error: "ตอนนี้ยังไม่ได้เล่นเพลง ใช้ /play ก่อนนะ" };
  if (needSongs && queue.songs.length === 0) return { error: "ไม่มีเพลงที่กำลังเล่นอยู่" };

  const userChannelId = interaction.member?.voice?.channelId;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
  if (userChannelId !== queue.voiceChannel.id && !isAdmin) {
    return { error: `ต้องอยู่ห้องเสียงเดียวกับบอท (<#${queue.voiceChannel.id}>) ถึงจะสั่งได้` };
  }
  return { queue };
}

module.exports = { checkAccess };
