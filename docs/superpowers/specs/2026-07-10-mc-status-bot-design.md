---
title: mc-status-bot — Diseño
date: 2026-07-10
status: aprobado-pendiente-revision
author: el mantenedor (con Claude)
---

# mc-status-bot — Documento de Diseño

## Contexto

El mantenedor administra un servidor de Minecraft alojado en **Aternos** y quiere poder
ver su estado (online / offline y cuántos jugadores hay) **sin tener que abrir la
web de Aternos**. Hoy la única forma es entrar al panel web, lo cual es lento y
molesto para el resto de la comunidad del Discord.

La solución es un bot de Discord que consulta el estado del servidor a través de la
un **Server List Ping (SLP) directo** al servidor y lo expone en Discord de dos
formas: bajo demanda (comando `/estado`) y de forma pasiva (la presencia del propio
bot + avisos al canal cuando el estado cambia).

Resultado esperado: cualquier miembro del Discord sabe de un vistazo si el server
está prendido y cuánta gente hay, sin salir de Discord.

## Cómo funciona la fuente de datos (y la trampa de Aternos)

> **Cambio de enfoque respecto al diseño original.** El plan inicial usaba la API
> pública `mcsrvstat.us`. En pruebas contra un server real de Aternos se descubrió
> que **mcsrvstat.us y mcstatus.io reportan el server como offline aunque esté lleno**:
> Aternos les bloquea/resetea las consultas a esos checkers de terceros. La solución
> fiable es hacer el ping nosotros mismos.

El bot hace un **Server List Ping (SLP)** directo por TCP a `host:port`: envía el
handshake + status request del protocolo de Minecraft y parsea el JSON de respuesta
(jugadores, MOTD, favicon). Es exactamente lo que hace el cliente de Minecraft en la
lista de servidores. No usa librerías ni APIs externas (solo el módulo `net` de Node).

**Detalle de Aternos:** el primer intento a veces devuelve `ECONNRESET` (reset
transitorio). Por eso el ping **reintenta** (default 3 veces) antes de concluir que el
server está offline. Si todos los intentos fallan (timeout/reset/refused), se asume
**offline/dormido**.

**Trampa conocida de Aternos:** un server *suspendido* puede responder con el MOTD
`"This server is offline."` en vez de rechazar la conexión. **Workaround:** tratar el
server como **OFFLINE** si el MOTD contiene `"this server is offline"`
(case-insensitive). No es infalible, pero cubre el caso normal.

Referencias:
- https://mcstatus.io/about (Aternos bloquea a los checkers de terceros)
- https://support.aternos.org/hc/en-us/articles/360041686352
- Protocolo SLP: https://minecraft.wiki/w/Java_Edition_protocol/Server_List_Ping

## Alcance

### Dentro (v1)
- Comando slash **`/estado`**: responde con un embed (verde/rojo) con estado,
  jugadores online/max, MOTD e icono del server.
- **Auto-presencia**: el bot actualiza su propia actividad (ej: `🟢 3/20 jugadores`
  o `🔴 Offline`) en cada ciclo de sondeo.
- **Aviso de cambio de estado**: cuando el server pasa de offline→online u
  online→offline, el bot postea **una sola vez** en un canal configurado. Nunca en
  cada ciclo → sin spam.
- **Fix fake-offline de Aternos** (workaround de MOTD descrito arriba).

### Fuera (explícitamente NO en v1)
- Mostrar la versión del server (descartado).
- Comando `/jugadores` (lista de nombres) — requiere `enable-query=true`; queda para
  después.
- **Encender/apagar el server desde Discord** — Aternos lo bloquea activamente
  (Cloudflare). Las libs no oficiales son frágiles y violan los ToS. No se hace.

## Arquitectura

Bot de **Node.js de un solo proceso** usando **discord.js v14** + **dotenv**.
Usa el `fetch` nativo de Node (18+), sin dependencias HTTP extra.

