import test from 'node:test';
import assert from 'node:assert/strict';
import { nextDelay, liveComps } from '../schedule.js';

const M = (date, o = {}) => ({ id: 'x', date, status: 'upcoming', t1: {}, t2: {}, ...o });
const at = (s) => new Date(s).getTime(); // UTC
const MIN = 60e3, H = 3600e3;

test('pendant la fenêtre d\'un match : cadence rapide', () => {
  const ms = [M('2026-11-22 15:00:00')]; // 14h00Z
  assert.equal(nextDelay(ms, at('2026-11-22T14:10:00Z'), 5 * MIN).mode, 'live'); // 15h10 Paris
  assert.equal(nextDelay(ms, at('2026-11-22T14:10:00Z'), 5 * MIN).delay, 5 * MIN);
  assert.equal(nextDelay(ms, at('2026-11-22T17:30:00Z'), 5 * MIN).mode, 'live'); // 2h30 après le début
  assert.notEqual(nextDelay(ms, at('2026-11-22T19:30:00Z'), 5 * MIN).mode, 'live'); // 4h30 après
});
test('en semaine sans match : espacé, mais réveil avant la prochaine fenêtre', () => {
  const ms = [M('2026-11-22 15:00:00')];
  const lundi = nextDelay(ms, at('2026-11-16T09:00:00Z'), 5 * MIN);
  assert.equal(lundi.mode, 'idle'); assert.equal(lundi.delay, 6 * H); // match dans ~6 jours : pas la peine d'insister
  const mercredi = nextDelay(ms, at('2026-11-19T09:00:00Z'), 5 * MIN); // match dans ~3 jours
  assert.equal(mercredi.mode, 'idle'); assert.equal(mercredi.delay, 6 * H);
  const veille = nextDelay(ms, at('2026-11-21T20:00:00Z'), 5 * MIN); // ~17 h avant
  assert.equal(veille.mode, 'today'); assert.equal(veille.delay, 2 * H);
  const bientot = nextDelay(ms, at('2026-11-22T11:00:00Z'), 5 * MIN); // 2h30 avant la fenêtre (13h30Z)
  assert.equal(bientot.mode, 'soon'); assert.equal(bientot.delay, 30 * MIN);
  const presque = nextDelay(ms, at('2026-11-22T13:25:00Z'), 5 * MIN); // 5 min avant la fenêtre
  assert.equal(presque.delay, 5 * MIN);
});
test('aucun match à venir : cadence très lente ; matchs annulés ignorés', () => {
  assert.deepEqual(nextDelay([], Date.now()).mode, 'idle');
  assert.equal(nextDelay([M('2026-11-22 15:00:00', { status: 'cancelled' })], at('2026-11-22T14:10:00Z')).mode, 'idle');
});
test('horaire inconnu : la journée est surveillée', () => {
  const ms = [M('2026-11-22 00:00:00')];
  assert.equal(nextDelay(ms, at('2026-11-22T12:00:00Z')).mode, 'live');
});

test('liveComps : seules les compétitions ayant un match en cours', () => {
  const ms = [M('2026-11-22 15:00:00', { comp: 'A' }), M('2026-11-22 15:00:00', { comp: 'B', status: 'cancelled' }), M('2026-11-29 15:00:00', { comp: 'C' })];
  assert.deepEqual([...liveComps(ms, at('2026-11-22T14:30:00Z'))], ['A']);
  assert.equal(liveComps(ms, at('2026-11-24T10:00:00Z')).size, 0);
});
