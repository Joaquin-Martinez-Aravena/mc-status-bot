const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

const GREEN = 0x2ecc71;
const RED = 0xe74c3c;

// Texto corto para la presencia del bot.
function buildPresenceText(status) {
  if (!status.online) return '🔴 Offline';
  return `🟢 ${status.players.online}/${status.players.max} jugadores`;
}

// Mensaje que se postea en el canal cuando cambia el estado.
function buildTransitionMessage(status) {
  if (status.online) {
    return `🟢 El servidor se **prendió** — ${status.players.online}/${status.players.max} jugadores`;
  }
  return '🔴 El servidor se **apagó** o entró en reposo.';
}

// Embed completo para la respuesta de /estado. Devuelve tambien los archivos
// adjuntos (el icono, si la API lo entrega como data URI PNG).
function buildStatusEmbed(status) {
  const embed = new EmbedBuilder();
  const files = [];

  if (status.online) {
    embed
      .setColor(GREEN)
      .setTitle('🟢 Servidor ONLINE')
      .addFields({
        name: 'Jugadores',
        value: `${status.players.online}/${status.players.max}`,
        inline: true,
      });

    // Lista de conectados (si el server la entrega). Se recorta al limite de
    // 1024 caracteres que impone Discord en el valor de un field.
    const list = status.players.list;
    if (Array.isArray(list) && list.length > 0) {
      embed.addFields({ name: 'Conectados', value: list.join(', ').slice(0, 1024) });
    }
  } else {
    embed
      .setColor(RED)
      .setTitle('🔴 Servidor OFFLINE')
      .setDescription('El servidor está apagado o en reposo.');
  }

  if (status.motd) {
    embed.addFields({ name: 'MOTD', value: status.motd.slice(0, 1024) });
  }

  if (status.iconBase64 && status.iconBase64.startsWith('data:image/png;base64,')) {
    const base64 = status.iconBase64.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    files.push(new AttachmentBuilder(buffer, { name: 'icon.png' }));
    embed.setThumbnail('attachment://icon.png');
  }

  return { embed, files };
}

module.exports = { buildPresenceText, buildTransitionMessage, buildStatusEmbed };
