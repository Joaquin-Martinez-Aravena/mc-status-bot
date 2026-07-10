const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, ActivityType,
} = require('discord.js');
const { getConfig } = require('./config');
const { getServerStatus } = require('./src/mcStatus');
const {
  buildStatusEmbed, buildPresenceText, buildTransitionMessage,
} = require('./src/statusEmbed');

const config = getConfig();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Estado anterior en memoria para detectar transiciones. null = aun sin medir.
let previousOnline = null;

// Registra el comando /estado en el guild (aparece al instante).
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('estado')
      .setDescription('Consulta el estado del servidor de Minecraft')
      .toJSON(),
  ];
  const rest = new REST({ version: '10' }).setToken(config.token);
  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands },
  );
  console.log('Comando /estado registrado.');
}

// Un ciclo de sondeo: actualiza presencia y avisa al canal si cambio el estado.
async function pollAndUpdate() {
  try {
    const status = await getServerStatus(config.serverIp);
    client.user.setActivity(buildPresenceText(status), { type: ActivityType.Watching });

    if (previousOnline !== null && previousOnline !== status.online) {
      const channel = await client.channels.fetch(config.statusChannelId);
      if (channel && channel.isTextBased()) {
        await channel.send(buildTransitionMessage(status));
      }
    }
    previousOnline = status.online;
  } catch (err) {
    console.error('Error en el ciclo de sondeo:', err.message);
  }
}

client.once('ready', async () => {
  console.log(`Bot conectado como ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (err) {
    console.error('No se pudo registrar el comando /estado:', err.message);
  }
  await pollAndUpdate();
  setInterval(pollAndUpdate, config.pollIntervalMinutes * 60 * 1000);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'estado') return;

  await interaction.deferReply();
  try {
    const status = await getServerStatus(config.serverIp);
    const { embed, files } = buildStatusEmbed(status);
    await interaction.editReply({ embeds: [embed], files });
  } catch (err) {
    console.error('Error en /estado:', err.message);
    await interaction.editReply('No pude consultar el estado ahora. Intenta de nuevo en un momento.');
  }
});

client.login(config.token);
