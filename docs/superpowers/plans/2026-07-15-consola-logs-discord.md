# Consola de logs en Discord (DiscordSRV) — Plan de Implementación

> **Nota sobre este plan:** es un **runbook manual**, no código con TDD. Casi todos los
> pasos se hacen en interfaces web con login del mantenedor (Discord Developer Portal,
> panel de Aternos). No hay tests unitarios; el "test" de cada tarea es una **verificación**
> concreta que se hace a ojo. Ejecutar tarea por tarea, confirmando la verificación de una
> antes de pasar a la siguiente.

**Goal:** Tener un canal privado de Discord, solo para moderadores y en modo lectura, donde
se vuelca todo el log del servidor de Minecraft (chat, entradas/salidas, muertes, comandos,
errores) vía DiscordSRV.

**Architecture:** Feature 100% server-side. Un segundo bot de Discord (token propio) +
el plugin DiscordSRV corriendo dentro del server de Aternos (Paper) reenvían la consola del
server a un canal de Discord, en una sola dirección. El `mc-status-bot` (Node) no se toca.

**Tech Stack:** DiscordSRV (plugin Paper/Spigot), Discord Developer Portal, panel de Aternos.

## Global Constraints

- El servidor de Aternos debe correr software **Paper** (confirmado). DiscordSRV requiere
  la API de Bukkit (CraftBukkit/Spigot/Paper).
- **Un solo canal nuevo**, privado, **solo rol de moderadores**, **solo lectura** para humanos.
- **Sin** canal de chat público, **sin** puente bidireccional, **sin** ejecución de comandos
  desde Discord, **sin** alertas a jugadores.
- El **token del bot #2 es secreto**: vive solo en `config.yml` dentro de Aternos. Nunca se
  commitea al repo ni se comparte.
- Solo funciona con el **server encendido** (cuando Aternos duerme no hay logs — esperable).
- Repo público → cualquier doc usa placeholders, nunca IDs/tokens reales.

**Prerrequisitos antes de empezar:**
- Ser **administrador** del servidor de Discord donde va el canal.
- Tener acceso al **panel de Aternos** del server.
- Tener un **rol de moderadores** en Discord (si no existe, se crea en la Tarea 3).
- Activar el **Modo Desarrollador** de Discord (para copiar IDs): Ajustes de usuario →
  Avanzado → **Modo desarrollador: ON**.

---

### Tarea 1: Crear el bot de Discord #2 (application + bot + intents + token)

**Dónde:** https://discord.com/developers/applications

**Interfaces:**
- Produce: un **token de bot** (string secreto) que se usará en la Tarea 5 (`config.yml`).

- [ ] **Paso 1: Crear la application**
  - "New Application" → nombre (ej. `Consola MC`) → Create.

- [ ] **Paso 2: Crear el bot**
  - Menú izquierdo → **Bot** → "Add Bot" / "Reset Token" según lo que muestre → confirmar.

- [ ] **Paso 3: Activar los intents privilegiados**
  - En la pestaña **Bot**, sección **Privileged Gateway Intents**, activar:
    - ✅ **SERVER MEMBERS INTENT**
    - ✅ **MESSAGE CONTENT INTENT**
  - Guardar (Save Changes). *(Si no se activan, DiscordSRV puede tirar error al arrancar.)*

- [ ] **Paso 4: Copiar el token**
  - Pestaña **Bot** → "Reset Token" → **Copy**. Guardarlo en un lugar seguro y temporal
    (no en el repo, no en un chat). Se muestra una sola vez.

- [ ] **Verificación:**
  - La application existe, el bot está creado, los dos intents aparecen en **ON**, y tenés
    el token copiado. (Todavía no se usa; se pega en la Tarea 5.)

---

### Tarea 2: Invitar el bot #2 al servidor de Discord

**Dónde:** Discord Developer Portal → tu application → **OAuth2 → URL Generator**

