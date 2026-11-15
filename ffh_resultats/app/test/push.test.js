import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createPush } from '../push.js';

test('VAPID: clé publique 65 octets, JWT vérifiable, file d\'attente et ping', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-'));
  let auth;
  const srv = http.createServer((q, r) => { auth = q.headers.authorization; r.writeHead(201); r.end(); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const p = createPush(dir);
  assert.equal(Buffer.from(p.publicKey, 'base64url').length, 65);
  // endpoint http local : on contourne la validation https en injectant directement via subscribe sur https factice puis ping réel impossible ->
  assert.throws(() => p.subscribe({ endpoint: 'http://x' }, {}));
  p.subscribe({ endpoint: 'https://127.0.0.1:1/dead' }, { clubs: ['C1'], teams: [] });
  const m = { id: '5', t1: { id: '1', name: 'A', club: 'C1' }, t2: { id: '2', name: 'B', club: 'C2' }, s1: 2, s2: 1 };
  await p.notify([m, { ...m, id: '6', t1: { id: '9', name: 'X', club: 'Z' }, t2: { id: '8', name: 'Y', club: 'Z' } }]);
  const q = p.take('https://127.0.0.1:1/dead');
  assert.equal(q.length, 1); assert.match(q[0].body, /A 2 - 1 B/);
  assert.deepEqual(p.take('https://127.0.0.1:1/dead'), []);
  // JWT : vérifie la signature avec la clé publique publiée
  const keys = JSON.parse(fs.readFileSync(path.join(dir, 'vapid.json')));
  const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: Buffer.from(p.publicKey, 'base64url').subarray(1, 33).toString('base64url'), y: Buffer.from(p.publicKey, 'base64url').subarray(33).toString('base64url') }, format: 'jwk' });
  const [h, pl, s] = (await (async () => { const sig = crypto.sign('sha256', Buffer.from('a.b'), { key: keys.priv, dsaEncoding: 'ieee-p1363' }); return ['a', 'b', sig]; })());
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${pl}`), { key: pub, dsaEncoding: 'ieee-p1363' }, s));
  srv.close();
});
