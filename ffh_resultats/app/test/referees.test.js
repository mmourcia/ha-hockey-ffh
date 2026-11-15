import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateReferees, listReferees, refereeDetail } from '../referees.js';

const sheet = (o, cards) => ({ p: [[{ l: '1', s: '1', n: 'A', g: 0, c: cards }], []], o, sc: [[], []] });
test('chaque arbitre reçoit les cartons du match', () => {
  const matches = [{ id: 'm1', comp: 'c', s1: 2, s2: 1 }, { id: 'm2', comp: 'c', s1: 0, s2: 0 }];
  const sheets = {
    m1: sheet([{ l: '10', n: 'M DUPONT JEAN' }, { l: '11', n: 'M MARTIN PAUL' }], [1, 1, 0]),
    m2: sheet([{ l: '10', n: 'M DUPONT JEAN' }], [0, 0, 1]),
  };
  const agg = aggregateReferees(matches, sheets, { c: { id: 'c', name: 'Elite HOMMES' } });
  const l = listReferees(agg, { sort: 'cards' });
  assert.equal(l.totals.matches, 2);
  const d = l.rows.find((r) => r.name === 'DUPONT JEAN');
  assert.deepEqual([d.matches, d.green, d.yellow, d.red], [2, 1, 1, 1]);
  const m = l.rows.find((r) => r.name === 'MARTIN PAUL');
  assert.deepEqual([m.matches, m.green, m.yellow, m.red], [1, 1, 1, 0]);
  assert.equal(refereeDetail(agg, d.id).games.length, 2);
});
test('feuilles sans arbitre ou jeunes ignorées', () => {
  const agg = aggregateReferees([{ id: 'a', comp: 'y', s1: 1, s2: 1 }, { id: 'b', comp: 'c', s1: 1, s2: 1 }], { a: sheet([{ l: '1', n: 'X' }], [0, 0, 0]), b: sheet([], [0, 0, 0]) }, { y: { id: 'y', name: 'Championnat U13' }, c: { id: 'c', name: 'Elite' } });
  assert.equal(agg.totals.matches, 0);
});
