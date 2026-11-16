import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLive } from '../live.js';

const A = 'a'.repeat(24), B = 'b'.repeat(24), C = 'c'.repeat(24);
const mk = () => { let t = 1e12; const l = createLive(fs.mkdtempSync(path.join(os.tmpdir(), 'live-')), { now: () => t }); return { l, tick: (ms) => (t += ms) }; };

test('un seul saisisseur : ses buts comptent directement', () => {
  const { l, tick } = mk();
  l.report('m1', A, { action: 'period', p: 'Q1' }); tick(1000);
  l.report('m1', A, { action: 'goal', side: 0, q: 1 }); tick(1000);
  l.report('m1', A, { action: 'goal', side: 1, q: 1 });
  const v = l.view('m1', A);
  assert.deepEqual(v.score, [1, 1]); assert.equal(v.period, 'Q1'); assert.equal(v.reporters, 1); assert.deepEqual(v.mine.goals.length, 2);
});
test('deux saisisseurs : but confirmé seulement s\'il est vu par les deux', () => {
  const { l, tick } = mk();
  l.report('m1', A, { action: 'goal', side: 0, q: 1 }); tick(500);
  l.report('m1', B, { action: 'goal', side: 0, q: 1 }); tick(500);
  l.report('m1', A, { action: 'goal', side: 1, q: 2 });
  const v = l.view('m1');
  assert.deepEqual(v.score, [1, 0]); assert.deepEqual(v.pending, [0, 1]);
  assert.equal(v.goals.find((g) => g.side === 0).support, 2);
  l.report('m1', C, { action: 'goal', side: 1, q: 2 });
  assert.deepEqual(l.view('m1').score, [1, 1]);
});
test('annuler son dernier but', () => {
  const { l } = mk();
  l.report('m1', A, { action: 'goal', side: 0, q: 1 }); l.report('m1', A, { action: 'undo' });
  assert.deepEqual(l.view('m1').score, [0, 0]);
});
test('période : majorité, puis le plus récent à égalité', () => {
  const { l, tick } = mk();
  l.report('m1', A, { action: 'period', p: 'Q1' }); tick(10); l.report('m1', B, { action: 'period', p: 'Q2' });
  assert.equal(l.view('m1').period, 'Q2');
  tick(10); l.report('m1', C, { action: 'period', p: 'Q1' });
  assert.equal(l.view('m1').period, 'Q1');
});
test('validation des entrées', () => {
  const { l } = mk();
  assert.ok(l.report('m1', 'x', { action: 'join' }).error);
  assert.ok(l.report('m1', A, { action: 'goal', side: 2, q: 1 }).error);
  assert.ok(l.report('m1', A, { action: 'goal', side: 0, q: 5 }).error);
  assert.ok(l.report('m1', A, { action: 'period', p: 'Q9' }).error);
});
test('résumé et expiration', () => {
  const { l, tick } = mk();
  l.report('m1', A, { action: 'goal', side: 0, q: 1 });
  assert.deepEqual(l.summary().m1.s, [1, 0]);
  tick(9 * 3600e3); assert.equal(l.summary().m1, undefined);
});
