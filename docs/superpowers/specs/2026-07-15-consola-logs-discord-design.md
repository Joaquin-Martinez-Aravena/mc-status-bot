---
title: Consola de logs en Discord (DiscordSRV) — Diseño
date: 2026-07-15
status: aprobado-pendiente-revision
author: el mantenedor (con Claude)
---

# Consola de logs de Minecraft en Discord — Documento de Diseño

## Contexto

El mantenedor administra un servidor de Minecraft alojado en **Aternos** (software
**Paper**) y ya tiene un bot de estado (`mc-status-bot`) que avisa online/offline en un
canal de moderadores. Ahora quiere, **además**, un canal privado donde se vuelque **todo
el log del servidor** para poder revisarlo si llega a pasar algo: chat de los jugadores,
entradas/salidas, muertes, lo que hacen dentro del server, comandos, errores y warnings.

Requisitos explícitos del mantenedor:

- Un **único canal nuevo**, privado, **solo para el rol de moderadores**.
- El canal recibe **todo el log** en **una sola dirección** (server → Discord).
- **No** debe alertar a los jugadores ni crear ningún canal público.
- **No** se necesita puente de chat bidireccional (Discord → Minecraft).
- El chat de Minecraft y lo que hacen los jugadores **ya forman parte del log de consola**,
  así que no hace falta un canal de chat aparte.

Resultado esperado: los moderadores tienen una "consola del server" en Discord, en modo
lectura, para monitorear y auditar sin abrir el panel web de Aternos.

## Cómo funciona (fuente de datos)

El log no se obtiene con un ping (el SLP del bot de estado **no** transmite consola). Se
consigue con un componente que corre **dentro del servidor**: el plugin **DiscordSRV**.

**DiscordSRV** es el plugin estándar de puente Minecraft ↔ Discord para servidores basados
en la API de Bukkit (Spigot/Paper). Está disponible en el catálogo de plugins de Aternos.
Tiene dos features independientes:

1. **Canal de chat global** (puente bidireccional de chat). → **NO lo usamos.**
2. **Canal de consola** (`DiscordConsoleChannelId`): reenvía **toda la salida de consola**
   del servidor a un canal de Discord. → **Esto es lo único que usamos.**

DiscordSRV soporta correr **solo con el canal de consola**, dejando el mapa de canales de
chat **vacío** (`Channels: {}`). Así no existe ningún puente de chat público ni
bidireccional. El log de consola ya incluye chat, joins/leaves, muertes, comandos, logros,
errores y warnings — es decir, "todo lo que pasa" en una sola vía.

Referencias:
- DiscordSRV — Initial Setup: https://docs.discordsrv.com/installation/initial-setup/
- DiscordSRV — config.yml: https://docs.discordsrv.com/config/
- Aternos — cómo instalar DiscordSRV:
  https://board.aternos.org/thread/59441-how-to-install-and-set-up-discordsrv-updated/

## Arquitectura

Dos piezas **independientes** que conviven sin pisarse:

```
Tu PC (residencial)
  └─ mc-status-bot (Node.js)  ──►  #mods-logs        (SIN CAMBIOS: /estado, avisos on/off)

Server Aternos (Paper)
  └─ plugin DiscordSRV
        + bot de Discord #2   ──►  #consola-de-minecraft   (privado, solo mods, solo lectura)
             (vuelca TODO el log del server, una sola vía)
```

- El bot actual (`mc-status-bot`) **no se toca**. Sigue siendo el bot de estado en `#mods-logs`.
- DiscordSRV usa **su propio bot de Discord** (segunda *application*, token aparte). Corre
  dentro del JVM del servidor de Aternos; **no** agrega ningún proceso en la PC del mantenedor.
- Los dos son **complementarios**: uno dice si el server está prendido; el otro muestra qué
  pasa adentro cuando lo está.

## Alcance

### Dentro (v1)
- **Un canal privado** `#consola-de-minecraft`, visible solo para el **rol de moderadores**.
- **Solo lectura**: los moderadores **leen** el log pero **no pueden escribir** en el canal
  (vía permisos de Discord). Nadie ejecuta comandos desde ahí → monitor puro, sin riesgo.
- El bot #2 de DiscordSRV **vuelca toda la consola** del server a ese canal (chat, joins,
  leaves, muertes, comandos, logros, errores, warnings).
- El puente de chat global de DiscordSRV queda **desactivado** (`Channels: {}`).

