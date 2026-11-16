// Suivi collaboratif des matchs en direct (non officiel). Chaque spectateur-saisisseur a son propre journal ;
// un but / PC / stroke est « confirmé ✓N » quand plusieurs saisisseurs indépendants l'ont vu (même équipe, même quart-temps).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PERIODS = ['Q1', 'Q2', 'Q3', 'Q4', 'PAUSE', 'END'];
export const RESULTS = ['saved', 'miss', 'but']; // arrêté, non cadré / raté, but
const VID = /^[a-f0-9]{16,32}$/;
const KEEP = 300 * 24 * 3600e3, // les saisies restent consultables après le match, jusqu'à la fin de la saison
   MAX_REPORTERS = 30, MAX_GOALS = 30, MAX_EVENTS = 60;
const rid = () => crypto.randomBytes(4).toString('hex');
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const hasLink = (s) => /https?:|www\.|\.(com|fr|net|org)\b/i.test(s);
const mode = (vals) => { const c = new Map(); for (const v of vals.filter(Boolean)) { const k = v.toLowerCase(); c.set(k, { v: c.get(k)?.v || v, n: (c.get(k)?.n || 0) + 1 }); } return [...c.values()].sort((a, b) => b.n - a.n)[0]?.v || ''; };

const isQ = (p) => /^Q[1-4]$/.test(p || '');
// quart-temps = suite de segments de jeu : « Pause » puis retour sur le même Qn reprend le chrono là où il en était
function setPeriod(me, p, t) {
  if (p === me.p) return;
  if (isQ(me.p)) { const last = me.qs[me.p]?.at(-1); if (last && last.e == null) last.e = t; }
  if (isQ(me.p)) me.lq = +me.p[1]; // dernier quart-temps joué (pour « Fin Q1 / Mi-temps / Fin Q3 »)
  me.p = p; me.pt = t;
  if (isQ(p)) (me.qs[p] ||= []).push({ f: t });
}
const elapsedAt = (segs, t) => { let s = 0; for (const g of segs || []) { if (g.f > t) break; s += Math.max(0, Math.min(g.e ?? Infinity, t) - g.f); } return s; };

export function aggregate(rec, now = Date.now()) {
  const reps = Object.entries(rec?.r || {}).filter(([, r]) => now - r.seen < KEEP && (r.g.length || r.x.length || r.p));
  const n = reps.length;
  const goals = [], sets = [];
  for (const side of [0, 1]) for (const q of [1, 2, 3, 4]) {
    const per = reps.map(([, r]) => r.g.filter((g) => g.s === side && g.q === q).sort((a, b) => a.t - b.t));
    const max = Math.max(0, ...per.map((a) => a.length));
    for (let i = 0; i < max; i++) {
      const sup = per.filter((a) => a.length > i);
      goals.push({ k: 'goal', ids: sup.map((a) => a[i].id), side, q, support: sup.length, confirmed: sup.length >= 2, t: Math.min(...sup.map((a) => a[i].t)), who: mode(sup.map((a) => a[i].who)), via: sup.map((a) => a[i].via).find(Boolean) || null });
    }
    for (const k of ['pc', 'stroke']) {
      const perx = reps.map(([, r]) => r.x.filter((e) => e.k === k && e.s === side && e.q === q).sort((a, b) => a.t - b.t));
      const mx = Math.max(0, ...perx.map((a) => a.length));
      for (let i = 0; i < mx; i++) {
        const sup = perx.filter((a) => a.length > i);
        const res = mode(sup.map((a) => a[i].res)) || null;
        if (res === 'but') continue; // représenté par le but lui-même
        sets.push({ k, ids: sup.map((a) => a[i].id), side, q, support: sup.length, confirmed: sup.length >= 2, t: Math.min(...sup.map((a) => a[i].t)), res, txt: mode(sup.map((a) => a[i].txt)) });
      }
    }
  }
  const notes = reps.flatMap(([, r]) => r.x.filter((e) => e.k === 'note').map((e) => ({ k: 'note', ids: [e.id], q: e.q || 0, t: e.t, txt: e.txt })));
  goals.sort((a, b) => a.q - b.q || a.t - b.t);
  const score = [0, 0], pending = [0, 0]; // tous les buts saisis comptent ; « confirmed » = validé par au moins 2 personnes
  for (const g of goals) score[g.side]++;
  const events = [...goals, ...sets, ...notes].sort((a, b) => b.t - a.t); // le plus récent d'abord
  const votes = {};
  for (const [, r] of reps) if (r.p) { const v = (votes[r.p] ||= { n: 0, t: 0 }); v.n++; v.t = Math.max(v.t, r.pt || 0); }
  const best = Object.entries(votes).sort((a, b) => b[1].n - a[1].n || b[1].t - a[1].t)[0];
  // début de la période : première personne à l'avoir déclarée (pour le chrono indicatif)
  const first = (r, q) => r.qs?.[q]?.[0]?.f ?? Infinity;
  let clock = null;
  if (best && isQ(best[0])) {
    const ref = reps.filter(([, r]) => r.p === best[0]).map(([, r]) => r).sort((a, b) => first(a, best[0]) - first(b, best[0]))[0];
    const sg = ref?.qs?.[best[0]] || [], open = sg.find((g) => g.e == null);
    clock = { q: +best[0][1], acc: sg.reduce((s, g) => s + (g.e != null ? g.e - g.f : 0), 0), since: open ? open.f : null };
  }
  // chrono de chaque fait : temps de jeu écoulé dans son quart-temps (référence = premier saisisseur à avoir déclaré ce quart-temps)
  const refQ = (q) => reps.map(([, r]) => r).filter((r) => r.qs?.[`Q${q}`]?.length).sort((a, b) => first(a, `Q${q}`) - first(b, `Q${q}`))[0];
  for (const e of events) { const r = e.q ? refQ(e.q) : null; e.c = r ? elapsedAt(r.qs[`Q${e.q}`], e.t) : null; }
  const pv = best && best[0] === 'PAUSE' ? reps.filter(([, r]) => r.p === 'PAUSE' && r.lq).map(([, r]) => r) : [];
  const segMs = (r) => (r.qs?.[`Q${r.lq}`] || []).reduce((s, g) => s + Math.max(0, (g.e ?? r.pt) - g.f), 0);
  const lastQMs = pv.length ? Math.max(...pv.map(segMs)) : null;
  const lqs = best && best[0] === 'PAUSE' ? reps.filter(([, r]) => r.p === 'PAUSE' && r.lq).map(([, r]) => r.lq) : [];
  const lastQ = lqs.length ? [...new Set(lqs)].sort((a, b) => lqs.filter((x) => x === b).length - lqs.filter((x) => x === a).length || b - a)[0] : null;
  return { now, period: best ? best[0] : null, lastQ, lastQMs, clock, votes: best ? best[1].n : 0, reporters: n, score, pending, goals, events, updated: Math.max(0, ...reps.map(([, r]) => r.seen)) || null };
}

