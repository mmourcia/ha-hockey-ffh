// Statistiques de fréquentation, anonymes : identifiant de visiteur aléatoire (aucune adresse IP, aucun nom).
// Stockage : DATA_DIR/stats.json. Conservation limitée (visiteurs 180 j, jours 120 j).
import fs from 'node:fs';
import path from 'node:path';

const DAY = 864e5, PING_CAP = 20; // secondes comptées au plus par ping
const VID = /^[a-f0-9]{16,32}$/, SID = /^[a-zA-Z0-9]{6,32}$/, PAGE = /^[a-z]{2,12}(:[\w:.-]{1,40})?$/, TEAM = /^[\w-]{1,12}:[\w-]{1,12}$/;
const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

export function parseUA(ua = '') {
  if (/bot|crawl|spider|preview|monitor|curl|wget|python|node-fetch|headless/i.test(ua)) return null;
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux|X11/i.test(ua) ? 'Linux' : 'Autre';
  const br = /Edg\//i.test(ua) ? 'Edge' : /OPR\/|Opera/i.test(ua) ? 'Opera' : /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/i.test(ua) ? 'Firefox' : /Chrome|CriOS/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'Autre';
  return { os, br, mobile: /Android|iPhone|iPad|iPod|Mobile/i.test(ua) };
}

