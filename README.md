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