**Interfaces:**
- Consume: la application de la Tarea 1.
- Produce: el bot presente como miembro del servidor de Discord (necesario para asignarle
  permisos de canal en la Tarea 3).

- [ ] **Paso 1: Generar la URL de invitación**
  - En **OAuth2 → URL Generator**, marcar el scope: ✅ `bot`.
  - En **Bot Permissions** que aparece abajo, marcar solo lo mínimo:
    - ✅ View Channels
    - ✅ Send Messages
    - ✅ Read Message History
  - Copiar la **URL generada** al final de la página.

- [ ] **Paso 2: Autorizar el bot en el servidor**
  - Abrir la URL en el navegador → elegir **tu servidor de Discord** → Authorize → completar
    el captcha.

- [ ] **Verificación:**
  - El bot `Consola MC` aparece en la lista de miembros del servidor (offline por ahora, es
    normal: recién se conecta cuando arranque DiscordSRV en la Tarea 5).

---

### Tarea 3: Crear el canal privado `#consola-de-minecraft` con permisos correctos

**Dónde:** tu servidor de Discord.

**Interfaces:**
- Consume: el bot presente en el servidor (Tarea 2), el rol de moderadores.
- Produce: el **ID del canal** `#consola-de-minecraft` (se usa en la Tarea 5).

- [ ] **Paso 1 (si no existe): crear el rol de moderadores**
  - Ajustes del servidor → **Roles** → crear rol `Moderadores` (o el que ya uses) y
    asignarlo a las personas que deben ver la consola.

- [ ] **Paso 2: Crear el canal de texto**
  - Crear canal de texto con nombre `consola de minecraft` (Discord lo normaliza a
    `consola-de-minecraft`).
  - Al crearlo, marcarlo como **Canal privado** si Discord lo ofrece (deniega `@everyone`).

- [ ] **Paso 3: Configurar los permisos del canal (overwrites)**
  - Editar canal → **Permisos**:
    - **@everyone**: `View Channel` → ❌ (denegado).
    - **Rol `Moderadores`**: `View Channel` → ✅ ; `Send Messages` → ❌ (deny, esto lo hace
      **solo lectura**) ; `Read Message History` → ✅.
    - **Bot `Consola MC`** (agregar el bot como miembro/rol en los overwrites del canal):
      `View Channel` → ✅ ; `Send Messages` → ✅. *(El bot sí necesita escribir; los humanos no.)*

- [ ] **Paso 4: Copiar el ID del canal**
  - Con Modo Desarrollador activado: click derecho sobre `#consola-de-minecraft` →
    **Copiar ID del canal**. Guardarlo para la Tarea 5.

- [ ] **Verificación:**
  - Un usuario **sin** rol Moderadores **no ve** el canal.
  - Un **Moderador** ve el canal pero, al intentar escribir, Discord se lo impide (read-only).
  - Tenés el **ID del canal** copiado.

---

### Tarea 4: Instalar DiscordSRV en Aternos y generar el config

**Dónde:** panel de Aternos del server.

**Interfaces:**
- Produce: el archivo `plugins/DiscordSRV/config.yml` en el server (se edita en la Tarea 5).

- [ ] **Paso 1: Instalar el plugin**
  - Panel de Aternos → **Software → Plugins**.
  - Buscar **DiscordSRV** → seleccionar la versión compatible con tu versión de Minecraft →
    **Install**.

- [ ] **Paso 2: Generar los archivos de config**
  - **Arrancar el server** una vez (Start) y esperar a que quede completamente iniciado.
    En el primer arranque DiscordSRV genera `plugins/DiscordSRV/config.yml`.
  - (En la consola de Aternos vas a ver un warning de DiscordSRV diciendo que falta el token:
    es normal, lo configuramos en la Tarea 5.)

- [ ] **Verificación:**
  - En el **file manager** de Aternos existe la carpeta `plugins/DiscordSRV/` con el archivo
    `config.yml` dentro.

