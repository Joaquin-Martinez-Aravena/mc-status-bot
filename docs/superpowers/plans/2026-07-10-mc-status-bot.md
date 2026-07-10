# mc-status-bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un bot de Discord que consulta el estado de un servidor de Minecraft en Aternos vía la API pública `mcsrvstat.us`, lo expone con el comando `/estado`, lo refleja en su presencia y avisa a un canal cuando el estado cambia.

**Architecture:** Bot Node.js de un solo proceso con discord.js v14. Tres capas separadas: `src/mcStatus.js` (datos: consulta + normalización + fix Aternos), `src/statusEmbed.js` (presentación: embed y textos), `index.js` (wiring de Discord: comando, presencia, loop de sondeo). `config.js` valida el entorno al arrancar.

**Tech Stack:** Node.js 18+ (usa `fetch` y `node:test` nativos), discord.js v14, dotenv.

## Global Constraints

- **Node.js 18+** obligatorio (se usan `fetch` global, `AbortController` y el runner `node --test` nativos — sin librerías de testing ni de HTTP extra).
- **Solo 2 dependencias runtime:** `discord.js` (^14) y `dotenv` (^16).
- **Idioma:** código y nombres en inglés; textos visibles al usuario (embeds, mensajes) y comentarios en español.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- **Privacidad:** NUNCA commitear datos reales (`.env`, token, IDs, IP real, nombre/correo). Solo placeholders. `.env` va en `.gitignore`.
- **Sondeo:** `POLL_INTERVAL_MINUTES` default **120** (2 horas). Aviso al canal solo en la transición de estado.
- **Fix Aternos:** un server se considera OFFLINE si la API dice offline **O** si el MOTD contiene `"this server is offline"` (case-insensitive).

---

### Task 1: Scaffold del proyecto y configuración

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: `getConfig()` → `{ token, clientId, guildId, serverIp, statusChannelId, pollIntervalMinutes }`. Lanza `Error` si falta una variable obligatoria.

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "mc-status-bot",
  "version": "1.0.0",
  "description": "Discord bot to check a Minecraft (Aternos) server status via mcsrvstat.us",
  "main": "index.js",
  "type": "commonjs",
  "scripts": {
    "start": "node index.js",
    "test": "node --test"
  },
  "dependencies": {
    "discord.js": "^14.16.3",
    "dotenv": "^16.4.5"
  }
}
```

- [ ] **Step 2: Instalar dependencias**

Run: `npm install`
Expected: crea `node_modules/` y `package-lock.json` sin errores.

- [ ] **Step 3: Crear `.gitignore`**

```gitignore
node_modules/
.env
*.log
```

- [ ] **Step 4: Crear `.env.example` (solo placeholders, nunca valores reales)**

```dotenv
# Token del bot (Discord Developer Portal > Bot > Reset Token)
DISCORD_TOKEN=your-bot-token-here
# Application ID (Developer Portal > General Information)
CLIENT_ID=your-application-client-id
# ID del servidor de Discord donde registrar el comando (click derecho al server > Copiar ID)
GUILD_ID=your-discord-server-id
# Host publico del server de Minecraft en Aternos
SERVER_IP=example.aternos.me
# ID del canal donde avisar los cambios de estado
STATUS_CHANNEL_ID=your-status-channel-id
# Cada cuantos minutos sondear (default 120 = 2 horas)
POLL_INTERVAL_MINUTES=120
```

- [ ] **Step 5: Escribir el test que falla — `test/config.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { getConfig } = require('../config');

function setAllEnv() {
  process.env.DISCORD_TOKEN = 'token';
  process.env.CLIENT_ID = 'client';
  process.env.GUILD_ID = 'guild';
  process.env.SERVER_IP = 'example.aternos.me';
  process.env.STATUS_CHANNEL_ID = 'channel';
  delete process.env.POLL_INTERVAL_MINUTES;
}

test('getConfig lanza error si falta una variable obligatoria', () => {
  setAllEnv();
  delete process.env.DISCORD_TOKEN;
  assert.throws(() => getConfig(), /DISCORD_TOKEN/);
});

test('getConfig devuelve la config con default de 120 minutos', () => {
  setAllEnv();
  const config = getConfig();
  assert.strictEqual(config.serverIp, 'example.aternos.me');
  assert.strictEqual(config.pollIntervalMinutes, 120);
});

