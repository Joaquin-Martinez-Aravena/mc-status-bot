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