---

### Tarea 5: Configurar `config.yml` (solo lo necesario) y reiniciar

**Files:**
- Modify: `plugins/DiscordSRV/config.yml` (en el file manager de Aternos)

**Interfaces:**
- Consume: el **token** (Tarea 1) y el **ID del canal** (Tarea 3).

- [ ] **Paso 1: Abrir el config**
  - File manager de Aternos → `plugins/DiscordSRV/config.yml` → editar.

- [ ] **Paso 2: Poner el token del bot**
  - Buscar la línea `BotToken:` y pegar el token de la Tarea 1 entre comillas:
    ```yaml
    BotToken: "PEGA-AQUI-EL-TOKEN-DEL-BOT-2"
    ```

- [ ] **Paso 3: Desactivar el canal de chat público**
  - Buscar la línea `Channels:` (por defecto trae algo como `Channels: {"global": "0000..."}`)
    y dejarla **vacía**:
    ```yaml
    Channels: {}
    ```

- [ ] **Paso 4: Configurar el canal de consola**
  - Buscar la línea `DiscordConsoleChannelId:` y poner el ID del canal de la Tarea 3
    entre comillas:
    ```yaml
    DiscordConsoleChannelId: "PEGA-AQUI-EL-ID-DEL-CANAL-CONSOLA"
    ```

- [ ] **Paso 5: Guardar y reiniciar**
  - Guardar el archivo → en el panel, **Restart** del server para que DiscordSRV recargue
    el config.

- [ ] **Verificación:**
  - El bot `Consola MC` pasa a **online** en la lista de miembros de Discord.
  - En la consola de Aternos DiscordSRV ya **no** muestra el warning del token.

---

### Tarea 6: Verificación end-to-end

**Objetivo:** confirmar que todo el flujo funciona como pide el spec.

- [ ] **Paso 1: El log fluye**
  - Con el server encendido, entrar al Minecraft (o pedirle a alguien que entre) y **escribir
    algo en el chat**.
  - Confirmar que en `#consola-de-minecraft` aparecen: el **join**, el **mensaje de chat**, y
    al salir, el **leave**.

- [ ] **Paso 2: Aparecen eventos del server**
  - Confirmar que también se ven líneas de consola del server (arranque de mundo, comandos,
    warnings) — es decir, el log completo, no solo el chat.

- [ ] **Paso 3: Permisos correctos**
  - Un usuario **sin** rol Moderadores no ve el canal.
  - Un **Moderador** ve el canal pero **no puede escribir** en él.

- [ ] **Paso 4: Aislamiento del bot de estado**
  - Confirmar que `#mods-logs` sigue funcionando igual con el `mc-status-bot` (no se rompió
    nada) y que la consola nueva es un canal aparte.

- [ ] **Listo:** los logs corren en Discord. 🎉

---

## Self-Review (cobertura del spec)

- **Canal privado solo-mods, solo lectura** → Tarea 3 (permisos) + Tarea 6 (verificación). ✓
- **Todo el log en una vía (chat, joins, muertes, comandos, errores)** → Tarea 5 (`DiscordConsoleChannelId`) + Tarea 6. ✓
- **Sin chat público / sin bidireccional** → Tarea 5 (`Channels: {}`). ✓
- **Sin ejecución de comandos** → Tarea 3 (mods sin Send Messages = read-only). ✓
- **Bot #2 con token propio + intents** → Tareas 1 y 2. ✓
- **Instalación en Aternos (Paper)** → Tarea 4. ✓
- **mc-status-bot no se toca** → ninguna tarea modifica el repo Node. ✓
- **Token secreto, nunca al repo** → Global Constraints + Tarea 1 Paso 4. ✓

Sin placeholders de plan (los `PEGA-AQUI-...` son marcadores de secretos reales que el
mantenedor pega en su config privado de Aternos, no en el repo).
