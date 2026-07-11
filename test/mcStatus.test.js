const { test } = require('node:test');
const assert = require('node:assert');
const { normalize, isReallyOnline, motdToText } = require('../src/mcStatus');

test('normalize marca online un server que respondio el SLP', () => {
  const data = {
    version: { name: 'Paper 1.21' },
    players: { online: 4, max: 20 },
    description: 'Bienvenido al server',
    favicon: 'data:image/png;base64,AAAA',
  };
  const s = normalize(data);
  assert.strictEqual(s.online, true);
  assert.strictEqual(s.players.online, 4);
  assert.strictEqual(s.players.max, 20);
  assert.strictEqual(s.motd, 'Bienvenido al server');
  assert.strictEqual(s.iconBase64, 'data:image/png;base64,AAAA');
});

test('motdToText aplana un MOTD con componentes y extra', () => {
  const desc = { text: 'Hola ', extra: [{ text: 'mundo' }, { text: '!' }] };
  assert.strictEqual(motdToText(desc), 'Hola mundo!');
});

test('normalize aplana el MOTD que viene como componente de chat', () => {
  const data = {
    players: { online: 1, max: 20 },
    description: { text: '❣ Jesu ❣', color: 'light_purple' },
  };
  const s = normalize(data);
  assert.strictEqual(s.motd, '❣ Jesu ❣');
  assert.strictEqual(s.online, true);
});

test('normalize detecta el fake-offline de Aternos', () => {
  const data = { players: { online: 0, max: 20 }, description: 'This server is offline.' };
  assert.strictEqual(normalize(data).online, false);
});

test('isReallyOnline es case-insensitive con el MOTD de Aternos', () => {
  assert.strictEqual(isReallyOnline({ description: { text: 'THIS SERVER IS OFFLINE.' } }), false);
});

test('normalize usa 0 y null cuando faltan datos', () => {
  const s = normalize({ description: 'hola' });
  assert.strictEqual(s.players.online, 0);
  assert.strictEqual(s.players.max, 0);
  assert.strictEqual(s.iconBase64, null);
});
