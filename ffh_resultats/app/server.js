// Backend FFH : proxy + cache + normalisation des API officielles (championnats.ffhockey.org/rest2)
// Zéro dépendance. Usage : node server.js  (PORT=8080)
import { buildIcs, parseTeams, parisToDate } from './ics.js';
import { createLive } from './live.js';
import { nextDelay, liveComps } from './schedule.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPush } from './push.js';
import { createStats } from './stats.js';
import { norm } from './text.js';
import { aggregateReferees, listReferees, refereeDetail, refId, cleanRefName } from './referees.js';
import { pid as pidOf, compactSheet, aggregate, search as searchPlayers, isYouthComp } from './players.js';
import { normMatch, normComp, normStandings, normScorers, parseSheet, parseNewsHtml } from './lib.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(ROOT, 'public');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA, { recursive: true });
const PORT = +process.env.PORT || 8080;
const UP = 'https://championnats.ffhockey.org/rest2/';
// identité honnête des appels sortants ; l'adresse de contact (option HA `contact_email`) n'est jamais écrite dans le code
let APP_VERSION = '1'; try { APP_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '1'; } catch {}
const CONTACT = (process.env.CONTACT_EMAIL || '').trim().replace(/[\r\n()]/g, '').slice(0, 120);
const UA = `Hockey-FFH-Resultats/${APP_VERSION}${CONTACT ? ` (contact: ${CONTACT})` : ''}`;
const UA_SITE = `Mozilla/5.0 (compatible; Hockey-FFH-Resultats/${APP_VERSION}${CONTACT ? `; contact: ${CONTACT}` : ''})`;
const INCLUDE_YOUTH = process.env.INCLUDE_YOUTH === 'true';
const push = createPush(DATA);
const usage = createStats(DATA);
const live = createLive(DATA);
// accès à la saisie en direct : code (option live_input_code) / '*' = ouverte à tous / vide = fermée
const LIVE_CODE = process.env.LIVE_INPUT_CODE || '';
const inputMode = LIVE_CODE === '*' ? 'open' : LIVE_CODE ? 'code' : 'closed';
const sha = (x) => crypto.createHash('sha256').update(String(x ?? '')).digest();
const codeOk = (c) => crypto.timingSafeEqual(sha(c), sha(LIVE_CODE));
const pinFail = new Map(); // ip -> { t, n }
const pinLimited = (ip) => { const r = pinFail.get(ip); return !!r && Date.now() - r.t < 600e3 && r.n >= 10; };
const pinFailed = (ip) => { const r = pinFail.get(ip); if (!r || Date.now() - r.t >= 600e3) pinFail.set(ip, { t: Date.now(), n: 1 }); else r.n++; };
const sse = new Map(); // matchId -> Set(res) : spectateurs connectés au flux temps réel
let sseCount = 0;
const sseBroadcast = (id) => {
  const set = sse.get(String(id)); if (!set || !set.size) return;
  const data = `data: ${JSON.stringify({ official: false, ...live.view(String(id)) })}\n\n`;
  for (const r of set) { try { r.write(data); } catch {} }
};
setInterval(() => { for (const set of sse.values()) for (const r of set) { try { r.write(': ping\n\n'); } catch {} } }, 20e3).unref();
const liveRate = new Map(); // ip -> { t, n }
const liveLimited = (ip) => { const t = Date.now(), r = liveRate.get(ip); if (!r || t - r.t > 600e3) { liveRate.set(ip, { t, n: 1 }); return false; } return ++r.n > 150; };
const health = { start: Date.now(), refreshes: [], errors: [], changes: [], news: null, refreshing: false, lastOk: null };
const note = (arr, v, n = 15) => { arr.unshift(v); arr.length = Math.min(arr.length, n); };
const REFRESH_MS = +process.env.REFRESH_MS || 5 * 60e3;

// ---------- upstream ----------
async function up(endpoint, params = {}, tries = 3) {
  const url = UP + endpoint + '?' + new URLSearchParams(params);
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(45e3) });
      const j = await r.json();
      if (j.ResponseCode === '200') return j.Response;
      if (j.ResponseCode === '203') return null; // aucun résultat
      throw new Error(`${endpoint}: ${j.ResponseCode} ${j.ResponseMessage}`);
    } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
}
async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k).catch((e) => { console.warn('warn', e.message); return null; }); } }));
  return out;
}