export function createLive(dir, { now = () => Date.now() } = {}) {
  const file = path.join(dir, 'live.json');
  let S = {}; // matchId -> { r: { vid: { g:[], x:[], p, pt, seen } } }
  try { S = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  for (const rec of Object.values(S)) for (const r of Object.values(rec.r || {})) { r.x ||= []; for (const g of r.g || []) g.id ||= rid(); for (const e of r.x) e.id ||= rid(); if (!r.qs) { r.qs = {}; if (/^Q[1-4]$/.test(r.p || '')) r.qs[r.p] = [{ f: r.pt }]; } }
  let dirty = false;
  const prune = () => { for (const [id, rec] of Object.entries(S)) { for (const [v, r] of Object.entries(rec.r)) if (now() - r.seen > KEEP) delete rec.r[v]; if (!Object.keys(rec.r).length) delete S[id]; } };

  function report(matchId, vid, body) {
    if (!VID.test(vid || '')) return { error: 'identifiant invalide' };
    const rec = (S[matchId] ||= { r: {} });
    if (!rec.r[vid] && Object.keys(rec.r).length >= MAX_REPORTERS) return { error: 'trop de saisisseurs sur ce match' };
    const me = (rec.r[vid] ||= { g: [], x: [], qs: {}, p: null, pt: 0, seen: now() });
    const t = now();
    const room = () => me.x.length < MAX_EVENTS;
    const qOk = (q) => [1, 2, 3, 4].includes(q);
    switch (body.action) {
      case 'goal': {
        if (![0, 1].includes(body.side) || !qOk(body.q)) return { error: 'but invalide' };
        if (me.g.length >= MAX_GOALS) return { error: 'limite de buts atteinte' };
        me.g.push({ id: rid(), s: body.side, q: body.q, t, who: clean(body.who, 40) });
        break;
      }
      case 'sp': { // penalty corner / stroke
        if (!['pc', 'stroke'].includes(body.k) || ![0, 1].includes(body.side) || !qOk(body.q) || !room()) return { error: 'fait de jeu invalide' };
        me.x.push({ id: rid(), k: body.k, s: body.side, q: body.q, t, res: null, txt: '' });
        break;
      }
      case 'resolve': {
        const e = me.x.find((x) => x.id === body.id && x.k !== 'note'); if (!e || e.res) return { error: 'fait de jeu introuvable' };
        if (!RESULTS.includes(body.res)) return { error: 'issue invalide' };
        const txt = clean(body.txt, 140); if (txt && hasLink(txt)) return { error: 'les liens ne sont pas autorisés' };
        e.res = body.res; e.txt = txt;
        if (body.res === 'but') { if (me.g.length >= MAX_GOALS) return { error: 'limite de buts atteinte' }; e.gid = t; me.g.push({ id: rid(), s: e.s, q: e.q, t, who: clean(body.who, 40), via: e.k }); }
        break;
      }
      case 'note': {
        const txt = clean(body.txt, 140); if (!txt) return { error: 'commentaire vide' };
        if (hasLink(txt)) return { error: 'les liens ne sont pas autorisés' };
        if (!room()) return { error: 'limite de commentaires atteinte' };
        me.x.push({ id: rid(), k: 'note', q: /^Q[1-4]$/.test(me.p || '') ? +me.p[1] : 0, t, txt });
        break;
      }
      case 'edit': { // modifier une de MES entrées (buteur, équipe, quart-temps, issue, commentaire)
        const g = me.g.find((x) => x.id === body.id), e = me.x.find((x) => x.id === body.id);
        const it = g || e; if (!it) return { error: 'entrée introuvable' };
        if (body.side !== undefined && !g && e?.k === 'note') return { error: 'modification invalide' };
        if (body.side !== undefined) { if (![0, 1].includes(body.side)) return { error: 'équipe invalide' }; it.s = body.side; }
        if (body.q !== undefined) { if (!qOk(body.q)) return { error: 'quart-temps invalide' }; it.q = body.q; }
        if (g && body.who !== undefined) g.who = clean(body.who, 40);
        if (e && body.txt !== undefined) { const txt = clean(body.txt, 140); if (txt && hasLink(txt)) return { error: 'les liens ne sont pas autorisés' }; if (e.k === 'note' && !txt) return { error: 'commentaire vide' }; e.txt = txt; }
        if (e && e.k !== 'note' && body.res !== undefined && ['saved', 'miss'].includes(body.res)) e.res = body.res;
        if (g && g.via) { const link = me.x.find((x) => x.gid === g.t); if (link) { link.s = g.s; link.q = g.q; } }
        break;
      }
      case 'del': { // supprimer une de MES entrées
        const gi = me.g.findIndex((x) => x.id === body.id);
        if (gi >= 0) { const g = me.g[gi]; me.g.splice(gi, 1); if (g.via) me.x = me.x.filter((e) => e.gid !== g.t); }
        else { const n = me.x.length; me.x = me.x.filter((e) => e.id !== body.id || e.gid); if (me.x.length === n) return { error: 'entrée introuvable' }; }
        break;
      }
      case 'who': { // renseigner (ou corriger) le buteur d'un de MES buts
        const g = me.g[body.i]; if (!g) return { error: 'but introuvable' };
        g.who = clean(body.who, 40); break;
      }
      case 'undo': {
        const lastG = me.g.at(-1), lastX = [...me.x].reverse().find((e) => !e.gid);
        if (lastG && (!lastX || lastG.t >= lastX.t)) { me.g.pop(); if (lastG.via) me.x = me.x.filter((e) => e.gid !== lastG.t); }
        else if (lastX) me.x = me.x.filter((e) => e !== lastX);
        break;
      }
      case 'period':
        if (!PERIODS.includes(body.p)) return { error: 'période invalide' };
        setPeriod(me, body.p, t); break;
      case 'leave': delete rec.r[vid]; if (!Object.keys(rec.r).length) delete S[matchId]; dirty = true; return { ok: true };
      default: return { error: 'action inconnue' };
    }
    me.seen = t; dirty = true;
    return { ok: true };
  }
  const view = (matchId, vid) => {
    const rec = S[matchId]; const a = aggregate(rec, now());
    const me = vid && rec?.r[vid];
    return { ...a, mine: me ? { p: me.p, goals: me.g.map((g) => ({ id: g.id, side: g.s, q: g.q, who: g.who })), items: me.x.filter((e) => !e.gid).map((e) => ({ id: e.id, k: e.k })), open: me.x.filter((e) => e.k !== 'note' && !e.res).map((e) => ({ id: e.id, k: e.k, side: e.s, q: e.q })), notes: me.x.filter((e) => e.k === 'note').length } : null };
  };
  const summary = (maxAge = 8 * 3600e3) => {
    const out = {};
    for (const [id, rec] of Object.entries(S)) {
      const a = aggregate(rec, now());
      if (!a.updated || now() - a.updated > maxAge) continue;
      out[id] = { s: a.score, pe: a.pending, p: a.period, lq: a.lastQ, lm: a.lastQMs, ck: a.clock, n: a.reporters };
    }
    return out;
  };
  // modération : liste et suppression des commentaires
  const notes = () => Object.entries(S).flatMap(([m, rec]) => Object.entries(rec.r).flatMap(([v, r]) => r.x.filter((e) => e.k === 'note').map((e) => ({ match: m, who: v.slice(0, 6), id: e.id, t: e.t, txt: e.txt })))).sort((a, b) => b.t - a.t).slice(0, 100);
  const removeNote = (match, id) => { const rec = S[match]; if (!rec) return false; let ok = false; for (const r of Object.values(rec.r)) { const n = r.x.length; r.x = r.x.filter((e) => !(e.k === 'note' && e.id === id)); ok ||= r.x.length !== n; } if (ok) dirty = true; return ok; };
  const reset = (id) => { delete S[id]; dirty = true; };
  const save = () => { if (!dirty) return; prune(); try { fs.writeFileSync(file, JSON.stringify(S)); dirty = false; } catch {} };
  const timer = setInterval(save, 30e3); timer.unref?.();
  return { report, view, summary, save, reset, notes, removeNote, has: (id) => !!S[id] };
}
