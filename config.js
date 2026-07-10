// Carga variables desde .env (si existe) y las valida.
require('dotenv').config();

const REQUIRED = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID', 'SERVER_IP', 'STATUS_CHANNEL_ID'];

function getConfig() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno obligatorias: ${missing.join(', ')}`);
  }
  return {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    serverIp: process.env.SERVER_IP,
    statusChannelId: process.env.STATUS_CHANNEL_ID,
    pollIntervalMinutes: Number(process.env.POLL_INTERVAL_MINUTES) || 120,
  };
}

module.exports = { getConfig };