### Fuera (explícitamente NO en v1)
- **Canal de chat público** o cualquier canal visible para todos los jugadores. No se hace.
- **Puente bidireccional** (escribir en Discord y que llegue al chat de Minecraft). No se hace.
- **Ejecutar comandos desde Discord.** El canal es solo lectura por decisión de diseño. (Si
  en el futuro se quisiera, es solo un cambio de permisos del canal — ver "Extensiones futuras".)
- **Cambios en el código del `mc-status-bot`.** Este feature es 100% server-side (plugin +
  config + permisos de Discord); el repo Node no se modifica.

## Componentes y configuración

### Bot de Discord #2 (para DiscordSRV)
- Nueva *application* en el Discord Developer Portal → agregar **Bot** → copiar el **token**.
- **Intents privilegiados a activar** (recomendado, evita errores al arrancar):
  `SERVER MEMBERS INTENT` y `MESSAGE CONTENT INTENT`.
- Invitar el bot al servidor de Discord con permiso de **ver** y **escribir** en el canal de
  consola (el bot necesita poder postear; los humanos mods no).

### Canal `#consola-de-minecraft` (Discord)
- Nombre visible normalizado por Discord (sin mayúsculas ni espacios): `consola-de-minecraft`.
- Permisos:
  - `@everyone`: **sin acceso** (View Channel denegado).
  - **Rol de moderadores**: View Channel **permitido**, Send Messages **denegado** (read-only).
  - **Bot #2 de DiscordSRV**: View Channel + Send Messages **permitido** (para volcar el log).

### Plugin DiscordSRV en Aternos
- Instalar desde: Panel → **Software → Plugins → Paper → DiscordSRV → Install**.
- Arrancar el server una vez para generar `plugins/DiscordSRV/config.yml`.
- Editar `config.yml` (file manager de Aternos), solo estos valores:
  - `BotToken: "<token del bot #2>"`
  - `Channels: {}`  ← **vacío**, desactiva el chat público/bidireccional.
  - `DiscordConsoleChannelId: "<id del canal #consola-de-minecraft>"`
- Reiniciar el server para aplicar.

## Flujo de datos

```
Evento en el server (chat / join / leave / muerte / comando / error / warning)
        └─► consola del servidor de Minecraft
              └─► DiscordSRV (bot #2)
                    └─► #consola-de-minecraft   (una sola vía, solo lectura para mods)
```

No hay flujo de vuelta: Discord → Minecraft está deshabilitado por diseño.

## Seguridad y privacidad

- **Read-only real:** la protección contra ejecución de comandos se apoya en los permisos
  de Discord (mods sin *Send Messages* en el canal). Es la barrera principal y suficiente
  para el objetivo de "solo monitorear".
- **Token del bot #2 es secreto:** vive solo en el `config.yml` dentro de Aternos. **Nunca**
  se commitea al repo ni se comparte. Si se filtra, se resetea de inmediato en el Developer Portal.
- **Repo público:** este documento y cualquier doc del repo usan **placeholders**, nunca el
  token real, los IDs reales de canal/guild, ni el host real del servidor.
- **Canal privado:** el log puede contener nombres de jugadores y su actividad; por eso el
  canal es solo para el rol de moderadores y nunca público.

## Límites conocidos (expectativas realistas)

- **Solo funciona con el server encendido.** Cuando Aternos duerme (server vacío) no hay
  logs — es esperable, y el `mc-status-bot` ya avisa el on/off. Son complementarios.
- Usamos **solo una parte** de DiscordSRV (el canal de consola), pero es el plugin más
  confiable y mantenido y está en el catálogo de Aternos → decisión pragmática correcta
  frente a plugins de log-forwarding menos mantenidos o al scraping frágil de la consola web.
- El plugin queda **instalado de forma persistente** en el server de Aternos.

## Verificación (no hay tests unitarios; es configuración)

1. Arrancar el server → el **bot #2** aparece **online** en Discord.
2. Que un jugador **entre** o **escriba** en el chat de Minecraft → el evento aparece en
   `#consola-de-minecraft`.
3. Confirmar permisos:
   - un usuario **sin** rol de mod **no ve** el canal;
   - un **moderador** ve el canal pero **no puede escribir** en él.

## Extensiones futuras (fuera de v1, anotadas para no perderlas)
- Permitir que los mods **ejecuten comandos** desde el canal: alcanza con habilitar *Send
  Messages* al rol de mods (y opcionalmente restringir comandos peligrosos vía la blacklist
  de DiscordSRV). No se hace ahora por decisión explícita.
- Filtrar el ruido de la consola (ej. ocultar ciertos warnings) si el canal se vuelve muy
  verboso.