Separación en capas limpia (misma idea que se aplica en Python):
- **datos** (`mcStatus.js`): habla con la API y normaliza.
- **presentación** (`statusEmbed.js`): convierte datos → embed / texto de presencia.
- **wiring de Discord** (`index.js`): eventos, comando, loop de sondeo.

### Decisión: registro de comandos en `ready`
En vez del `deploy-commands.js` separado del tutorial, el comando `/estado` se
registra **dentro del evento `ready`** con scope de **guild** (aparece al instante).
Motivo: bot-hosting.net arranca un solo archivo; así no hay que correr un script
aparte en cada deploy.

### Decisión: frecuencia de sondeo (CONFIRMADO: 2 horas)
`POLL_INTERVAL_MINUTES` configurable, **default 120 (2 horas)**, confirmado
explícitamente. El aviso al canal ocurre **solo en la transición** (no en
cada ciclo), así que el canal se mantiene limpio.

Tradeoff aceptado: con sondeo cada 2h, la presencia y el aviso *"el server se
prendió"* pueden tardar **hasta 2 horas** en reflejarse. Si en el futuro se quiere
más inmediatez, basta bajar `POLL_INTERVAL_MINUTES` (el canal no se ensucia porque el
aviso sigue siendo solo-en-cambio).

## Estructura de archivos

```
mc-status-bot/
├── .env                 # secretos reales (gitignored)
├── .env.example         # plantilla para GitHub
├── .gitignore           # node_modules, .env
├── package.json         # main: index.js, script "start": "node index.js"
├── config.js            # lee y valida variables de entorno
├── index.js             # entrypoint: login, ready, /estado, loop de sondeo
├── src/
│   ├── mcStatus.js      # servicio: consulta API + normaliza + fix Aternos
│   └── statusEmbed.js   # embed de /estado + texto de presencia + texto de aviso
├── test/
│   └── mcStatus.test.js # tests de normalización y del fix fake-offline
└── README.md            # setup local + Discord Developer Portal + bot-hosting.net
```

## Componentes e interfaces

### `config.js`
Lee del entorno y valida al arrancar (si falta algo obligatorio, error claro y
`process.exit(1)`):
- `DISCORD_TOKEN` (obligatorio)
- `CLIENT_ID` (obligatorio)
- `GUILD_ID` (obligatorio — registro instantáneo del comando)
- `SERVER_IP` (obligatorio — ej: `miserver.aternos.me`)
- `STATUS_CHANNEL_ID` (obligatorio — canal para avisos de cambio de estado)
- `POLL_INTERVAL_MINUTES` (opcional, default 120 = 2 horas)

### `src/mcStatus.js`
- `async getServerStatus(ip)` → hace `fetch` a `https://api.mcsrvstat.us/3/{ip}`
  con timeout (`AbortController`, ~8s). Devuelve un objeto normalizado:
  ```
  {
    online: boolean,        // ya con el fix de Aternos aplicado
    players: { online, max },
    motd: string,           // primera línea del MOTD, limpia
    iconBase64: string|null // data URI del icono si existe
  }
  ```
  Si hay error de red / timeout → lanza o devuelve un estado de error controlado
  (`{ error: true }`) para que el llamador decida qué mostrar.
- Contiene la función pura de la lógica del fix Aternos, testeable de forma aislada
  (ej: `isReallyOnline(apiData)`).

### `src/statusEmbed.js`
- `buildStatusEmbed(status)` → `EmbedBuilder` verde (online) / rojo (offline),
  con jugadores, MOTD e icono como thumbnail.
- `buildPresenceText(status)` → string corto para `setActivity`
  (ej: `🟢 3/20 jugadores`, `🔴 Offline`).
- `buildTransitionMessage(status, previousOnline)` → texto del aviso al canal
  (ej: `🟢 El servidor se **prendió** — 0/20 jugadores`).

