import test from 'node:test';
import assert from 'node:assert/strict';
import { normMatch, parseSheet, parseNewsHtml, stripTags } from '../lib.js';

const comp = { id: '1' };
test('match joué', () => {
  const m = normMatch({ RencId: '9', Journee: { JourDate: '2026-09-13 11:00:00', JourLib: 'J1', JourNum: '1', PouleId: 'p' }, RencDateDerog: '2026-09-12 19:15:00', Equipe1: { EquipeId: '1', EquipeNom: 'A' }, Equipe2: { EquipeId: '2', EquipeNom: 'B' }, Scores: { RencButsEqp1: '1', RencButsEqp2: '2', RencForfait: 'N' }, FeuilleMatchDispo: 'O' }, comp);
  assert.equal(m.status, 'played'); assert.equal(m.s2, 2); assert.equal(m.date, '2026-09-12 19:15:00'); assert.equal(m.sheet, true);
});
test('match à venir et exempt', () => {
  const m = normMatch({ RencId: '9', Journee: { JourDate: '2026-12-01 11:00:00' }, Equipe1: { EquipeId: '1', EquipeNom: 'A' }, Equipe2: { EquipeId: '0', EquipeNom: null }, Scores: { RencButsEqp1: '', RencButsEqp2: '' } }, comp);
  assert.equal(m.status, 'upcoming'); assert.equal(m.bye, true); assert.equal(m.t2.name, 'Exempt');
});
test('forfait', () => {
  const m = normMatch({ RencId: '9', Equipe1: { EquipeNom: 'A' }, Equipe2: { EquipeNom: 'B' }, Scores: { RencForfait: 'O' } }, comp);
  assert.equal(m.status, 'forfeit');
});
test('feuille de match', () => {
  const row = (n, c) => `<tr><td>001</td><td><strong>${n}</strong></td><td>JOUEUR ${n}</td><td>${c}</td><td>002</td><td>Gardien</td><td>GK X</td><td></td></tr>`;
  const html = `<style>x</style><table class="orbe"><tbody>${row(7, '<span class="CartonJauneTxt"></span>')}</tbody></table><strong>Buteurs : </strong>N°7 (x1)</div><strong>Buteurs : </strong></div>`;
  const s = parseSheet(html);
  assert.equal(s.players[0][0].card, 'yellow'); assert.equal(s.players[1][0].gk, true); assert.equal(s.goals[0], 'N°7 (x1)'); assert.equal(s.cards.yellow, 1);
});
test('news', () => {
  const html = `<div class="magazine-item link-item"><img src="/images/a.jpg#joomla"><span itemprop="genre">Actu</span><time datetime="2026-11-09T11:00:00+01:00"></time><h3 itemprop="name"><a href="/actualites/x/1-a.html" itemprop="url">Titre &amp; co</a></h3></div>`;
  const n = parseNewsHtml(html); assert.equal(n.length, 1); assert.equal(n[0].title, 'Titre & co'); assert.equal(n[0].image, 'https://www.ffhockey.org/images/a.jpg');
});
test('stripTags', () => assert.equal(stripTags('<b>a&nbsp;b</b>'), 'a b'));
