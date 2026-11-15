import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStats, parseUA } from '../stats.js';

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const vid = 'a'.repeat(16), sid = 'sess123456';
test('parseUA : robots ignorés, appareil reconnu', () => {
  assert.equal(parseUA('Googlebot/2.1'), null);
  assert.deepEqual(parseUA(UA), { os: 'Android', br: 'Chrome', mobile: true });
});
test('visiteurs, pages, durée et favoris', () => {
  let t = Date.parse('2026-11-15T10:00:00Z');
  const s = createStats(fs.mkdtempSync(path.join(os.tmpdir(), 'st-')), { now: () => t });
  assert.ok(s.track({ type: 'hello', vid, sid, pwa: true, favs: ['4563:11957'] }, UA));
  s.track({ type: 'view', vid, sid, page: 'equipe:4563:11957' }, UA);
  t += 15e3; s.track({ type: 'ping', vid, sid }, UA);
  t += 15e3; s.track({ type: 'ping', vid, sid }, UA);
  s.track({ type: 'fav', vid, sid, team: '4564:11953', on: true }, UA);
  const r = s.summary({ team: (x) => 'T' + x, object: (k) => k });
  assert.equal(r.visitors.today, 1); assert.equal(r.sessions.today, 1); assert.equal(r.views.today, 1);
  assert.equal(r.avgSessionSec, 30); assert.equal(r.online, 1); assert.equal(r.pwaShare, 100);
  assert.deepEqual(r.people[0].favs.sort(), ['T4563:11957', 'T4564:11953']);
  assert.equal(r.favTeams[0].visitors, 1); assert.equal(r.objects[0].key, 'equipe:4563:11957');
  assert.equal(JSON.stringify(r).includes('Mozilla'), false);
});
test('entrées invalides et robots refusés', () => {
  const s = createStats(fs.mkdtempSync(path.join(os.tmpdir(), 'st-')));
  assert.equal(s.track({ type: 'view', vid: 'x', sid, page: 'home' }, UA), false);
  assert.equal(s.track({ type: 'view', vid, sid, page: 'home' }, 'Googlebot'), false);
  assert.ok(s.track({ type: 'view', vid, sid, page: 'home' }, UA));
  assert.equal(s.track({ type: 'view', vid, sid, page: '<script>' }, UA), true);
  assert.equal(s.summary().views.today, 1);
});
