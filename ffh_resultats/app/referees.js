// Statistiques des arbitres, calculées à partir des feuilles de match stockées.
// Règle : pour un match arbitré à deux, les cartons du match comptent pour CHAQUE arbitre.
import { pid, isYouthComp } from './players.js';
import { norm } from './text.js';

export const cleanRefName = (n = '') => n.replace(/^(M\.?|MME|MLLE|MR)\s+/i, '').trim();
export const refId = (o) => pid('ref:' + (o.l || norm(o.n)));

const sumCards = (sh) => (sh.p || []).flat().reduce((a, x) => { a[0] += x.c[0]; a[1] += x.c[1]; a[2] += x.c[2]; return a; }, [0, 0, 0]);

export function aggregateReferees(matches, sheets, compsById, { includeYouth = false } = {}) {
  const refs = new Map();
  const totals = { matches: 0, green: 0, yellow: 0, red: 0, goals: 0 };
  for (const m of matches) {
    const sh = sheets[m.id]; if (!sh || m.bye || !sh.o?.length) continue;
    const comp = compsById[m.comp]; if (!comp || (!includeYouth && isYouthComp(comp.name))) continue;
    const [g, y, r] = sumCards(sh);
    const goals = (m.s1 || 0) + (m.s2 || 0);
    totals.matches++; totals.green += g; totals.yellow += y; totals.red += r; totals.goals += goals;
    const seen = new Set();
    for (const o of sh.o) {
      const id = refId(o); if (seen.has(id)) continue; seen.add(id);
      let ref = refs.get(id); if (!ref) refs.set(id, (ref = { id, name: cleanRefName(o.n), matches: 0, green: 0, yellow: 0, red: 0, goals: 0, comps: new Map(), games: [] }));
      ref.matches++; ref.green += g; ref.yellow += y; ref.red += r; ref.goals += goals;
      let c = ref.comps.get(m.comp); if (!c) ref.comps.set(m.comp, (c = { comp: { id: comp.id, name: comp.name, disc: comp.disc, sexe: comp.sexe }, matches: 0, green: 0, yellow: 0, red: 0 }));
      c.matches++; c.green += g; c.yellow += y; c.red += r;
      ref.games.push({ m: m.id, comp: m.comp, date: m.date, c: [g, y, r], with: sh.o.filter((x) => refId(x) !== id).map((x) => cleanRefName(x.n)) });
    }
  }
  return { refs, totals };
}

const row = (r) => ({ id: r.id, name: r.name, matches: r.matches, green: r.green, yellow: r.yellow, red: r.red, cards: r.green + r.yellow + r.red, perMatch: r.matches ? +((r.green + r.yellow + r.red) / r.matches).toFixed(2) : 0, goalsPerMatch: r.matches ? +(r.goals / r.matches).toFixed(1) : 0 });

export function listReferees({ refs, totals }, { q = '', sort = 'matches', minMatches = 1 } = {}) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  let rows = [...refs.values()].filter((r) => r.matches >= minMatches && words.every((w) => norm(r.name).includes(w))).map(row);
  const keys = { matches: 'matches', cards: 'cards', red: 'red', yellow: 'yellow', green: 'green', perMatch: 'perMatch' };
  const k = keys[sort] || 'matches';
  rows.sort((a, b) => b[k] - a[k] || b.matches - a.matches || a.name.localeCompare(b.name));
  const cards = totals.green + totals.yellow + totals.red;
  return { total: rows.length, rows, totals: { ...totals, cards, perMatch: totals.matches ? +(cards / totals.matches).toFixed(2) : 0, referees: refs.size } };
}

export function refereeDetail({ refs }, id) {
  const r = refs.get(id); if (!r) return null;
  return { ...row(r), comps: [...r.comps.values()].map((c) => ({ ...c, cards: c.green + c.yellow + c.red })).sort((a, b) => b.matches - a.matches), games: r.games.sort((a, b) => (b.date || '').localeCompare(a.date || '')) };
}
