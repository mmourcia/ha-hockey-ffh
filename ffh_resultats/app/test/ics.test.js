import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, parisToDate, parseTeams } from '../ics.js';

test('parisToDate : heure d\'hiver et d\'été', () => {
  assert.equal(parisToDate('2026-11-15 16:00:00').toISOString(), '2026-11-15T15:00:00.000Z');
  assert.equal(parisToDate('2026-07-12 16:00:00').toISOString(), '2026-07-12T14:00:00.000Z');
  assert.equal(parisToDate('2026-03-29 12:00:00').toISOString(), '2026-03-29T10:00:00.000Z');
});
const m = (o) => ({ id: 'r1', comp: 'c1', t1: { id: 'c1:1', name: 'PHC MARCQ-EN-BAROEUL' }, t2: { id: 'c1:2', name: 'LILLE MHC' }, date: '2026-11-15 16:00:00', status: 'upcoming', venue: 'Gondecourt', city: 'Gondecourt', ...o });
test('buildIcs : préfixe, UTC, lieu, rappel', () => {
  const s = buildIcs([m(), m({ id: 'r2', t1: { id: 'c1:8', name: 'X' }, t2: { id: 'c1:9', name: 'Y' } })], { c1: { name: 'Élite', disc: 'GAZON', sexe: 'M' } }, [{ id: 'c1:2', prefix: 'Clément – ' }], { base: 'https://h.example', alarm: 60 });
  assert.match(s, /SUMMARY:Clément – PHC MARCQ-EN-BAROEUL vs LILLE MHC/);
  assert.match(s, /DTSTART:20261115T150000Z/);
  assert.match(s, /DTEND:20261115T170000Z/);
  assert.match(s, /LOCATION:Gondecourt\\, Gondecourt/);
  assert.match(s, /TRIGGER:-PT60M/);
  assert.equal((s.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(s.endsWith('\r\n'));
});
test('buildIcs : score, annulé, journée entière', () => {
  const s = buildIcs([m({ status: 'played', s1: 3, s2: 2 }), m({ id: 'r3', status: 'cancelled', date: '2026-11-22 00:00:00' })], {}, [{ id: 'c1:2', prefix: '' }]);
  assert.match(s, /\(3-2\)/);
  assert.match(s, /DTSTART;VALUE=DATE:20261122/);
  assert.match(s, /STATUS:CANCELLED/);
});
test('parseTeams : filtre les ids invalides', () => {
  assert.deepEqual(parseTeams(['4551:11888|Clément – ', 'n’importe quoi', '12:3']), [{ id: '4551:11888', prefix: 'Clément – ' }, { id: '12:3', prefix: '' }]);
});
