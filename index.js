require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Collection, ActivityType } = require("discord.js");
const yt = require("./utils/ytdlp");
const keepAlive = require("./keep-alive");
const {
  queues,
  getQueue,
  killAll,
  refreshTimers,
  setOnChange,
} = require("./utils/musicManager");
const { handleButton } = require("./utils/buttons");
const { truncate } = require("./utils/format");
const { EPHEMERAL } = require("./utils/reply");

process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ ไม่พบ DISCORD_TOKEN — ใส่ค่าใน Environment Variables (Render) หรือไฟล์ .env ก่อนนะ");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// โหลดคำสั่งทั้งหมดจากโฟลเดอร์ commands/ อัตโนมัติ
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// ===== สถานะบอท (Listening to ...) แสดงเพลงที่กำลังเล่น =====
let presenceTimer = null;
function updatePresence() {
  clearTimeout(presenceTimer);
  presenceTimer = setTimeout(() => {
    if (!client.user) return;
    const active = [...queues.values()].filter((q) => q.songs.length > 0);
    const name =
      active.length === 1
        ? truncate(active[0].songs[0].title, 100)
        : active.length > 1
        ? `${active.length} เซิร์ฟเวอร์`
        : "/play เพื่อเปิดเพลง";
    client.user.setPresence({ activities: [{ name, type: ActivityType.Listening }], status: "online" });
  }, 3000); // หน่วงไว้ กันเปลี่ยนสถานะถี่เกินตอนข้ามเพลงรัวๆ
}
setOnChange(updatePresence);

client.once("clientReady", () => {
  console.log(`ล็อกอินสำเร็จ: ${client.user.tag}`);
  // ลิงก์เชิญบอทเข้าเซิร์ฟเวอร์ (สิทธิ์: ดูห้อง ส่งข้อความ ฝังลิงก์ เชื่อมต่อ และพูดในห้องเสียง)
  console.log(
    `เชิญบอท: https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot%20applications.commands&permissions=3165184`
  );
  updatePresence();
  yt.selfCheck();
});

async function replyError(interaction, text) {
  if (interaction.isAutocomplete()) return;
  const payload = { content: `❌ ${text}`, flags: EPHEMERAL };
  try {
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch {}
}

// ===== จัดการ Slash Commands / Autocomplete / ปุ่ม =====
client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command && command.autocomplete) await command.autocomplete(interaction);
      return;
    }

    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      if (!interaction.inGuild()) return replyError(interaction, "ใช้คำสั่งนี้ในเซิร์ฟเวอร์เท่านั้นนะ");
      await command.execute(interaction);
      return;
    }

    if (interaction.isButton() && /^(music|queue)_/.test(interaction.customId)) {
      if (!interaction.inGuild()) return;
      await handleButton(interaction);
    }
  } catch (error) {
    console.error(`[index] เกิดข้อผิดพลาด (${interaction.commandName || interaction.customId}):`, error);
    await replyError(interaction, "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
  }
});

// ===== ห้องเสียงเปลี่ยน: ออกเองเมื่อไม่มีคน / ตามบอทที่ถูกย้ายห้อง =====
client.on("voiceStateUpdate", (oldState, newState) => {
  const queue = getQueue(newState.guild.id);
  if (!queue) return;

  // บอทถูกย้ายไปห้องอื่น -> จำห้องใหม่ไว้
  if (newState.id === client.user.id && newState.channelId && newState.channelId !== queue.voiceChannel.id) {
    queue.voiceChannel = newState.channel;
  }

  const botChannelId = queue.voiceChannel.id;
  if (oldState.channelId !== botChannelId && newState.channelId !== botChannelId) return;
  refreshTimers(newState.guild.id);
});

// เปิดเว็บเซิร์ฟเวอร์เล็กๆ ไว้กัน Render free tier sleep (ใช้คู่กับ cron-job.org/UptimeRobot ping) พร้อมหน้าสถานะ
keepAlive(() => ({
  botName: client.user ? client.user.tag : null,
  guilds: client.guilds.cache.size,
  playing: [...queues.values()].filter((q) => q.songs.length > 0).map((q) => q.songs[0].title),
}));

// ปิดตัวอย่างสะอาด: ฆ่าโปรเซส yt-dlp ที่ค้าง แล้วค่อยออก
function shutdown() {
  try {
    killAll();
  } catch {}
  client.destroy();
  setTimeout(() => process.exit(0), 500).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => {
  try {
    killAll();
  } catch {}
});

client.login(process.env.DISCORD_TOKEN);