// ---------- petit cache TTL ----------
const memo = new Map();
async function cached(key, ttl, fn) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  if (hit?.p) return hit.p;
  const p = fn().then((v) => { memo.set(key, { v, t: Date.now() }); return v; }, (e) => { memo.delete(key); if (hit) return hit.v; throw e; });
  memo.set(key, { ...(hit || {}), p });
  return p;
}

// ---------- index principal d'une saison ----------
const store = {}; // season -> {version, updated, season, comps, matches, clubs}
let currentSeason = null;

async function buildIndex(season, prev = null, only = null) {
  const t0 = Date.now();
  if (only && prev) { // relecture ciblée : seules les compétitions ayant un match en cours (1 appel par compétition)
    const res = await pool(prev.comps.filter((c) => only.has(c.id)), 4, async (comp) => {
      const rr = await up('Championnats/ListerRencontres', { SaisonAnnee: season, ManifId: comp.id });
      return { id: comp.id, matches: Object.values(rr?.RencontresArray || {}).map((r) => normMatch(r, comp)).filter((m) => m.t1 && m.t2) };
    });
    const fresh = new Map(res.filter(Boolean).map((x) => [x.id, x.matches]));
    const matches = prev.matches.filter((m) => !fresh.has(m.comp)).concat([...fresh.values()].flat());
    const idx = { season, updated: new Date().toISOString(), comps: prev.comps, matches, clubs: prev.clubs };
    idx.version = String(matches.reduce((h, m) => (h * 31 + (m.s1 ?? -1) * 7 + (m.s2 ?? -1) * 3 + (m.status.length) + (m.date ? m.date.charCodeAt(9) : 0)) % 1e9, matches.length));
    fs.writeFileSync(path.join(DATA, `index-${season}.json`), JSON.stringify(idx));
    console.log(`index ${season} (ciblé ${fresh.size} compétitions): ${matches.length} matchs (${((Date.now() - t0) / 1e3).toFixed(0)}s)`);
    return idx;
  }
  const [champsR, clubsR] = await Promise.all([up('Championnats/ListerChamps', { SaisonAnnee: season }), up('Structures/ListerClubs', { SaisonAnnee: season })]);
  const champs = Object.values(champsR?.ChampsArray || {});
  const clubs = Object.values(clubsR?.StructuresArray || {}).map((s) => ({
    code: s.StructureCode, name: s.StructureNomCourt || s.StructureNom, full: s.StructureNom,
    dep: s.StructureCodeDepartement, region: s.StructureCodeRegion, city: s.Adresse?.AdresseCommune || null,
  }));
  const res = await pool(champs, 6, async (c) => {
    const [pr, rr] = await Promise.all([up('Championnats/ListerPoules', { SaisonAnnee: season, ManifId: c.ManifId }), up('Championnats/ListerRencontres', { SaisonAnnee: season, ManifId: c.ManifId })]);
    const comp = normComp(c, Object.values(pr?.PoulesArray || {}));
    return { comp, matches: Object.values(rr?.RencontresArray || {}).map((r) => normMatch(r, comp)) };
  });
  const ok = res.filter(Boolean);
  const comps = ok.map((x) => x.comp).filter((c) => c.poules.length);
  const matches = ok.flatMap((x) => x.matches).filter((m) => m.t1 && m.t2);
  const idx = { season, updated: new Date().toISOString(), comps, matches, clubs };
  idx.version = String(matches.reduce((h, m) => (h * 31 + (m.s1 ?? -1) * 7 + (m.s2 ?? -1) * 3 + (m.status.length) + (m.date ? m.date.charCodeAt(9) : 0)) % 1e9, matches.length));
  fs.writeFileSync(path.join(DATA, `index-${season}.json`), JSON.stringify(idx));
  console.log(`index ${season}: ${comps.length} compétitions, ${matches.length} matchs, ${clubs.length} clubs (${((Date.now() - t0) / 1e3).toFixed(0)}s)`);
  return idx;
}
async function refresh(season, only = null) {
  if (health.refreshing) return; health.refreshing = true; health.attempt = Date.now();
  const t0 = Date.now();
  try {
    const prev = store[season]; const next = await buildIndex(season, prev, only);
    if (!only) health.lastFull = Date.now();
    store[season] = next; next.gz = zlib.gzipSync(JSON.stringify(next));
    crawlSheets(season);
    let changedN = 0;
    if (prev) { // scores nouveaux ou modifiés -> Web Push
      const old = new Map(prev.matches.map((m) => [m.id, `${m.s1}-${m.s2}-${m.status}`]));
      const changed = next.matches.filter((m) => m.status === 'played' && old.has(m.id) && old.get(m.id) !== `${m.s1}-${m.s2}-${m.status}`);
      changedN = changed.length;
      changed.forEach((m) => note(health.changes, { at: new Date().toISOString(), match: `${m.t1.name} ${m.s1} - ${m.s2} ${m.t2.name}`, comp: next.comps.find((c) => c.id === m.comp)?.name }, 12));
      if (changed.length) console.log(`push: ${changed.length} score(s), ${await push.notify(changed)} notification(s)`);
    }
    health.lastOk = new Date().toISOString();
    note(health.refreshes, { at: health.lastOk, ok: true, ms: Date.now() - t0, matches: next.matches.length, changed: changedN, partial: only ? only.size : 0 });
  } catch (e) {
    console.error('refresh failed', e.message);
    note(health.refreshes, { at: new Date().toISOString(), ok: false, ms: Date.now() - t0, error: e.message });
    note(health.errors, { at: new Date().toISOString(), msg: e.message });
  } finally { health.refreshing = false; }
}
async function ensure(season) {
  if (store[season]) return store[season];
  const f = path.join(DATA, `index-${season}.json`);
  if (fs.existsSync(f)) { store[season] = JSON.parse(fs.readFileSync(f)); store[season].gz = zlib.gzipSync(JSON.stringify(store[season])); refresh(season); return store[season]; }
  await refresh(season); return store[season];
}

