// Backend FFH : proxy + cache + normalisation des API officielles (championnats.ffhockey.org/rest2)
// Zéro dépendance. Usage : node server.js  (PORT=8080)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createPush } from './push.js';
import { norm } from './text.js';
import { compactSheet, aggregate, search as searchPlayers, isYouthComp } from './players.js';
import { normMatch, normComp, normStandings, normScorers, parseSheet, parseNewsHtml } from './lib.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(ROOT, 'public');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA, { recursive: true });
const PORT = +process.env.PORT || 8080;
const UP = 'https://championnats.ffhockey.org/rest2/';
const UA = 'FFH-Resultats-PWA/1.0';
const INCLUDE_YOUTH = process.env.INCLUDE_YOUTH === 'true';
const push = createPush(DATA);
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

async function buildIndex(season) {
  const t0 = Date.now();
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
async function refresh(season) {
  if (health.refreshing) return; health.refreshing = true;
  const t0 = Date.now();
  try {
    const prev = store[season]; const next = await buildIndex(season);
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
    note(health.refreshes, { at: health.lastOk, ok: true, ms: Date.now() - t0, matches: next.matches.length, changed: changedN });
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
  const todo = idx.matches.filter((m) => m.status === 'played' && m.sheet && !m.bye && !sheets[m.id] && cm[m.comp] && (INCLUDE_YOUTH || !isYouthComp(cm[m.comp].name)));
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
function players(season) {
  const idx = store[season]; const key = `${idx.version}:${Object.keys(sheets).length}:${INCLUDE_YOUTH}`;
  if (playersIdx.key !== key) playersIdx = { key, map: aggregate(idx.matches, sheets, compsMap(idx), { includeYouth: INCLUDE_YOUTH }) };
  return playersIdx.map;
}
const coverage = (season) => { const idx = store[season]; const cm = compsMap(idx); const elig = idx.matches.filter((m) => m.status === 'played' && m.sheet && !m.bye && cm[m.comp] && (INCLUDE_YOUTH || !isYouthComp(cm[m.comp].name))); return { sheets: elig.filter((m) => sheets[m.id]).length, total: elig.length, includeYouth: INCLUDE_YOUTH }; };

// ---------- news ----------
const NEWS_PAGES = ['/', '/actualites/actualite-federale.html', '/actualites/actualites-championnats.html', '/actualites/coup-de-crosse.html'];
const getNews = () => cached('news', 10 * 60e3, async () => {
  const pages = await Promise.all(NEWS_PAGES.map(async (p) => {
    const r = await fetch('https://www.ffhockey.org' + p, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; FFH-Resultats-PWA/1.0)' }, signal: AbortSignal.timeout(20e3) });
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
          const k = tok(pl.name), a = byName.get(k) || { green: 0, yellow: 0, red: 0 };
          a.green += r.green; a.yellow += r.yellow; a.red += r.red; byName.set(k, a);
        }
        for (const s of scorers) { const a = byName.get(tok(s.name)) || { green: 0, yellow: 0, red: 0 }; Object.assign(s, a); }
      } catch { for (const s of scorers) s.green = s.yellow = s.red = 0; }
      return send(req, res, 200, { standings: normStandings(st), scorers }, { 'cache-control': 'public, max-age=60' });
    }
    if (p[0] === 'match' && p[1]) {
      const r = await cached(`fm${season}${p[1]}`, 5 * 60e3, () => up('Championnats/FeuilleDeMatchHTML', { SaisonAnnee: season, RencId: p[1] }));
      if (!r?.RenduHTML) return send(req, res, 404, { error: 'Feuille de match indisponible' });
      return send(req, res, 200, parseSheet(r.RenduHTML), { 'cache-control': 'public, max-age=120' });
    }
    if (p[0] === 'players') {
      await ensure(season);
      const q = url.searchParams.get('q') || '', team = url.searchParams.get('team') || '', teams = (url.searchParams.get('teams') || '').split(',').filter(Boolean);
      const r = searchPlayers(players(season), { q, team, teams: teams.length ? teams : null });
      return send(req, res, 200, { ...r, coverage: coverage(season) }, { 'cache-control': 'public, max-age=60' });
    }
    if (p[0] === 'player' && p[1]) {
      await ensure(season);
      const pl = players(season).get(p[1]); if (!pl) return send(req, res, 404, { error: 'Joueur introuvable' });
      const idx = store[season]; const byId = Object.fromEntries(idx.matches.map((m) => [m.id, m]));
      return send(req, res, 200, { id: pl.id, name: pl.name, rows: [...pl.rows.values()], games: pl.games.map((g) => ({ ...g, match: byId[g.m] })).sort((a, b) => (b.match?.date || '').localeCompare(a.match?.date || '')) }, { 'cache-control': 'public, max-age=60' });
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
    if (p[0] === 'news') return send(req, res, 200, await getNews(), { 'cache-control': 'public, max-age=300' });
    if (p[0] === 'health') return send(req, res, 200, { ok: true, season: currentSeason, updated: store[currentSeason]?.updated });
    send(req, res, 404, { error: 'not found' });
  } catch (e) { console.error(url.pathname, e.message); send(req, res, 502, { error: 'Source FFH indisponible', detail: e.message }); }
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
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
  setInterval(() => refresh(currentSeason), REFRESH_MS);
});

// ---------- Panneau d'administration (Ingress Home Assistant, port interne uniquement) ----------
const ADMIN_PORT = +process.env.ADMIN_PORT || 0;
let probeCache = { t: 0, v: null };
async function probe() {
  if (Date.now() - probeCache.t < 20e3) return probeCache.v;
  const time = async (fn) => { const t = Date.now(); try { await fn(); return { ok: true, ms: Date.now() - t }; } catch (e) { return { ok: false, ms: Date.now() - t, error: e.message }; } };
  const v = {
    api: await time(() => up('Championnats/SaisonEnCours', {}, 1)),
    site: await time(async () => { const r = await fetch('https://www.ffhockey.org/', { method: 'HEAD', headers: { 'user-agent': 'Mozilla/5.0 (compatible; FFH-Resultats-PWA/1.0)' }, signal: AbortSignal.timeout(10e3) }); if (!r.ok) throw new Error('HTTP ' + r.status); }),
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
    refreshMs: REFRESH_MS, refreshing: health.refreshing,
    lastSync: lastAt ? new Date(lastAt).toISOString() : null, nextSync: lastAt ? new Date(lastAt + REFRESH_MS).toISOString() : null,
    state: !idx ? 'init' : last && !last.ok ? 'error' : lastAt && Date.now() - lastAt > REFRESH_MS * 3 ? 'late' : 'ok',
    counts: idx ? { comps: idx.comps.length, matches: idx.matches.length, played: idx.matches.filter((m) => m.status === 'played').length, upcoming: idx.matches.filter((m) => m.status === 'upcoming').length, clubs: idx.clubs.length, teams: new Set(idx.matches.flatMap((m) => [m.t1.id, m.t2.id])).size } : null,
    sheets: { ...cov, crawling, players: idx && cov.sheets ? players(currentSeason).size : 0 },
    probe: await probe(), news: health.news, push: push.stats(),
    refreshes: health.refreshes, changes: health.changes, errors: health.errors,
  };
}
if (ADMIN_PORT) http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const json = (c, o) => { res.writeHead(c, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
  try {
    if (u.pathname.endsWith('/status')) return json(200, await status());
    if (req.method === 'POST' && u.pathname.endsWith('/refresh')) { refresh(currentSeason); return json(202, { ok: true }); }
    if (req.method === 'POST' && u.pathname.endsWith('/crawl')) { crawlSheets(currentSeason); return json(202, { ok: true }); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(fs.readFileSync(path.join(ROOT, 'admin.html')));
  } catch (e) { json(500, { error: e.message }); }
}).listen(ADMIN_PORT, () => console.log(`Panneau d'administration (ingress) → :${ADMIN_PORT}`));
