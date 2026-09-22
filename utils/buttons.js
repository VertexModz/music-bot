// จัดการปุ่มบนการ์ดเพลงและปุ่มเปลี่ยนหน้าคิว
const { AudioPlayerStatus } = require("@discordjs/voice");
const { getQueue, destroyQueue, skipCurrent, shuffleQueue, setVolume } = require("./musicManager");
const { buildNowPlayingEmbed, buildControls } = require("./nowPlaying");
const { buildQueuePage } = require("./queueView");
const { checkAccess } = require("./guards");
const { EPHEMERAL, fail, who } = require("./reply");

const VOLUME_STEP = 10;
const VOLUME_MAX = 150;

const cardPayload = (queue) => ({ embeds: [buildNowPlayingEmbed(queue)], components: buildControls(queue) });

async function handleButton(interaction) {
  const id = interaction.customId;

  // เปลี่ยนหน้าคิว: ใครกดก็ได้ (แค่ดูข้อมูล)
  if (id.startsWith("queue_page:")) {
    const queue = getQueue(interaction.guild.id);
    if (!queue || queue.songs.length === 0) {
      return interaction.update({ content: "คิวว่างแล้ว", embeds: [], components: [] });
    }
    return interaction.update(buildQueuePage(queue, Number(id.split(":")[1])));
  }

  // ดูคิว: ตอบเฉพาะคนที่กด ไม่รบกวนแชท
  if (id === "music_queue") {
    const queue = getQueue(interaction.guild.id);
    if (!queue || queue.songs.length === 0) return fail(interaction, "ไม่มีเพลงในคิว");
    return interaction.reply({ ...buildQueuePage(queue, 0), flags: EPHEMERAL });
  }

  const access = checkAccess(interaction);
  if (access.error) return fail(interaction, access.error);
  const queue = access.queue;
  const guildId = interaction.guild.id;

  switch (id) {
    case "music_pauseresume": {
      const status = queue.player.state.status;
      if (status === AudioPlayerStatus.Playing) queue.player.pause();
      else if (status === AudioPlayerStatus.Paused || status === AudioPlayerStatus.AutoPaused) queue.player.unpause();
      else return fail(interaction, "เพลงกำลังโหลด รอสักครู่นะ");
      return interaction.update(cardPayload(queue));
    }

    case "music_skip": {
      await interaction.deferUpdate(); // การ์ดเก่าจะถูกย่อเอง แล้วการ์ดเพลงถัดไปจะขึ้นมา
      skipCurrent(guildId);
      return;
    }

    case "music_stop": {
      await interaction.deferUpdate();
      destroyQueue(guildId, `⏹ หยุดโดย ${who(interaction)}`);
      return;
    }

    case "music_loop": {
      const order = ["off", "song", "queue"];
      queue.loop = order[(order.indexOf(queue.loop) + 1) % order.length];
      return interaction.update(cardPayload(queue));
    }

    case "music_shuffle": {
      if (!shuffleQueue(queue)) return fail(interaction, "ต้องมีเพลงรอในคิวอย่างน้อย 2 เพลงถึงจะสลับได้");
      return interaction.update(cardPayload(queue));
    }

    case "music_voldown":
    case "music_volup": {
      const delta = id === "music_volup" ? VOLUME_STEP : -VOLUME_STEP;
      setVolume(queue, Math.min(VOLUME_MAX, Math.max(0, queue.volume + delta)));
      return interaction.update(cardPayload(queue));
    }
  }
}

module.exports = { handleButton };
