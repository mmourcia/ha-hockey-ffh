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
test('deux saisisseurs : tous les buts comptent, validé quand plusieurs l\'ont vu', () => {
  const { l, tick } = mk();
  l.report('m1', A, { action: 'goal', side: 0, q: 1 }); tick(500);
  l.report('m1', B, { action: 'goal', side: 0, q: 1 }); tick(500);
  l.report('m1', A, { action: 'goal', side: 1, q: 2 });
  const v = l.view('m1');
  assert.deepEqual(v.score, [1, 1]);
  assert.equal(v.goals.find((g) => g.side === 0).support, 2); assert.equal(v.goals.find((g) => g.side === 0).confirmed, true);
  assert.equal(v.goals.find((g) => g.side === 1).confirmed, false);
  l.report('m1', C, { action: 'goal', side: 1, q: 2 });
  const w = l.view('m1'); assert.deepEqual(w.score, [1, 1]); assert.equal(w.goals.find((g) => g.side === 1).support, 2);
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

test('buteur : le plus cité parmi les saisisseurs', () => {
  const { l } = mk();
  l.report('m1', A, { action: 'goal', side: 0, q: 1, who: 'Dupont' }); l.report('m1', B, { action: 'goal', side: 0, q: 1, who: 'dupont' }); l.report('m1', C, { action: 'goal', side: 0, q: 1, who: '' });
  assert.equal(l.view('m1').goals[0].who, 'Dupont');
});
test('penalty corner : issue « arrêté » puis « but » crée le but', () => {
  const { l, tick } = mk();
  l.report('m1', A, { action: 'sp', k: 'pc', side: 1, q: 2 });
  let v = l.view('m1', A); assert.equal(v.mine.open.length, 1);
  assert.equal(v.events[0].k, 'pc'); assert.equal(v.events[0].res, null);
  l.report('m1', A, { action: 'resolve', id: v.mine.open[0].id, res: 'saved', txt: 'Belle parade' });
  v = l.view('m1', A); assert.equal(v.events[0].res, 'saved'); assert.equal(v.events[0].txt, 'Belle parade'); assert.deepEqual(v.score, [0, 0]);
  tick(10); l.report('m1', A, { action: 'sp', k: 'stroke', side: 0, q: 3 }); tick(10);
  v = l.view('m1', A); l.report('m1', A, { action: 'resolve', id: v.mine.open[0].id, res: 'but', who: 'Martin' });
  v = l.view('m1', A);
  assert.deepEqual(v.score, [1, 0]); assert.equal(v.goals[0].via, 'stroke'); assert.equal(v.goals[0].who, 'Martin');
  assert.equal(v.events.filter((e) => e.k === 'stroke').length, 0); // le stroke transformé en but n'apparaît qu'une fois
  l.report('m1', A, { action: 'undo' }); // annule le but ET le stroke lié
  v = l.view('m1', A); assert.deepEqual(v.score, [0, 0]); assert.equal(v.events.filter((e) => e.k === 'stroke').length, 0);
});
test('commentaires : nettoyage, liens refusés, modération', () => {
  const { l } = mk();
  assert.ok(l.report('m1', A, { action: 'note', txt: 'voir http://spam.example' }).error);
  assert.ok(l.report('m1', A, { action: 'note', txt: '   ' }).error);
  l.report('m1', A, { action: 'period', p: 'Q2' });
  l.report('m1', A, { action: 'note', txt: '  Belle <b>action</b>  de Léo ' });
  let v = l.view('m1'); const n = v.events.find((e) => e.k === 'note'); assert.equal(n.q, 2); assert.equal(n.txt, 'Belle b action /b de Léo');
  const [x] = l.notes(); assert.ok(l.removeNote('m1', x.id)); assert.equal(l.view('m1').events.filter((e) => e.k === 'note').length, 0);
});

test('chrono : pause puis retour sur le même quart-temps = reprise, pas remise à zéro', () => {
  const { l, tick } = mk();
  l.report('m1', A, { action: 'period', p: 'Q2' }); tick(60e3); // 1 min de jeu
  l.report('m1', A, { action: 'period', p: 'PAUSE' }); tick(120e3); // 2 min d'arrêt
  l.report('m1', A, { action: 'period', p: 'Q2' }); tick(30e3); // + 30 s
  const v = l.view('m1'); assert.equal(v.period, 'Q2'); assert.equal(v.clock.q, 2);
  const el = v.clock.acc + (v.now - v.clock.since); assert.equal(el, 90e3);
  // un Q3 démarre à 0
  l.report('m1', A, { action: 'period', p: 'Q3' }); const w = l.view('m1'); assert.equal(w.clock.acc, 0);
});
test('chrono de chaque fait de la frise', () => {
  const { l, tick } = mk();
  l.report('m1', A, { action: 'period', p: 'Q1' }); tick(5 * 60e3);
  l.report('m1', A, { action: 'goal', side: 0, q: 1 }); tick(5 * 60e3);
  l.report('m1', A, { action: 'period', p: 'PAUSE' }); tick(600e3);
  l.report('m1', A, { action: 'period', p: 'Q1' }); tick(2 * 60e3);
  l.report('m1', A, { action: 'goal', side: 1, q: 1 });
  const ev = l.view('m1').events; // le plus récent d'abord
  assert.equal(ev[0].c, 12 * 60e3); // 10 min avant la pause + 2 min après assert.equal(ev[1].c, 5 * 60e3);
});

test('buteur renseigné après coup', () => {
  const { l } = mk();
  l.report('m1', A, { action: 'goal', side: 0, q: 1 });
  assert.equal(l.view('m1').goals[0].who, '');
  assert.ok(l.report('m1', A, { action: 'who', i: 5, who: 'X' }).error);
  l.report('m1', A, { action: 'who', i: 0, who: 'HANNOIR YVAN' });
  assert.equal(l.view('m1').goals[0].who, 'HANNOIR YVAN'); assert.equal(l.view('m1', A).mine.goals[0].who, 'HANNOIR YVAN');
});

test('pause : on sait après quel quart-temps (fin Q1, mi-temps, fin Q3…)', () => {
  const { l, tick } = mk();
  l.report('m1', A, { action: 'period', p: 'Q1' }); tick(1000); l.report('m1', A, { action: 'period', p: 'PAUSE' });
  assert.equal(l.view('m1').lastQ, 1);
  tick(1000); l.report('m1', A, { action: 'period', p: 'Q2' }); tick(1000); l.report('m1', A, { action: 'period', p: 'PAUSE' });
  assert.equal(l.view('m1').lastQ, 2); assert.equal(l.summary().m1.lq, 2);
  tick(1000); l.report('m1', A, { action: 'period', p: 'Q3' });
  assert.equal(l.view('m1').lastQ, null);
});