// ---------- feuilles de match : collecte incrémentale + agrégat joueurs ----------
const sheetFile = path.join(DATA, 'sheets.json');
let sheets = fs.existsSync(sheetFile) ? JSON.parse(fs.readFileSync(sheetFile)) : {};
let playersIdx = { key: '', map: new Map() }, crawling = false;
const compsMap = (idx) => Object.fromEntries(idx.comps.map((c) => [c.id, c]));
async function crawlSheets(season) {
  const idx = store[season]; if (!idx || crawling) return;
  const cm = compsMap(idx);
  const todo = idx.matches.filter((m) => m.status === 'played' && m.sheet && !m.bye && (!sheets[m.id] || sheets[m.id].o === undefined) && cm[m.comp] && (INCLUDE_YOUTH || !isYouthComp(cm[m.comp].name)));
  if (!todo.length) return;
  crawling = true; let n = 0;
  try {
    await pool(todo, 3, async (m) => {
      const r = await up('Championnats/FeuilleDeMatchHTML', { SaisonAnnee: season, RencId: m.id });
      if (r?.RenduHTML) sheets[m.id] = compactSheet(parseSheet(r.RenduHTML));
      if (++n % 100 === 0) fs.writeFileSync(sheetFile, JSON.stringify(sheets));
    });
    fs.writeFileSync(sheetFile, JSON.stringify(sheets));
    console.log(`feuilles: ${n} nouvelle(s), ${Object.keys(sheets).length} stockée(s)`);
  } catch (e) { console.warn('crawl', e.message); } finally { crawling = false; }
}
let refsIdx = { key: '', val: null };
function referees(season) {
  const idx = store[season]; const key = `${idx.version}:${Object.keys(sheets).length}:${INCLUDE_YOUTH}:${Object.values(sheets).filter((x) => x.o !== undefined).length}`;
  if (refsIdx.key !== key) refsIdx = { key, val: aggregateReferees(idx.matches, sheets, compsMap(idx), { includeYouth: INCLUDE_YOUTH }) };
  return refsIdx.val;
}
function players(season) {
  const idx = store[season]; const key = `${idx.version}:${Object.keys(sheets).length}:${INCLUDE_YOUTH}`;
  if (playersIdx.key !== key) playersIdx = { key, map: aggregate(idx.matches, sheets, compsMap(idx), { includeYouth: INCLUDE_YOUTH }) };
  return playersIdx.map;
}
const coverage = (season) => { const idx = store[season]; const cm = compsMap(idx); const elig = idx.matches.filter((m) => m.status === 'played' && m.sheet && !m.bye && cm[m.comp] && (INCLUDE_YOUTH || !isYouthComp(cm[m.comp].name))); return { sheets: elig.filter((m) => sheets[m.id]).length, withRefs: elig.filter((m) => sheets[m.id] && sheets[m.id].o !== undefined).length, total: elig.length, includeYouth: INCLUDE_YOUTH }; };

