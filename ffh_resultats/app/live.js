// Suivi collaboratif des matchs en direct (non officiel). Chaque spectateur-saisisseur a son propre compteur ;
// un but est « confirmé » quand plusieurs saisisseurs indépendants l'ont vu (même équipe, même quart-temps).
import fs from 'node:fs';
import path from 'node:path';

export const PERIODS = ['Q1', 'Q2', 'Q3', 'Q4', 'PAUSE', 'END'];
const VID = /^[a-f0-9]{16,32}$/;
const KEEP = 36 * 3600e3, MAX_REPORTERS = 30, MAX_GOALS = 30;

export function aggregate(rec, now = Date.now()) {
  const reps = Object.entries(rec?.r || {}).filter(([, r]) => now - r.seen < KEEP && (r.g.length || r.p));
  const n = reps.length;
  const thr = reps.filter(([, r]) => r.g.length).length >= 2 ? 2 : 1;
  // buts : pour chaque (équipe, quart-temps), le n-ième but est soutenu par les saisisseurs ayant au moins n buts
  const goals = [];
  for (const side of [0, 1]) for (const q of [1, 2, 3, 4]) {
    const per = reps.map(([, r]) => r.g.filter((g) => g.s === side && g.q === q).sort((a, b) => a.t - b.t));
    const max = Math.max(0, ...per.map((a) => a.length));
    for (let i = 0; i < max; i++) {
      const sup = per.filter((a) => a.length > i);
      goals.push({ side, q, support: sup.length, confirmed: sup.length >= thr, t: Math.min(...sup.map((a) => a[i].t)) });
    }
  }
  goals.sort((a, b) => a.q - b.q || a.t - b.t);
  const score = [0, 0], pending = [0, 0];
  for (const g of goals) (g.confirmed ? score : pending)[g.side]++;
  // période : vote majoritaire, à égalité le plus récent
  const votes = {};
  for (const [, r] of reps) if (r.p) { const v = (votes[r.p] ||= { n: 0, t: 0 }); v.n++; v.t = Math.max(v.t, r.pt || 0); }
  const best = Object.entries(votes).sort((a, b) => b[1].n - a[1].n || b[1].t - a[1].t)[0];
  return { period: best ? best[0] : null, votes: best ? best[1].n : 0, reporters: n, score, pending, goals, updated: Math.max(0, ...reps.map(([, r]) => r.seen)) || null };
}

export function createLive(dir, { now = () => Date.now() } = {}) {
  const file = path.join(dir, 'live.json');
  let S = {}; // matchId -> { r: { vid: { g:[{s,q,t}], p, pt, seen } } }
  try { S = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  let dirty = false;
  const prune = () => { for (const [id, rec] of Object.entries(S)) { for (const [v, r] of Object.entries(rec.r)) if (now() - r.seen > KEEP) delete rec.r[v]; if (!Object.keys(rec.r).length) delete S[id]; } };

  function report(matchId, vid, body) {
    if (!VID.test(vid || '')) return { error: 'identifiant invalide' };
    const rec = (S[matchId] ||= { r: {} });
    if (!rec.r[vid] && Object.keys(rec.r).length >= MAX_REPORTERS) return { error: 'trop de saisisseurs sur ce match' };
    const me = (rec.r[vid] ||= { g: [], p: null, pt: 0, seen: now() });
    const t = now();
    switch (body.action) {
      case 'goal': {
        const side = body.side, q = body.q;
        if (![0, 1].includes(side) || ![1, 2, 3, 4].includes(q)) return { error: 'but invalide' };
        if (me.g.length >= MAX_GOALS) return { error: 'limite de buts atteinte' };
        me.g.push({ s: side, q, t });
        break;
      }
      case 'undo': me.g.pop(); break;
      case 'period':
        if (!PERIODS.includes(body.p)) return { error: 'période invalide' };
        me.p = body.p; me.pt = t; break;
      case 'leave': delete rec.r[vid]; if (!Object.keys(rec.r).length) delete S[matchId]; dirty = true; return { ok: true };
      default: return { error: 'action inconnue' };
    }
    me.seen = t; dirty = true;
    return { ok: true };
  }
  const view = (matchId, vid) => {
    const rec = S[matchId]; const a = aggregate(rec, now());
    const me = vid && rec?.r[vid];
    return { ...a, mine: me ? { p: me.p, goals: me.g.map((g) => ({ side: g.s, q: g.q })) } : null };
  };
  // matchs ayant une activité récente (pour les pastilles « en direct »)
  const summary = (maxAge = 8 * 3600e3) => {
    const out = {};
    for (const [id, rec] of Object.entries(S)) {
      const a = aggregate(rec, now());
      if (!a.updated || now() - a.updated > maxAge) continue;
      out[id] = { s: a.score, pe: a.pending, p: a.period, n: a.reporters };
    }
    return out;
  };
  const reset = (id) => { delete S[id]; dirty = true; };
  const save = () => { if (!dirty) return; prune(); try { fs.writeFileSync(file, JSON.stringify(S)); dirty = false; } catch {} };
  const timer = setInterval(save, 30e3); timer.unref?.();
  return { report, view, summary, save, reset, has: (id) => !!S[id] };
}
