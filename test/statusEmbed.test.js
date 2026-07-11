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

test('buildStatusEmbed incluye el campo Conectados con los nombres', () => {
  const { embed } = buildStatusEmbed({
    online: true,
    players: { online: 2, max: 20, list: ['HayserS_', 'Feruub'] },
    motd: 'Hola',
    iconBase64: null,
  });
  const field = embed.data.fields.find((f) => f.name === 'Conectados');
  assert.ok(field, 'deberia existir el campo Conectados');
  assert.strictEqual(field.value, 'HayserS_, Feruub');
});

test('buildStatusEmbed omite Conectados cuando la lista viene vacia', () => {
  const { embed } = buildStatusEmbed({
    online: true, players: { online: 0, max: 20, list: [] }, motd: 'Hola', iconBase64: null,
  });
  const field = embed.data.fields.find((f) => f.name === 'Conectados');
  assert.strictEqual(field, undefined);
});