test('getConfig respeta POLL_INTERVAL_MINUTES del entorno', () => {
  setAllEnv();
  process.env.POLL_INTERVAL_MINUTES = '30';
  const config = getConfig();
  assert.strictEqual(config.pollIntervalMinutes, 30);
});
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '../config'`.

- [ ] **Step 7: Implementar `config.js`**

```js
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
```

- [ ] **Step 8: Correr el test y verificar que pasa**

Run: `npm test`
Expected: PASS — 3 tests de config en verde.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example config.js test/config.test.js
git commit -m "feat: scaffold del proyecto y carga/validacion de config"
```

---

### Task 2: Servicio de estado (`mcStatus.js`)

**Files:**
- Create: `src/mcStatus.js`
- Test: `test/mcStatus.test.js`

**Interfaces:**
- Consumes: nada del proyecto (usa `fetch` global).
- Produces:
  - `normalize(apiData)` → `{ online: boolean, players: { online: number, max: number }, motd: string, iconBase64: string|null }`
  - `isReallyOnline(apiData)` → `boolean` (aplica el fix Aternos)
  - `extractMotd(apiData)` → `string`
  - `async getServerStatus(ip)` → mismo objeto que `normalize`; lanza `Error` en fallo de red/timeout.

- [ ] **Step 1: Escribir el test que falla — `test/mcStatus.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { normalize, isReallyOnline } = require('../src/mcStatus');

test('normalize marca online un server realmente activo', () => {
  const data = {
    online: true,
    players: { online: 3, max: 20 },
    motd: { clean: ['Bienvenido al server'] },
    icon: 'data:image/png;base64,AAAA',
  };
  const s = normalize(data);
  assert.strictEqual(s.online, true);
  assert.strictEqual(s.players.online, 3);
  assert.strictEqual(s.players.max, 20);
  assert.strictEqual(s.motd, 'Bienvenido al server');
  assert.strictEqual(s.iconBase64, 'data:image/png;base64,AAAA');
});

test('normalize marca offline un server apagado', () => {
  const s = normalize({ online: false });
  assert.strictEqual(s.online, false);
  assert.strictEqual(s.players.online, 0);
  assert.strictEqual(s.players.max, 0);
  assert.strictEqual(s.iconBase64, null);
});

test('normalize detecta el fake-offline de Aternos', () => {
  const data = {
    online: true,
    players: { online: 0, max: 20 },
    motd: { clean: ['This server is offline.'] },
  };
  const s = normalize(data);
  assert.strictEqual(s.online, false);
});

test('isReallyOnline es case-insensitive con el MOTD de Aternos', () => {
  const data = { online: true, motd: { clean: ['THIS SERVER IS OFFLINE.'] } };
  assert.strictEqual(isReallyOnline(data), false);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test test/mcStatus.test.js`
Expected: FAIL — `Cannot find module '../src/mcStatus'`.

- [ ] **Step 3: Implementar `src/mcStatus.js`**

```js
const API_BASE = 'https://api.mcsrvstat.us/3';
const REQUEST_TIMEOUT_MS = 8000;

// Une las lineas limpias del MOTD en un solo string.
function extractMotd(apiData) {
  const clean = apiData && apiData.motd && apiData.motd.clean;
  if (Array.isArray(clean) && clean.length > 0) {
    return clean.join(' ').trim();
  }
  return '';
}

// Aplica el fix de Aternos: un server suspendido responde online con el MOTD
// "This server is offline." -> lo tratamos como offline.
function isReallyOnline(apiData) {
  if (!apiData || !apiData.online) return false;
  const motd = extractMotd(apiData).toLowerCase();
  if (motd.includes('this server is offline')) return false;
  return true;
}

// Convierte la respuesta cruda de la API en nuestro objeto de estado.
function normalize(apiData) {
  return {
    online: isReallyOnline(apiData),
    players: {
      online: (apiData && apiData.players && apiData.players.online) || 0,
      max: (apiData && apiData.players && apiData.players.max) || 0,
    },
    motd: extractMotd(apiData),
    iconBase64: (apiData && apiData.icon) || null,
  };
}

// Consulta la API publica y devuelve el estado normalizado.
async function getServerStatus(ip) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`La API respondio ${res.status}`);
    }
    const data = await res.json();
    return normalize(data);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { getServerStatus, normalize, isReallyOnline, extractMotd };
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test test/mcStatus.test.js`
Expected: PASS — 4 tests en verde.

- [ ] **Step 5: (Opcional) Smoke test contra la API real**

