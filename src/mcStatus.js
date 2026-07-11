// Capa de datos: hace un Server List Ping (SLP) directo al servidor de Minecraft,
// sin depender de APIs de terceros (mcsrvstat.us / mcstatus.io reportan mal los
// servers de Aternos porque Aternos les bloquea/resetea las consultas).
const net = require('net');

const DEFAULT_PORT = 25565;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 3;
const PROTOCOL_VERSION = 767; // 1.21; solo se usa para el handshake de status
const OFFLINE = { online: false, players: { online: 0, max: 0, list: [] }, motd: '', iconBase64: null };

// --- Codificacion del protocolo -------------------------------------------

function writeVarInt(value) {
  const bytes = [];
  let v = value;
  do {
    let temp = v & 0x7f;
    v >>>= 7;
    if (v !== 0) temp |= 0x80;
    bytes.push(temp);
  } while (v !== 0);
  return Buffer.from(bytes);
}

function writeString(str) {
  const b = Buffer.from(str, 'utf8');
  return Buffer.concat([writeVarInt(b.length), b]);
}

function packet(...bufs) {
  const body = Buffer.concat(bufs);
  return Buffer.concat([writeVarInt(body.length), body]);
}

// Lee un VarInt desde buf en offset. Devuelve null si faltan bytes.
function readVarInt(buf, offset) {
  let numRead = 0;
  let result = 0;
  let byte;
  do {
    if (offset + numRead >= buf.length) return null;
    byte = buf[offset + numRead];
    result |= (byte & 0x7f) << (7 * numRead);
    numRead++;
    if (numRead > 5) throw new Error('VarInt demasiado grande');
  } while ((byte & 0x80) !== 0);
  return { value: result, size: numRead };
}

// --- Logica de dominio -----------------------------------------------------

// Aplana el MOTD, que puede venir como string o como componente de chat
// ({ text, extra: [...] }), a texto plano.
function motdToText(desc) {
  if (desc == null) return '';
  if (typeof desc === 'string') return desc;
  let out = '';
  if (typeof desc.text === 'string') out += desc.text;
  if (Array.isArray(desc.extra)) out += desc.extra.map(motdToText).join('');
  return out;
}

// Aplica el fix de Aternos: un server suspendido puede responder con el MOTD
// "This server is offline." -> lo tratamos como offline.
function isReallyOnline(data) {
  if (!data) return false;
  const motd = motdToText(data.description).toLowerCase();
  if (motd.includes('this server is offline')) return false;
  return true;
}

// Extrae los nombres de la muestra de jugadores conectados (data.players.sample).
// Muchos servers la entregan parcial o vacia; devolvemos [] si no hay.
function extractPlayerList(data) {
  const sample = data?.players?.sample;
  if (!Array.isArray(sample)) return [];
  return sample.map((p) => p && p.name).filter((name) => typeof name === 'string');
}

// Convierte la respuesta SLP en nuestro objeto de estado normalizado.
function normalize(data) {
  return {
    online: isReallyOnline(data),
    players: {
      online: data?.players?.online ?? 0,
      max: data?.players?.max ?? 0,
      list: extractPlayerList(data),
    },
    motd: motdToText(data?.description).trim(),
    iconBase64: data?.favicon ?? null,
  };
}

// --- Ping de red -----------------------------------------------------------

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Un intento de SLP. Resuelve con el JSON de estado o rechaza en error/timeout.
function pingOnce(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let buffer = Buffer.alloc(0);
    let settled = false;
    const done = (fn, arg) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn(arg);
    };

    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => done(reject, new Error('timeout')));
    socket.on('error', (err) => done(reject, err));

    socket.on('connect', () => {
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(port, 0);
      // Handshake (next state 1 = status) + Status Request
      const handshake = packet(
        writeVarInt(0x00),
        writeVarInt(PROTOCOL_VERSION),
        writeString(host),
        portBuf,
        writeVarInt(1),
      );
      const request = packet(writeVarInt(0x00));
      socket.write(Buffer.concat([handshake, request]));
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const lenField = readVarInt(buffer, 0);
      if (!lenField) return; // falta el largo, esperar mas datos
      const total = lenField.size + lenField.value;
      if (buffer.length < total) return; // paquete incompleto, esperar
      let off = lenField.size;
      const pid = readVarInt(buffer, off);
      off += pid.size;
      const jsonLen = readVarInt(buffer, off);
      off += jsonLen.size;
      const json = buffer.slice(off, off + jsonLen.value).toString('utf8');
      try {
        done(resolve, JSON.parse(json));
      } catch (err) {
        done(reject, new Error('respuesta no-JSON'));
      }
    });
  });
}

// Consulta el estado del servidor via SLP directo, con reintentos para absorber
// el ECONNRESET transitorio de Aternos. Si todos los intentos fallan, se asume
// que el server esta offline/dormido.
async function getServerStatus(address, options = {}) {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const [host, portStr] = String(address).split(':');
  const port = parseInt(portStr, 10) || DEFAULT_PORT;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const data = await pingOnce(host, port, timeoutMs);
      return normalize(data);
    } catch (err) {
      if (attempt === retries) return { ...OFFLINE };
      await delay(500);
    }
  }
  return { ...OFFLINE };
}

module.exports = { getServerStatus, normalize, isReallyOnline, motdToText, extractPlayerList };