### `index.js`
- Crea el `Client` con intent `Guilds`.
- En `ready`: registra `/estado` en el guild y arranca el `setInterval` de sondeo.
- En `interactionCreate`: maneja `/estado` con `deferReply()` + `buildStatusEmbed`.
- Loop de sondeo: llama `getServerStatus`, actualiza presencia, y si el `online`
  cambió respecto al valor anterior en memoria, postea en `STATUS_CHANNEL_ID`.
- `client.login(token)`.

## Flujo de datos

```
/estado  → deferReply → getServerStatus → buildStatusEmbed → editReply
sondeo   → getServerStatus → buildPresenceText → setActivity
         └→ si cambió online → buildTransitionMessage → channel.send  (solo en cambio)
```

El estado anterior (`previousOnline`) se guarda **en memoria** (variable del
proceso). Si el bot se reinicia, el primer ciclo no dispara aviso falso: se
inicializa con el primer resultado sin notificar.

## Manejo de errores
- `fetch` con timeout vía `AbortController`; try/catch en todos los llamados.
- `/estado`: si la API falla, `editReply` con mensaje amable ("no pude consultar el
  estado ahora, intenta de nuevo").
- Loop de sondeo: un error **no crashea el proceso** — se loguea y se reintenta en el
  siguiente ciclo. La presencia no se actualiza ese ciclo.
- Validación de entorno al arranque.

## Testing
- `test/mcStatus.test.js` con el runner nativo de Node (`node --test`), sin deps:
  - normalización de una respuesta online real (mock del JSON de la API),
  - normalización de una respuesta offline,
  - **caso Aternos**: `online: true` + MOTD `"This server is offline."` → debe
    normalizar a `online: false`.
- El wiring de Discord se valida corriendo el bot manualmente (`/estado` en un server
  de prueba y observando la presencia).

## Despliegue

### GitHub (personal)
- `.gitignore` protege `.env` y `node_modules/`.
- Se sube `.env.example` como referencia.
- README documenta el setup completo.

### bot-hosting.net
1. Crear la app en el Discord Developer Portal → copiar `TOKEN` y `CLIENT_ID`.
2. Invitar el bot al server con permisos mínimos (`applications.commands`,
   `Send Messages`, `Embed Links`, `View Channel`).
3. En bot-hosting.net: conectar el repo de GitHub (o subir archivos), definir las
   variables de entorno en su panel, y arrancar `index.js`.
4. bot-hosting.net corre 24/7 → la auto-presencia y los avisos funcionan siempre.

## Privacidad y datos personales (docs y repo público)

El repo va a GitHub público, así que **ningún dato personal ni sensible** puede
quedar en el código, la documentación o el historial de git. Reglas:

- **Nunca** en el repo: `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `SERVER_IP` real,
  `STATUS_CHANNEL_ID`, nombre real del mantenedor, correo, ni ninguna IP/hostname real
  del servidor. Todo eso vive solo en `.env` (gitignored) y en el panel de
  bot-hosting.net.
- `.env.example` usa **placeholders genéricos** (ej: `SERVER_IP=example.aternos.me`,
  `DISCORD_TOKEN=your-bot-token-here`), nunca valores reales.
- El **README** y toda doc pública usan valores de ejemplo/placeholder, no capturas
  ni datos que revelen el server o el Discord reales.
- **Autoría de commits:** usar un identificador neutro/handle en lugar del nombre y
  correo personal. Configurar `user.name` y `user.email` del repo con un alias
  público (ej: el usuario de GitHub) antes del primer push, y revisar que el commit
  inicial no exponga datos personales (si los expone, reescribir la autoría antes de
  publicar).
- Este documento fue anonimizado antes de publicar: no contiene el nombre real,
  correo ni contexto personal del mantenedor.

## Limitaciones conocidas
- El fix de fake-offline de Aternos no es 100% infalible (caché de 5 min de la API +
  comportamiento cambiante de Aternos).
- El estado previo vive en memoria: un reinicio del bot resetea el punto de
  comparación (aceptable — no genera avisos falsos).
- El bot solo *lee* estado; **no puede prender el server** (limitación de Aternos, por
  diseño).