// ---------- news ----------
const NEWS_PAGES = ['/', '/actualites/actualite-federale.html', '/actualites/actualites-championnats.html', '/actualites/coup-de-crosse.html'];
const getNews = () => cached('news', 10 * 60e3, async () => {
  const pages = await Promise.all(NEWS_PAGES.map(async (p) => {
    const r = await fetch('https://www.ffhockey.org' + p, { headers: { 'user-agent': UA_SITE }, signal: AbortSignal.timeout(20e3) });
    return r.ok ? parseNewsHtml(await r.text()) : [];
  }).map((p) => p.catch(() => [])));
  const seen = new Map();
  for (const n of pages.flat()) if (!seen.has(n.link)) seen.set(n.link, n);
  const list = [...seen.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!list.length) { health.news = { at: new Date().toISOString(), ok: false }; throw new Error('news: aucune actualité extraite'); }
  health.news = { at: new Date().toISOString(), ok: true, count: list.length, latest: list[0].title };
  return list.slice(0, 30);
});

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
function send(req, res, code, body, headers = {}) {
  const raw = typeof body === 'string' || Buffer.isBuffer(body);
  const buf = raw ? body : JSON.stringify(body);
  const h = { 'content-type': raw ? 'text/plain' : 'application/json; charset=utf-8', ...headers };
  if (!h['content-encoding'] && buf.length > 1024 && /gzip/.test(req.headers['accept-encoding'] || '')) { h['content-encoding'] = 'gzip'; res.writeHead(code, h); return res.end(zlib.gzipSync(buf)); }
  res.writeHead(code, h); res.end(buf);
}
const api = async (req, res, url) => {
  const p = url.pathname.replace(/^\/api\//, '').split('/');
  const season = url.searchParams.get('season') || currentSeason;
  const noCache = { 'cache-control': 'no-cache' };
  try {
    if (p[0] === 'data') {
      // si quelqu'un consulte le site et que les données sont anciennes, on relit en arrière-plan (au plus une fois par 10 min)
      const mode = health.next?.mode, stale = mode === 'soon' || mode === 'today' ? 30 * 60e3 : 3 * 3600e3;
      if (!health.refreshing && health.lastFull && Date.now() - health.lastFull > stale && Date.now() - (health.attempt || 0) > 10 * 60e3) refresh(season);
      const idx = await ensure(season);
      if (url.searchParams.get('v') === idx.version) return send(req, res, 200, { unchanged: true, version: idx.version }, noCache);
      return send(req, res, 200, idx.gz, { 'content-type': 'application/json; charset=utf-8', 'content-encoding': 'gzip', ...noCache });
    }
    if (p[0] === 'poule' && p[1]) {
      const [st, sc] = await Promise.all([
        cached(`st${season}${p[1]}`, 2 * 60e3, () => up('Championnats/ClassementEquipes', { SaisonAnnee: season, PouleId: p[1] })),
        cached(`sc${season}${p[1]}`, 5 * 60e3, () => up('Championnats/ClassementButeurs', { SaisonAnnee: season, PouleId: p[1] })).catch(() => null)]);
      const scorers = normScorers(sc);
      // L'API FFH cumule les cartons (un vert compte aussi en jaune et en rouge) : on recalcule depuis les feuilles de match.
      try {
        const idx = await ensure(season);
        const compId = idx.matches.find((m) => String(m.poule) === String(p[1]))?.comp;
        const tok = (n) => norm(n).split(/\s+/).filter(Boolean).sort().join(' ');
        const byName = new Map();
        for (const pl of players(season).values()) for (const r of pl.rows.values()) if (r.comp.id === compId) {
          const k = tok(pl.name), a = byName.get(k) || { green: 0, yellow: 0, red: 0, ids: new Set() };
          a.green += r.green; a.yellow += r.yellow; a.red += r.red; a.ids.add(pl.id); byName.set(k, a);
        }
        for (const s of scorers) { const a = byName.get(tok(s.name)) || { green: 0, yellow: 0, red: 0, ids: new Set() }; const { ids, ...cards } = a; Object.assign(s, cards, { id: ids.size === 1 ? [...ids][0] : null }); } // lien vers la fiche si le joueur est identifiable sans ambiguïté
      } catch { for (const s of scorers) s.green = s.yellow = s.red = 0; }
      return send(req, res, 200, { standings: normStandings(st), scorers }, { 'cache-control': 'public, max-age=60' });
    }
    if (p[0] === 'match' && p[1]) {
      const r = await cached(`fm${season}${p[1]}`, 5 * 60e3, () => up('Championnats/FeuilleDeMatchHTML', { SaisonAnnee: season, RencId: p[1] }));
      if (!r?.RenduHTML) return send(req, res, 404, { error: 'Feuille de match indisponible' });
      const sh = parseSheet(r.RenduHTML);
      sh.officials = sh.officials.map((o) => {
        const ref = /^arbitre/i.test(o.role);
        return { role: o.role, name: ref ? cleanRefName(o.name) : o.name, id: ref ? refId({ l: o.licence, n: o.name }) : null };
      });
      // confidentialité : aucun numéro de licence dans l'API publique
      // identifiant opaque (jamais le n° de licence) pour lier le joueur à sa fiche, seulement s'il est indexé (jeunes exclus)
      await ensure(season); const known = players(season);
      sh.players = sh.players.map((side) => side.map(({ licence, ...x }) => { const id = licence ? pidOf(licence) : null; return { ...x, id: id && known.has(id) ? id : null }; }));
      sh.injuries = sh.injuries.map((t) => (t || '').replace(/\b\d{6,9}\s*-\s*/g, ''));
      sh.scorers = (sh.scorers || []).map((side, si) => side.map((g) => ({ ...g, id: (g.name && sh.players[si].find((p) => p.name === g.name)?.id) || null })));
      return send(req, res, 200, sh, { 'cache-control': 'public, max-age=120' });
    }
    if (p[0] === 'referees') {
      await ensure(season);
      const r = listReferees(referees(season), { q: url.searchParams.get('q') || '', sort: url.searchParams.get('sort') || 'matches' });
      return send(req, res, 200, { ...r, coverage: coverage(season) }, { 'cache-control': 'public, max-age=60' });
    }
    if (p[0] === 'referee' && p[1]) {
      await ensure(season);
      const d = refereeDetail(referees(season), p[1]);
      return d ? send(req, res, 200, d, { 'cache-control': 'public, max-age=60' }) : send(req, res, 404, { error: 'Arbitre introuvable' });
    }
    if (p[0] === 'players') {
      await ensure(season);
      const q = url.searchParams.get('q') || '', team = url.searchParams.get('team') || '', teams = (url.searchParams.get('teams') || '').split(',').filter(Boolean);
      const r = searchPlayers(players(season), { q, team, teams: teams.length ? teams : null, limit: Math.min(+url.searchParams.get('limit') || 60, 300), sort: url.searchParams.get('sort') || 'goals' });
      return send(req, res, 200, { ...r, coverage: coverage(season) }, { 'cache-control': 'public, max-age=60' });
    }
    if (p[0] === 'player' && p[1]) {
      await ensure(season);
      const pl = players(season).get(p[1]); if (!pl) return send(req, res, 404, { error: 'Joueur introuvable' });
      const idx = store[season]; const byId = Object.fromEntries(idx.matches.map((m) => [m.id, m]));
      return send(req, res, 200, { id: pl.id, name: pl.name, rows: [...pl.rows.values()], games: pl.games.map((g) => ({ ...g, match: byId[g.m] })).sort((a, b) => (b.match?.date || '').localeCompare(a.match?.date || '')) }, { 'cache-control': 'public, max-age=60' });
    }
    if (p[0] === 'track' && req.method === 'POST') {
      const body = await new Promise((ok, ko) => { let b = ''; req.on('data', (d) => { b += d; if (b.length > 4096) req.destroy(); }).on('end', () => ok(b)).on('error', ko); });
      let j = {}; try { j = JSON.parse(body || '{}'); } catch {}
      usage.track(j, req.headers['user-agent'] || '');
      res.writeHead(204, noCache); return res.end();
    }
    if (p[0] === 'push') {
      if (p[1] === 'key') return send(req, res, 200, { key: push.publicKey });
      const body = await new Promise((ok, ko) => { let b = ''; req.on('data', (d) => { b += d; if (b.length > 1e5) req.destroy(); }).on('end', () => ok(b)).on('error', ko); });
      const j = JSON.parse(body || '{}');
      if (req.method !== 'POST') return send(req, res, 405, { error: 'POST requis' });
      if (p[1] === 'subscribe') { push.subscribe(j.subscription, j.favs); return send(req, res, 200, { ok: true }); }
      if (p[1] === 'unsubscribe') { push.unsubscribe(j.endpoint); return send(req, res, 200, { ok: true }); }
      if (p[1] === 'pending') return send(req, res, 200, push.take(j.endpoint), noCache);
    }
    if (p[0] === 'cal.ics') {
      const idx = await ensure(season);
      const teams = parseTeams(url.searchParams.getAll('t'));
      if (!teams.length) return send(req, res, 400, 'Aucune équipe (paramètre t=id|préfixe)');
      const comps = Object.fromEntries(idx.comps.map((c) => [c.id, c]));
      const host = req.headers['x-forwarded-host'] || req.headers.host || '';
      const base = host ? `${req.headers['x-forwarded-proto'] || 'https'}://${host}` : '';
      const body = buildIcs(idx.matches, comps, teams, { base, alarm: Math.min(Math.max(+url.searchParams.get('alarm') || 0, 0), 1440), name: url.searchParams.get('name') || 'Hockey FFH' });
      return send(req, res, 200, body, { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'inline; filename="hockey-ffh.ics"', 'cache-control': 'public, max-age=600' });
    }
    if (p[0] === 'weather') {
      const city = (url.searchParams.get('city') || '').slice(0, 80), day = url.searchParams.get('day') || '';
      if (!city || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return send(req, res, 400, { error: 'city et day requis' });
      const w = await cached(`wx${city}${day}`, 3 * 3600e3, async () => {
        const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&country_code=FR&language=fr`, { signal: AbortSignal.timeout(8e3) })).json();
        const loc = g.results?.[0]; if (!loc) return null;
        const f = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=Europe%2FParis&start_date=${day}&end_date=${day}`, { signal: AbortSignal.timeout(8e3) })).json();
        const d = f.daily; if (!d?.time?.length) return null;
        return { code: d.weather_code[0], max: Math.round(d.temperature_2m_max[0]), min: Math.round(d.temperature_2m_min[0]), rain: d.precipitation_probability_max[0], wind: Math.round(d.wind_speed_10m_max[0]) };
      }).catch(() => null);
      return send(req, res, 200, w || {}, { 'cache-control': 'public, max-age=1800' });
    }
    if (p[0] === 'live') {
      const noStore = { 'cache-control': 'no-store' };
      if (!p[1]) return send(req, res, 200, live.summary(), noStore);
      const idx = await ensure(season);
      const m = p[1] === 'demo' ? { id: 'demo', status: 'upcoming', demo: true } : idx.matches.find((x) => String(x.id) === p[1]);
      if (!m || m.bye) return send(req, res, 404, { error: 'Match introuvable' });
      if (req.method === 'GET' && p[2] === 'stream') {
        if (sseCount >= 1500) return send(req, res, 503, { error: 'trop de connexions' });
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        res.write(`retry: 3000\n\ndata: ${JSON.stringify({ official: m.status === 'played', ...live.view(m.id) })}\n\n`);
        const set = sse.get(String(m.id)) || sse.set(String(m.id), new Set()).get(String(m.id)); set.add(res); sseCount++;
        req.on('close', () => { if (set.delete(res)) sseCount--; if (!set.size) sse.delete(String(m.id)); });
        return;
      }
      if (req.method === 'GET') return send(req, res, 200, { official: m.status === 'played', input: inputMode, ...live.view(m.id, req.headers['x-vid']) }, noStore);
      if (req.method !== 'POST') return send(req, res, 405, { error: 'GET ou POST' });
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      if (liveLimited(ip)) return send(req, res, 429, { error: 'Trop de saisies, patientez quelques minutes.' });
      if (inputMode === 'closed') return send(req, res, 403, { error: 'La saisie en direct est réservée pour le moment.', input: inputMode });
      if (m.status === 'played' || m.status === 'forfeit' || m.status === 'cancelled') return send(req, res, 409, { error: 'La feuille officielle est déjà publiée : saisie fermée.' });
      const start = m.demo ? new Date() : parisToDate(m.date || '');
      const timed = m.demo || (m.date || '').slice(11, 16) !== '00:00';
      const now = Date.now();
      if (!start || (process.env.LIVE_OPEN_ALWAYS ? false : timed ? (now < start - 3 * 3600e3 || now > start.getTime() + 6 * 3600e3) : (now < start - 12 * 3600e3 || now > start.getTime() + 36 * 3600e3))) return send(req, res, 409, { error: 'La saisie n’est ouverte que le jour du match (de 3 h avant à 6 h après le coup d’envoi).' });
      const body = await new Promise((ok, ko) => { let b = ''; req.on('data', (d) => { b += d; if (b.length > 2048) req.destroy(); }).on('end', () => ok(b)).on('error', ko); });
      let j = {}; try { j = JSON.parse(body || '{}'); } catch {}
      if (inputMode === 'code') {
        if (pinLimited(ip)) return send(req, res, 429, { error: 'Trop d’essais de code, patientez quelques minutes.' });
        if (!codeOk(j.pin)) { pinFailed(ip); return send(req, res, 403, { error: 'Code de saisie incorrect.', code: true, input: inputMode }); }
      }
      if (j.action === 'check') return send(req, res, 200, { ok: true, input: inputMode }, noStore);
      if (j.action === 'reset') { if (!m.demo) return send(req, res, 400, { error: 'réservé au match de démonstration' }); live.reset('demo'); sseBroadcast('demo'); return send(req, res, 200, { official: false, ...live.view('demo', j.vid) }, noStore); }
      const r = live.report(m.id, j.vid, j);
      if (r.error) return send(req, res, 400, r);
      sseBroadcast(m.id);
      return send(req, res, 200, { official: false, ...live.view(m.id, j.vid) }, noStore);
    }
    if (p[0] === 'news') return send(req, res, 200, await getNews(), { 'cache-control': 'public, max-age=300' });
    if (p[0] === 'health') return send(req, res, 200, { ok: true, season: currentSeason, updated: store[currentSeason]?.updated });
    send(req, res, 404, { error: 'not found' });
  } catch (e) { console.error(url.pathname, e.message); send(req, res, 502, { error: 'Source FFH indisponible', detail: e.message }); }
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (/^\/cal\/[\w.-]+\.ics$/.test(url.pathname)) { url.pathname = '/api/cal.ics'; return api(req, res, url); } // adresse « classique » en .ics (meilleure compatibilité Google Agenda)
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  let f = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html'); // SPA fallback
  const ext = path.extname(f);
  send(req, res, 200, fs.readFileSync(f), { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': ['.html', '.js', '.css', '.webmanifest'].includes(ext) ? 'no-cache' : 'public, max-age=86400' });
}).listen(PORT, async () => {
  console.log(`FFH Résultats → http://localhost:${PORT}`);
  const s = await up('Championnats/SaisonEnCours').catch(() => null);
  currentSeason = s?.SaisonAnnee || String(new Date().getFullYear() + (new Date().getMonth() > 6 ? 1 : 0));
  await ensure(currentSeason);
  crawlSheets(currentSeason);
  scheduleRefresh();
});
// synchronisation adaptative : cadence « en direct » (REFRESH_MS) autour des matchs, espacée en semaine / quand rien ne se passe
function scheduleRefresh() {
  const idx = store[currentSeason];
  const d = nextDelay(idx?.matches || [], Date.now(), REFRESH_MS);
  health.next = { at: Date.now() + d.delay, delay: d.delay, mode: d.mode };
  setTimeout(async () => {
    // pendant un match : on ne relit que les compétitions concernées ; relecture complète toutes les 3 h au plus tard
    const cur = store[currentSeason], live = cur ? liveComps(cur.matches) : new Set();
    const full = !live.size || !health.lastFull || Date.now() - health.lastFull > 3 * 3600e3;
    await refresh(currentSeason, full ? null : live);
    scheduleRefresh();
  }, d.delay).unref?.();
}

// ---------- Panneau d'administration (Ingress Home Assistant, port interne uniquement) ----------
const ADMIN_PORT = +process.env.ADMIN_PORT || 0;
let probeCache = { t: 0, v: null };
async function probe() {
  if (Date.now() - probeCache.t < 20e3) return probeCache.v;
  const time = async (fn) => { const t = Date.now(); try { await fn(); return { ok: true, ms: Date.now() - t }; } catch (e) { return { ok: false, ms: Date.now() - t, error: e.message }; } };
  const v = {
    api: await time(() => up('Championnats/SaisonEnCours', {}, 1)),
    site: await time(async () => { const r = await fetch('https://www.ffhockey.org/', { method: 'HEAD', headers: { 'user-agent': UA_SITE }, signal: AbortSignal.timeout(10e3) }); if (!r.ok) throw new Error('HTTP ' + r.status); }),
  };
  probeCache = { t: Date.now(), v }; return v;
}
const readPublicUrl = () => { try { return fs.readFileSync(path.join(DATA, 'public_url'), 'utf8').trim() || null; } catch { return null; } };
async function status() {
  const idx = store[currentSeason];
  const last = health.refreshes[0];
  const lastAt = health.lastOk ? Date.parse(health.lastOk) : idx ? Date.parse(idx.updated) : null;
  const cov = idx ? coverage(currentSeason) : { sheets: 0, total: 0 };
  return {
    version: process.env.APP_VERSION || 'dev', now: new Date().toISOString(), uptimeSec: Math.floor((Date.now() - health.start) / 1000),
    publicUrl: readPublicUrl(), season: currentSeason, seasonLabel: idx ? `${+currentSeason - 1}/${currentSeason}` : null,
    refreshMs: REFRESH_MS, refreshing: health.refreshing, ua: UA,
    lastSync: lastAt ? new Date(lastAt).toISOString() : null, nextSync: health.next ? new Date(health.next.at).toISOString() : lastAt ? new Date(lastAt + REFRESH_MS).toISOString() : null, syncMode: health.next?.mode || null, syncDelayMs: health.next?.delay || REFRESH_MS,
    state: !idx ? 'init' : last && !last.ok ? 'error' : lastAt && Date.now() - lastAt > Math.max(REFRESH_MS * 3, (health.next?.delay || 0) + 10 * 60e3) ? 'late' : 'ok',
    counts: idx ? { comps: idx.comps.length, matches: idx.matches.length, played: idx.matches.filter((m) => m.status === 'played').length, upcoming: idx.matches.filter((m) => m.status === 'upcoming').length, clubs: idx.clubs.length, teams: new Set(idx.matches.flatMap((m) => [m.t1.id, m.t2.id])).size } : null,
    sheets: { ...cov, crawling, players: idx && cov.sheets ? players(currentSeason).size : 0 },
    probe: await probe(), news: health.news, push: push.stats(),
    refreshes: health.refreshes, changes: health.changes, errors: health.errors,
  };
}
function usageSummary() {
  const idx = store[currentSeason]; const teams = {}, comps = {}, matches = {};
  if (idx) { idx.comps.forEach((c) => (comps[c.id] = c)); idx.matches.forEach((m) => { matches[m.id] = m; if (!m.bye) { teams[m.t1.id] = { name: m.t1.name, comp: m.comp }; teams[m.t2.id] = { name: m.t2.name, comp: m.comp }; } }); }
  const team = (id) => { const t = teams[id]; return t ? `${t.name} (${comps[t.comp]?.name || '?'})` : id; };
  const object = (k) => { const [kind, ...rest] = k.split(':'), id = rest.join(':'); if (kind === 'equipe') return '🏑 ' + team(id); if (kind === 'comp') return '🏆 ' + (comps[id]?.name || id); if (kind === 'match') { const m = matches[id]; return m ? `📋 ${m.t1.name} – ${m.t2.name}` : k; } return k; };
  return usage.summary({ team, object });
}
if (ADMIN_PORT) http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const json = (c, o) => { res.writeHead(c, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
  try {
    if (u.pathname.endsWith('/status')) return json(200, await status());
    if (u.pathname.endsWith('/usage')) return json(200, usageSummary());
    if (u.pathname.endsWith('/livenotes')) return json(200, live.notes());
    if (req.method === 'POST' && u.pathname.endsWith('/livenotes/delete')) { const b = await new Promise((ok) => { let x = ''; req.on('data', (d) => (x += d)).on('end', () => ok(x)); }); let j = {}; try { j = JSON.parse(b); } catch {} const ok = live.removeNote(String(j.match), String(j.id)); if (ok) sseBroadcast(j.match); return json(200, { ok }); }
    if (req.method === 'POST' && u.pathname.endsWith('/refresh')) { refresh(currentSeason); return json(202, { ok: true }); }
    if (req.method === 'POST' && u.pathname.endsWith('/crawl')) { crawlSheets(currentSeason); return json(202, { ok: true }); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(fs.readFileSync(path.join(ROOT, 'admin.html')));
  } catch (e) { json(500, { error: e.message }); }
}).listen(ADMIN_PORT, () => console.log(`Panneau d'administration (ingress) → :${ADMIN_PORT}`));

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { usage.save(); live.save(); } catch {} process.exit(0); });