export function createStats(dir, { now = () => Date.now() } = {}) {
  const file = path.join(dir, 'stats.json');
  let S = { n: 0, visitors: {}, daily: {}, pages: {}, objects: {}, favLog: [] };
  try { S = { ...S, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch {}
  const sessions = new Map(); // sid -> { vid, page, last }
  const rate = new Map(); // vid -> { t, n }
  let dirty = false;

  const day = () => (S.daily[dayKey(now())] ||= { views: 0, sessions: 0, seconds: 0, vids: [] });
  const touchVisitor = (vid, ua, extra = {}) => {
    let v = S.visitors[vid];
    if (!v) {
      if (Object.keys(S.visitors).length > 20000) return null;
      v = S.visitors[vid] = { n: ++S.n, first: now(), last: now(), visits: 0, views: 0, seconds: 0, favs: [], os: ua.os, br: ua.br, mobile: ua.mobile, pwa: false };
    }
    v.last = now(); v.os = ua.os; v.br = ua.br; v.mobile = ua.mobile;
    if (extra.pwa !== undefined) v.pwa = !!extra.pwa;
    const d = day(); if (!d.vids.includes(vid)) d.vids.push(vid);
    return v;
  };
  const limited = (vid) => { const t = now(), r = rate.get(vid); if (!r || t - r.t > 60e3) { rate.set(vid, { t, n: 1 }); return false; } return ++r.n > 90; };
  const count = (map, key, field, inc = 1) => { const o = (map[key] ||= { views: 0, seconds: 0 }); o[field] += inc; };

  function track(body, uaString) {
    const ua = parseUA(uaString); if (!ua) return false;
    const { vid, sid, type } = body || {};
    if (!VID.test(vid || '') || !SID.test(sid || '') || limited(vid)) return false;
    const v = touchVisitor(vid, ua, { pwa: body.pwa }); if (!v) return false;
    let ses = sessions.get(sid);
    if (type === 'hello') {
      if (!ses) { sessions.set(sid, (ses = { vid, page: null, last: now() })); v.visits++; day().sessions++; }
      if (Array.isArray(body.favs)) v.favs = body.favs.filter((t) => TEAM.test(t)).slice(0, 30);
    } else if (!ses) { sessions.set(sid, (ses = { vid, page: null, last: now() })); v.visits++; day().sessions++; }
    ses.last = now();
    if (type === 'view' && PAGE.test(body.page || '')) {
      ses.page = body.page; v.views++; day().views++;
      const sec = body.page.split(':')[0];
      count(S.pages, sec, 'views');
      if (body.page.includes(':')) count(S.objects, body.page, 'views');
    } else if (type === 'ping') {
      const add = Math.min(PING_CAP, Math.max(0, Math.round((now() - (ses.lastPing || now())) / 1000)) || 0);
      ses.lastPing = now();
      if (ses.page && add) { v.seconds += add; day().seconds += add; count(S.pages, ses.page.split(':')[0], 'seconds', add); if (ses.page.includes(':')) count(S.objects, ses.page, 'seconds', add); }
    } else if (type === 'fav' && TEAM.test(body.team || '')) {
      const on = !!body.on, i = v.favs.indexOf(body.team);
      if (on && i < 0) v.favs.push(body.team); else if (!on && i >= 0) v.favs.splice(i, 1);
      S.favLog.unshift({ at: now(), vid, team: body.team, on }); S.favLog.length = Math.min(S.favLog.length, 100);
    }
    if (type === 'hello' || type === 'view') ses.lastPing = now();
    dirty = true; return true;
  }

  function prune() {
    const t = now();
    for (const [id, v] of Object.entries(S.visitors)) if (t - v.last > 180 * DAY) delete S.visitors[id];
    for (const k of Object.keys(S.daily)) if (t - Date.parse(k) > 120 * DAY) delete S.daily[k];
    for (const [sid, s] of sessions) if (t - s.last > 30 * 60e3) sessions.delete(sid);
    for (const [k, r] of rate) if (t - r.t > 120e3) rate.delete(k);
  }
  function save() { if (!dirty) return; prune(); try { fs.writeFileSync(file, JSON.stringify(S)); dirty = false; } catch (e) { console.warn('stats', e.message); } }
  const timer = setInterval(save, 30e3); timer.unref?.();

  function summary(resolve = { team: (t) => t, object: (k) => k }) {
    const t = now(), vids = (days) => { const s = new Set(); for (let i = 0; i < days; i++) (S.daily[dayKey(t - i * DAY)]?.vids || []).forEach((x) => s.add(x)); return s.size; };
    const online = new Set(); for (const s of sessions.values()) if (t - s.last < 60e3) online.add(s.vid);
    const sumDays = (days, f) => { let n = 0; for (let i = 0; i < days; i++) n += S.daily[dayKey(t - i * DAY)]?.[f] || 0; return n; };
    const series = []; for (let i = 13; i >= 0; i--) { const k = dayKey(t - i * DAY), d = S.daily[k]; series.push({ day: k, visitors: d?.vids.length || 0, views: d?.views || 0, sessions: d?.sessions || 0, seconds: d?.seconds || 0 }); }
    const vis = Object.entries(S.visitors);
    const favCount = {}; for (const [, v] of vis) for (const f of v.favs) favCount[f] = (favCount[f] || 0) + 1;
    const dev = {}; for (const [, v] of vis) { const k = `${v.os} · ${v.br}`; dev[k] = (dev[k] || 0) + 1; }
    const sessions30 = sumDays(30, 'sessions'), secs30 = sumDays(30, 'seconds');
    return {
      online: online.size,
      visitors: { today: vids(1), week: vids(7), month: vids(30), total: vis.length },
      sessions: { today: sumDays(1, 'sessions'), week: sumDays(7, 'sessions'), month: sessions30 },
      views: { today: sumDays(1, 'views'), week: sumDays(7, 'views'), month: sumDays(30, 'views') },
      avgSessionSec: sessions30 ? Math.round(secs30 / sessions30) : 0,
      pwaShare: vis.length ? Math.round(100 * vis.filter(([, v]) => v.pwa).length / vis.length) : 0,
      mobileShare: vis.length ? Math.round(100 * vis.filter(([, v]) => v.mobile).length / vis.length) : 0,
      series,
      pages: Object.entries(S.pages).map(([page, o]) => ({ page, ...o })).sort((a, b) => b.views - a.views),
      objects: Object.entries(S.objects).map(([key, o]) => ({ key, label: resolve.object(key), ...o })).sort((a, b) => b.views - a.views).slice(0, 15),
      favTeams: Object.entries(favCount).map(([team, n]) => ({ team, label: resolve.team(team), visitors: n })).sort((a, b) => b.visitors - a.visitors).slice(0, 15),
      devices: Object.entries(dev).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n).slice(0, 8),
      people: vis.map(([id, v]) => ({ label: `Visiteur n°${v.n}`, first: v.first, last: v.last, visits: v.visits, views: v.views, seconds: v.seconds, device: `${v.os} · ${v.br}`, pwa: v.pwa, online: online.has(id), favs: v.favs.map((f) => resolve.team(f)) })).sort((a, b) => b.last - a.last).slice(0, 60),
      favLog: S.favLog.slice(0, 20).map((e) => ({ at: e.at, who: `Visiteur n°${S.visitors[e.vid]?.n ?? '?'}`, team: resolve.team(e.team), on: e.on })),
    };
  }
  return { track, summary, save, _state: () => S };
}
