// รันไฟล์นี้ทุกครั้งที่เพิ่ม/แก้ไขคำสั่งใหม่ เพื่อลงทะเบียนกับ Discord
// วิธีรัน: node deploy-commands.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error("❌ ต้องตั้งค่า DISCORD_TOKEN และ CLIENT_ID ก่อน (ใน Secrets หรือไฟล์ .env)");
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log(`กำลังลงทะเบียนคำสั่งทั้งหมด ${commands.length} คำสั่ง...`);

    if (GUILD_ID) {
      // ลงทะเบียนเฉพาะในเซิร์ฟเวอร์เดียว (GUILD_ID) จะขึ้นทันที เหมาะกับตอนพัฒนา/ใช้ส่วนตัว
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log("✅ ลงทะเบียนคำสั่งสำเร็จ (เฉพาะเซิร์ฟเวอร์ที่ตั้งไว้)");
    } else {
      // ไม่ได้ตั้ง GUILD_ID -> ลงทะเบียนทุกเซิร์ฟเวอร์ (อาจใช้เวลาสักครู่กว่าจะขึ้น)
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log("✅ ลงทะเบียนคำสั่งสำเร็จ (ทุกเซิร์ฟเวอร์ อาจใช้เวลาสักครู่กว่าจะขึ้น)");
    }
  } catch (error) {
    console.error("❌ ลงทะเบียนคำสั่งไม่สำเร็จ:", error);
    process.exitCode = 1;
  }
})();
