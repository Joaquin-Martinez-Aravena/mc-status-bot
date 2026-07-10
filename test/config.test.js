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