Run: `node -e "require('./src/mcStatus').getServerStatus('demo.mcstatus.io').then(s=>console.log(s))"`
Expected: imprime un objeto de estado sin lanzar error (verifica que `fetch` y el endpoint funcionan).

- [ ] **Step 6: Commit**

```bash
git add src/mcStatus.js test/mcStatus.test.js
git commit -m "feat: servicio de estado con normalizacion y fix fake-offline de Aternos"
```

---

### Task 3: Capa de presentación (`statusEmbed.js`)

**Files:**
- Create: `src/statusEmbed.js`
- Test: `test/statusEmbed.test.js`

**Interfaces:**
- Consumes: el objeto `status` de `normalize` (Task 2).
- Produces:
  - `buildPresenceText(status)` → `string` (texto corto para la presencia).
  - `buildTransitionMessage(status)` → `string` (mensaje de aviso al canal).
  - `buildStatusEmbed(status)` → `{ embed: EmbedBuilder, files: AttachmentBuilder[] }` (respuesta de `/estado`).

- [ ] **Step 1: Escribir el test que falla — `test/statusEmbed.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { buildPresenceText, buildTransitionMessage, buildStatusEmbed } = require('../src/statusEmbed');

test('buildPresenceText muestra jugadores cuando online', () => {
  const text = buildPresenceText({ online: true, players: { online: 3, max: 20 } });
  assert.strictEqual(text, '🟢 3/20 jugadores');
});

test('buildPresenceText muestra Offline cuando offline', () => {
  const text = buildPresenceText({ online: false, players: { online: 0, max: 0 } });
  assert.strictEqual(text, '🔴 Offline');
});

test('buildTransitionMessage anuncia prendido cuando online', () => {
  const msg = buildTransitionMessage({ online: true, players: { online: 0, max: 20 } });
  assert.match(msg, /prendió/);
});

test('buildTransitionMessage anuncia apagado cuando offline', () => {
  const msg = buildTransitionMessage({ online: false, players: { online: 0, max: 0 } });
  assert.match(msg, /apag/);
});

test('buildStatusEmbed devuelve embed y files sin icono', () => {
  const { embed, files } = buildStatusEmbed({
    online: true, players: { online: 1, max: 20 }, motd: 'Hola', iconBase64: null,
  });
  assert.ok(embed);
  assert.strictEqual(files.length, 0);
});

test('buildStatusEmbed adjunta el icono cuando hay iconBase64 png', () => {
  const { files } = buildStatusEmbed({
    online: true, players: { online: 1, max: 20 }, motd: 'Hola',
    iconBase64: 'data:image/png;base64,iVBORw0KGgo=',
  });
  assert.strictEqual(files.length, 1);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test test/statusEmbed.test.js`
Expected: FAIL — `Cannot find module '../src/statusEmbed'`.

- [ ] **Step 3: Implementar `src/statusEmbed.js`**

```js
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
  } else {
    embed
      .setColor(RED)
      .setTitle('🔴 Servidor OFFLINE')
      .setDescription('El servidor está apagado o en reposo.');
  }

  if (status.motd) {
    embed.addFields({ name: 'MOTD', value: status.motd });
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
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test test/statusEmbed.test.js`
Expected: PASS — 6 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add src/statusEmbed.js test/statusEmbed.test.js
git commit -m "feat: capa de presentacion (embed, presencia y mensaje de transicion)"
```

---

### Task 4: Wiring del bot (`index.js`)

**Files:**
- Create: `index.js`

**Interfaces:**
- Consumes: `getConfig()` (Task 1), `getServerStatus(ip)` (Task 2), `buildStatusEmbed/buildPresenceText/buildTransitionMessage` (Task 3).
- Produces: el entrypoint ejecutable del bot (no exporta nada).

Esta tarea es wiring de Discord; se valida corriendo el bot (no con unit tests).

- [ ] **Step 1: Implementar `index.js`**

```js
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
  await registerCommands();
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
    console.error(err);
    await interaction.editReply('No pude consultar el estado ahora. Intenta de nuevo en un momento.');
  }
});

