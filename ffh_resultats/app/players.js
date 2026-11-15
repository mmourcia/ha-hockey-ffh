// Agrégation des joueurs (buts, cartons, matchs) à partir des feuilles de match.
// Confidentialité : le numéro de licence n'est jamais exposé (identifiant opaque haché) et les
// compétitions de jeunes (mineurs) sont exclues de l'index.
import crypto from 'node:crypto';
import { norm } from './text.js';

export const isYouthComp = (name = '') => /(\bU\s?\d{1,2}\b|(?:^|[\s(])-\s?\d{1,2}\b|moins de|jeune|mini|pouss|benjamin|minime|cadet|junior|école|ecole|hockey 5|vacances)/i.test(name);
export const pid = (licence) => crypto.createHash('sha1').update('ffh:' + licence).digest('hex').slice(0, 12);

// compacte une feuille parsée pour le stockage
export function compactSheet(s) {
  return {
    p: s.players.map((side) => side.map((x) => ({ l: x.licence, s: x.shirt, n: x.name, g: x.gk ? 1 : 0, c: [x.cd?.green || 0, x.cd?.yellow || 0, x.cd?.red || 0] }))),
    o: (s.officials || []).filter((x) => /^arbitre/i.test(x.role)).map((x) => ({ l: x.licence, n: x.name })),
    sc: s.scorers.map((side) => side.map((g) => ({ no: g.no, n: g.n }))),
  };
}

export function aggregate(matches, sheets, compsById, { includeYouth = false } = {}) {
  const players = new Map(); // id -> {id,name,rows:Map(teamId->row)}
  for (const m of matches) {
    const sh = sheets[m.id]; if (!sh || m.bye) continue;
    const comp = compsById[m.comp]; if (!comp || (!includeYouth && isYouthComp(comp.name))) continue;
    [m.t1, m.t2].forEach((team, side) => {
      const goalsByShirt = {}; (sh.sc[side] || []).forEach((g) => (goalsByShirt[g.no] = (goalsByShirt[g.no] || 0) + g.n));
      for (const x of sh.p[side] || []) {
        if (!x.l || !x.n) continue;
        const id = pid(x.l);
        let pl = players.get(id); if (!pl) players.set(id, (pl = { id, name: x.n, rows: new Map(), games: [] }));
        let r = pl.rows.get(team.id); if (!r) pl.rows.set(team.id, (r = { team: { id: team.id, name: team.name }, comp: { id: comp.id, name: comp.name, disc: comp.disc, sexe: comp.sexe }, matches: 0, goals: 0, green: 0, yellow: 0, red: 0 }));
        const goals = x.g ? 0 : goalsByShirt[x.s] || 0;
        r.matches++; r.goals += goals; r.green += x.c[0]; r.yellow += x.c[1]; r.red += x.c[2];
        pl.games.push({ m: m.id, team: team.id, goals, c: x.c });
      }
    });
  }
  return players;
}

export function search(players, { q = '', team = '', teams = null, limit = 60 }) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  const out = [];
  for (const pl of players.values()) {
    const key = norm(pl.name);
    if (words.length && !words.every((w) => key.includes(w))) continue;
    for (const r of pl.rows.values()) {
      if (team && r.team.id !== team) continue;
      if (teams && !teams.includes(r.team.id)) continue;
      out.push({ id: pl.id, name: pl.name, ...r });
    }
  }
  out.sort((a, b) => b.goals - a.goals || (b.red * 3 + b.yellow * 2 + b.green) - (a.red * 3 + a.yellow * 2 + a.green) || a.name.localeCompare(b.name));
  return { total: out.length, rows: out.slice(0, limit) };
}
