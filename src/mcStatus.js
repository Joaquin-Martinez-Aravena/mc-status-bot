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
      online: apiData?.players?.online ?? 0,
      max: apiData?.players?.max ?? 0,
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