client.login(config.token);
```

- [ ] **Step 2: Verificar que el proceso arranca sin `.env` (debe fallar con mensaje claro)**

Run: `node index.js` (sin `.env`)
Expected: sale con `Error: Faltan variables de entorno obligatorias: ...`. Esto confirma la validación de config.

- [ ] **Step 3: Crear `.env` local con valores reales (NO se commitea)**

Copiar `.env.example` a `.env` y rellenar con el token, IDs e IP reales. Verificar que `.env` está en `.gitignore` (`git status` NO debe listar `.env`).

- [ ] **Step 4: Verificación manual end-to-end**

Run: `npm start`
Comprobar en Discord:
1. El bot aparece online y su estado dice "Viendo 🟢 x/y jugadores" o "Viendo 🔴 Offline".
2. `/estado` responde con el embed (color correcto, jugadores, MOTD, e icono si el server lo tiene).
3. (Opcional, si puedes prender/apagar el server) al cambiar el estado real, tras el siguiente ciclo llega un aviso al canal configurado.

- [ ] **Step 5: Commit**

```bash
git add index.js
git commit -m "feat: wiring del bot (comando /estado, presencia y avisos de estado)"
```

---

### Task 5: README y preparación para publicar

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: documentación pública sin datos personales.

- [ ] **Step 1: Escribir `README.md`**

````markdown
# mc-status-bot

Bot de Discord que muestra el estado de un servidor de Minecraft alojado en Aternos,
usando la API pública [mcsrvstat.us](https://mcsrvstat.us). Responde con `/estado`,
refleja el estado en su presencia y avisa a un canal cuando el servidor se prende o
se apaga.

## Características
- `/estado`: embed con online/offline, jugadores, MOTD e icono del server.
- Presencia automática del bot actualizada cada 2 horas (configurable).
- Aviso a un canal solo cuando el estado cambia (sin spam).
- Detección del "fake offline" de Aternos (servers suspendidos que responden online).

## Requisitos
- Node.js 18 o superior.

## Instalación
```bash
git clone <tu-repo>
cd mc-status-bot
npm install
cp .env.example .env   # y rellena tus valores
```

## Variables de entorno
| Variable | Descripción |
|---|---|
| `DISCORD_TOKEN` | Token del bot (Developer Portal). |
| `CLIENT_ID` | Application ID. |
| `GUILD_ID` | ID del servidor de Discord. |
| `SERVER_IP` | Host del server de Aternos (ej: `example.aternos.me`). |
| `STATUS_CHANNEL_ID` | Canal para avisos de cambio de estado. |
| `POLL_INTERVAL_MINUTES` | Minutos entre sondeos (default 120). |

## Uso local
```bash
npm start
```

## Tests
```bash
npm test
```

## Despliegue en bot-hosting.net
1. Sube el repo o conéctalo desde GitHub.
2. Define las variables de entorno en el panel.
3. Arranca `index.js`. Corre 24/7, así la presencia y los avisos funcionan siempre.

## Limitaciones
- La detección de Aternos no es 100% infalible (caché de 5 min de la API + el truco
  de Aternos). El bot **solo lee** estado; no puede prender el server (Aternos lo
  bloquea por diseño).
````

- [ ] **Step 2: Verificar que no hay datos personales en lo que se va a publicar**

Run: `git grep -iE "TOKEN=|aternos\.me|<tu-nombre-real>|<tu-correo>" -- ':!*.example' ':!README.md'`
Expected: sin resultados (los únicos matches aceptables son placeholders en `.env.example`).
Revisar también que `docs/superpowers/specs/` y `docs/superpowers/plans/` no contengan datos que no quieras públicos (mencionan contexto interno). Si el repo será público, decidir: anonimizar esos docs o excluirlos.

- [ ] **Step 3: Configurar identidad de git pública para este repo**

```bash
git config user.name "<tu-usuario-de-github>"
git config user.email "<tu-email-publico-o-noreply-de-github>"
```
(Reemplaza con tu handle público. El noreply de GitHub tiene el formato
`ID+usuario@users.noreply.github.com`.)

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README con setup, uso y despliegue en bot-hosting.net"
```

- [ ] **Step 5: Publicar en GitHub**

Crear el repo remoto y hacer push. Si los commits previos tienen tu nombre real como
autor y prefieres no exponerlo en un repo público, considera regenerar el historial
con la identidad pública antes del primer push (repo nuevo, sin colaboradores → es
seguro):
```bash
# Opcional, solo si quieres historial limpio con identidad publica:
rm -rf .git && git init && git add -A && git commit -m "chore: initial commit"
```
Luego:
```bash
git remote add origin <url-del-repo>
git push -u origin main
```

---

## Notas de verificación end-to-end
1. `npm test` → todos los tests (config, mcStatus, statusEmbed) en verde.
2. `npm start` con `.env` real → bot online, presencia correcta, `/estado` funcional.
3. `git status` nunca lista `.env`; `git grep` no encuentra secretos ni datos personales.
