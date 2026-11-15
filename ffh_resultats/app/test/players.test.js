import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, search, isYouthComp, pid } from '../players.js';

const comps = { 1: { id: '1', name: 'Elite HOMMES', disc: 'GAZON', sexe: 'M' }, 2: { id: '2', name: 'Championnat -15 ans', disc: 'GAZON', sexe: 'M' } };
const sheet = { p: [[{ l: '001', s: '9', n: 'DUPONT JEAN', g: 0, c: [0, 1, 0] }, { l: '002', s: 'Gardien', n: 'GK ONE', g: 1, c: [0, 0, 0] }], [{ l: '003', s: '4', n: 'MARTIN LUC', g: 0, c: [1, 0, 1] }]], sc: [[{ no: '9', n: 2 }], []] };
const m = (id, comp) => ({ id, comp, t1: { id: `${comp}:1`, name: 'A' }, t2: { id: `${comp}:2`, name: 'B' } });

test('agrégation buts et cartons', () => {
  const map = aggregate([m('10', '1'), m('11', '1')], { 10: sheet, 11: sheet }, comps);
  const r = search(map, { q: 'dupont' });
  assert.equal(r.rows[0].goals, 4); assert.equal(r.rows[0].yellow, 2); assert.equal(r.rows[0].matches, 2);
  const gk = search(map, { q: 'gk' }).rows[0]; assert.equal(gk.goals, 0);
  const luc = search(map, { q: 'martin' }).rows[0]; assert.equal(luc.green, 2); assert.equal(luc.red, 2);
});
test('jeunes exclus, licence jamais exposée', () => {
  const map = aggregate([m('12', '2')], { 12: sheet }, comps);
  assert.equal(map.size, 0);
  const ok = aggregate([m('10', '1')], { 10: sheet }, comps);
  assert.ok(!JSON.stringify(search(ok, {})).includes('001'));
  assert.equal(pid('001').length, 12);
  assert.ok(isYouthComp('Championnat -18 Filles & -15 mixte')); assert.ok(!isYouthComp('Elite HOMMES'));
});
test('recherche insensible aux accents et filtre équipe', () => {
  const map = aggregate([m('10', '1')], { 10: { ...sheet, p: [[{ l: '9', s: '1', n: 'ÉLOÏSE BÉRARD', g: 0, c: [0, 0, 0] }], []], sc: [[], []] } }, comps);
  assert.equal(search(map, { q: 'eloise berard' }).total, 1);
  assert.equal(search(map, { q: 'berard', team: '1:2' }).total, 0);
});
