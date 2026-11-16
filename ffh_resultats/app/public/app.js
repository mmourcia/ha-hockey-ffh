// Hockey FFH – PWA (vanilla JS, hash router, zéro dépendance)
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- données ----------
let D = null, IDX = {};
let favs = store.get('favs', { clubs: [], teams: [] });
const saveFavs = () => { store.set('favs', favs); if (typeof syncPush === 'function') syncPush(false); };
let migrated = false;
if (favs.clubs?.length || favs.teams.some((id) => !String(id).includes(':'))) { favs.clubs = []; favs.teams = favs.teams.filter((id) => String(id).includes(':')); migrated = true; store.set('favs', favs); }
const isFavTeam = (t) => !!t && favs.teams.includes(t.id);
const isFavMatch = (m) => isFavTeam(m.t1) || isFavTeam(m.t2);
const hasFavs = () => favs.teams.length > 0;

function index(d) {
  IDX = { comp: {}, poule: {}, club: {}, teams: {}, byDay: {} };
  d.comps.forEach((c) => { IDX.comp[c.id] = c; c.poules.forEach((p) => (IDX.poule[p.id] = { ...p, comp: c.id })); });
  d.clubs.forEach((c) => (IDX.club[c.code] = c));
  d.matches.forEach((m) => {
    if (m.bye) return;
    [m.t1, m.t2].forEach((t) => { if (!IDX.teams[t.id]) IDX.teams[t.id] = { ...t, comps: new Set() }; IDX.teams[t.id].comps.add(m.comp); });
    if (m.date && !m.bye) (IDX.byDay[m.date.slice(0, 10)] ||= []).push(m);
  });
  Object.values(IDX.byDay).forEach((a) => a.sort((x, y) => x.date.localeCompare(y.date)));
}
async function load(first) {
  try {
    const v = D?.version ? `&v=${D.version}` : '';
    const r = await fetch(`/api/data?_=1${v}`);
    const j = await r.json();
    if (j.unchanged) return false;
    D = j; index(D); store.set('data', D); setStatus(''); return true;
  } catch (e) {
    if (!D) { D = store.get('data', null); if (D) index(D); }
    setStatus(D ? 'Hors-ligne – données enregistrées' : 'Connexion impossible'); return false;
  }
}
function setStatus(t) { const s = $('#status'); s.hidden = !t; s.textContent = t; }
async function api(path) { const r = await fetch('/api/' + path); if (!r.ok) throw new Error(r.status); return r.json(); }

// ---------- dates & helpers ----------
const pad = (n) => String(n).padStart(2, '0');
const localKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => localKey();
const dayDate = (k) => new Date(k + 'T12:00:00');
const dayLong = (k) => { const s = dayDate(k).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); return k === todayKey() ? 'Aujourd’hui – ' + s : s; };
const hhmm = (m) => (m.date && !m.bye && m.date.slice(11, 16) !== '00:00' ? m.date.slice(11, 16).replace(':', 'h') : '');
const dateBlock = (m, tag) => { const d = dayDate(m.date.slice(0, 10)); const dow = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''); const mon = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''); return `<b>${dow} ${d.getDate()}</b>${mon}${tag ? `<span class="h">${tag}</span>` : ''}`; };
const shortDay = (m) => (m.date ? dayDate(m.date.slice(0, 10)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '–');
const sexeLabel = (s) => ({ M: 'Hommes', F: 'Femmes', FM: 'Mixte' }[s] || s);
const discLabel = (d) => ({ GAZON: 'Gazon', SALLE: 'Salle', DEVELOP: 'Développement' }[d] || d);
const isLate = (m) => m.status === 'upcoming' && m.date && new Date(m.date.replace(' ', 'T')).getTime() < Date.now() - 2 * 3600e3;
const isLive = (m) => { if (m.status !== 'upcoming' || !m.date) return false; const t = new Date(m.date.replace(' ', 'T')).getTime(); return Date.now() >= t && Date.now() < t + 2 * 3600e3; };

// ---------- composants ----------
function matchCard(m, { showComp = false } = {}) {
  const played = m.status === 'played';
  const w = played ? (m.s1 > m.s2 ? 1 : m.s2 > m.s1 ? 2 : 0) : 0;
  const hh = hhmm(m);
  const when = !m.date ? '<b>—</b>' : played ? dateBlock(m, 'FIN') : m.status === 'forfeit' ? dateBlock(m, 'FORFAIT') : m.status === 'cancelled' ? dateBlock(m, 'ANNULÉ') : m.status === 'stopped' ? dateBlock(m, 'ARRÊTÉ') : isLate(m) ? dateBlock(m, '?') : isLive(m) ? `${dateBlock(m)}<span class="h live">● ${hh || 'EN COURS'}</span>` : dateBlock(m, hh || '—');
  const comp = IDX.comp[m.comp];
  const name = (t, i) => `<div class="${w === i ? 'win' : ''}"><span class="n">${esc(t.name)}</span>${isFavTeam(t) ? ' <span style="color:#f5b301">★</span>' : ''}</div>`;
  const score = m.bye ? '' : played ? `<div class="${w === 2 ? 'lose' : ''}">${m.s1}</div><div class="${w === 1 ? 'lose' : ''}">${m.s2}</div>` : '';
  return `<a class="match ${isFavMatch(m) ? 'fav-m' : ''}" href="#/match/${m.id}"><div class="m-when">${when}</div><div class="m-teams">${name(m.t1, 1)}${name(m.t2, 2)}${showComp && comp ? `<div class="muted small"><span class="n">${esc(comp.name)}${m.round ? ' · ' + esc(m.round) : ''}</span></div>` : ''}</div><div class="m-score">${score}</div></a>`;
}
function groupedMatches(ms) {
  const g = {};
  ms.forEach((m) => (g[m.comp] ||= []).push(m));
  return Object.entries(g).sort((a, b) => (IDX.comp[a[0]]?.order ?? 99) - (IDX.comp[b[0]]?.order ?? 99) || (IDX.comp[a[0]]?.name || '').localeCompare(IDX.comp[b[0]]?.name || ''))
    .map(([cid, list]) => { const c = IDX.comp[cid]; return `<section class="group"><div class="group-h"><a href="#/comp/${cid}">${esc(c?.name || '')}</a><span>${esc(discLabel(c?.disc))} · ${esc(sexeLabel(c?.sexe))}</span></div><div class="card">${list.map((m) => matchCard(m)).join('')}</div></section>`; }).join('');
}
const newsCard = (n, big) => `<a class="news ${big ? 'big' : ''}" href="${esc(n.link)}" target="_blank" rel="noopener">${n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy">` : ''}<div><div class="muted small">${esc(n.category || 'Actu')} · ${n.date ? new Date(n.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : ''}</div><div class="t">${esc(n.title)}</div></div></a>`;
const star = (on, attr) => `<button class="star ${on ? 'on' : ''}" ${attr} aria-label="Favori">${on ? '★' : '☆'}</button>`;

// ---------- vues ----------
const views = {};

const WX = (c) => (c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 57 ? '🌦️' : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌦️' : c <= 86 ? '🌨️' : '⛈️');
const mapsUrl = (m) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([m.venue, m.city].filter(Boolean).join(' '))}`;
const shareText = (m) => `🏑 ${m.t1.name} – ${m.t2.name}\n📅 ${m.date ? dayLong(m.date.slice(0, 10)) : ''}${hhmm(m) ? ' à ' + hhmm(m) : ''}${m.venue ? `\n📍 ${m.venue}${m.city ? ', ' + m.city : ''}` : ''}\n${location.origin}/#/match/${m.id}`;
function weekBlock() {
  const now = Date.now(), t = (m) => new Date((m.date || '').replace(' ', 'T')).getTime();
  const ms = D.matches.filter((m) => !m.bye && m.date && isFavMatch(m) && (m.status === 'upcoming') && t(m) > now - 2 * 3600e3 && t(m) < now + 8 * 864e5).sort((x, y) => t(x) - t(y));
  if (!ms.length) return '';
  return `<h2>Cette semaine<a href="#/agenda">📅 Agenda</a></h2>${ms.map((m) => `<div class="card wk">${matchCard(m, { showComp: true })}<div class="wk-i small">${m.venue ? `<span>📍 ${esc(m.venue)}${m.city ? ', ' + esc(m.city) : ''}</span>` : '<span class="muted">Lieu à confirmer</span>'}<span class="muted" data-wx="${esc(m.city || '')}" data-day="${m.date.slice(0, 10)}"></span></div><div class="wk-a">${m.venue ? `<a class="btn" target="_blank" rel="noopener" href="${mapsUrl(m)}">🧭 Itinéraire</a>` : ''}<button class="btn" data-share="${m.id}">↗ Partager</button></div></div>`).join('')}`;
}
function wireWeek() {
  app.querySelectorAll('[data-share]').forEach((b) => (b.onclick = async () => { const m = D.matches.find((x) => x.id === b.dataset.share); if (!m) return; try { navigator.share ? await navigator.share({ title: `${m.t1.name} – ${m.t2.name}`, text: shareText(m) }) : (await navigator.clipboard.writeText(shareText(m)), toast('Infos du match copiées')); } catch {} }));
  app.querySelectorAll('[data-wx]').forEach(async (el) => {
    if (!el.dataset.wx) return;
    try { const w = await api(`weather?city=${encodeURIComponent(el.dataset.wx)}&day=${el.dataset.day}`); if (w.max != null) el.textContent = `${WX(w.code)} ${w.min}°/${w.max}° · pluie ${w.rain ?? 0} % · vent ${w.wind} km/h`; } catch {}
  });
}
views.home = async () => {
  const t = (m) => new Date((m.date || '').replace(' ', 'T')).getTime();
  const now = Date.now();
  let h = '';
  if (!hasFavs()) h += `<div class="hero"><h1>Quelle est votre équipe ?</h1><p>Tapez le nom de votre club ou de votre équipe, puis touchez l’étoile : vos matchs, classements et joueurs apparaissent ici.</p><input class="search" id="hq" type="search" placeholder="Ex. Lille, Wattignies U13, Marcq…" autocomplete="off"><div id="hr" class="hero-res"></div></div>`;
  else {
    h += weekBlock();
    h += `<h2>Mes équipes<a href="#/equipes">Gérer</a></h2><div class="card">`;
    h += favs.teams.map((id) => {
      const tm = IDX.teams[id]; if (!tm) return '';
      const ms = D.matches.filter((m) => !m.bye && (m.t1.id === id || m.t2.id === id));
      const next = ms.filter((m) => m.status === 'upcoming' && t(m) > now - 2 * 3600e3).sort((a, b) => t(a) - t(b))[0];
      const last = ms.filter((m) => m.status === 'played').sort((a, b) => t(b) - t(a))[0];
      const pid = (ms.find((m) => m.poule) || {}).poule;
      return `<div class="fteam"><a class="fh" href="#/equipe/${id}"><b>${esc(tm.name)}</b><span class="muted small">${esc(teamLabel(tm))} · ${esc(teamMeta(tm))}</span><span class="rank small" data-rank="${esc(id)}" data-poule="${esc(pid || '')}"></span></a><div class="qlinks"><a href="#/equipe/${id}/classement"><span>📊</span>Classement</a><a href="#/equipe/${id}/matchs"><span>📅</span>Calendrier</a><a href="#/equipe/${id}/joueurs"><span>👥</span>Joueurs</a></div>${last ? matchCard(last) : ''}${next ? matchCard(next) : ''}${!last && !next ? '<div class="pad muted small">Aucun match programmé.</div>' : ''}</div>`;
    }).join('');
    h += '</div>';
    h += '<p><a class="btn" href="#/agenda">📅 Mes matchs dans mon agenda Google / Apple</a></p>';
  }
  const tk = todayKey();
  const keys = Object.keys(IDX.byDay).sort();
  const dk = IDX.byDay[tk] ? tk : keys.find((k) => k > tk) || keys[keys.length - 1];
  if (dk) {
    const day = IDX.byDay[dk].slice().sort((a, b) => (IDX.comp[a.comp]?.order ?? 99) - (IDX.comp[b.comp]?.order ?? 99));
    h += `<h2>${esc(dayLong(dk))}<a href="#/matchs/${dk}">Les ${day.length} matchs</a></h2>${groupedMatches(day.slice(0, 6))}`;
  }
  h += `<h2>À la une<a href="#/actus">Toutes les actus</a></h2><div class="card" id="home-news"><div class="loading">…</div></div>`;
  h += '<p class="muted small center" style="margin-top:18px">📊 La fréquentation est mesurée de façon anonyme (aucun nom, aucune adresse IP).</p>';
  app.innerHTML = h;
  wireWeek();
  if (!hasFavs()) {
    const all = Object.values(IDX.teams), clubName = (t) => (t.club && IDX.club[t.club]?.name) || '';
    const draw = () => {
      const q = norm($('#hq').value.trim()); if (q.length < 2) { $('#hr').innerHTML = ''; return; }
      const list = all.filter((t) => q.split(/\s+/).every((w) => norm(`${t.name} ${clubName(t)} ${teamLabel(t)}`).includes(w))).sort((x, y) => x.name.localeCompare(y.name) || (teamComps(x)[0]?.order ?? 99) - (teamComps(y)[0]?.order ?? 99)).slice(0, 12);
      $('#hr').innerHTML = list.length ? `<div class="card list">${list.map(teamRow).join('')}</div>` : '<div class="empty">Aucune équipe trouvée.</div>';
      $('#hr').querySelectorAll('[data-team]').forEach((b) => (b.onclick = (ev) => { ev.preventDefault(); toggleTeam(b.dataset.team); views.home(); }));
    };
    $('#hq').oninput = draw;
  }
  app.querySelectorAll('[data-rank]').forEach(async (el) => {
    if (!el.dataset.poule) return;
    try {
      const d = await api('poule/' + el.dataset.poule), tid = el.dataset.rank.split(':')[1];
      const r = d.standings.find((x) => String(x.team.id) === tid);
      if (r) el.textContent = `${r.pos}${r.pos === 1 ? 'er' : 'e'} / ${d.standings.length} · ${r.pts} pts · ${r.j} j.`;
    } catch {}
  });
  api('news').then((n) => { $('#home-news').innerHTML = n.slice(0, 2).map((x) => newsCard(x)).join(''); }).catch(() => { $('#home-news').innerHTML = '<div class="pad muted">Actualités indisponibles.</div>'; });
};

let mState = { disc: store.get('f.disc', ''), sexe: store.get('f.sexe', ''), fav: false, q: '', open: false };
views.matchs = async (day) => {
  const keys = Object.keys(IDX.byDay).sort();
  const tk = todayKey();
  day = day || keys.find((k) => k >= tk) || keys[keys.length - 1];
  const chip = (k, v, label) => `<button class="chip ${mState[k] === v ? 'on' : ''}" data-f="${k}" data-v="${v}">${label}</button>`;
  const near = keys.filter((k) => Math.abs(dayDate(k) - dayDate(day)) < 40 * 864e5);
  app.innerHTML = `<input class="search" id="mq" type="search" placeholder="Équipe, club, compétition, ville…" value="${esc(mState.q)}">
  ${(() => { const n = (mState.disc ? 1 : 0) + (mState.sexe ? 1 : 0) + (mState.fav ? 1 : 0); return `<div class="chips">${hasFavs() ? `<button class="chip ${mState.fav ? 'on' : ''}" data-fav>★ Mes équipes</button>` : ''}<button class="chip ${n && !mState.fav || mState.open ? 'on' : ''}" data-open>⚙ Filtres${n ? ' · ' + n : ''}</button></div>${mState.open ? `<div class="card pad fpanel"><div class="small muted">Discipline</div><div class="chips">${chip('disc', '', 'Tout')}${chip('disc', 'GAZON', 'Gazon')}${chip('disc', 'SALLE', 'Salle')}</div><div class="small muted">Catégorie</div><div class="chips">${chip('sexe', '', 'H + F')}${chip('sexe', 'M', 'Hommes')}${chip('sexe', 'F', 'Femmes')}</div></div>` : ''}`; })()}
  <div class="chips days" id="days">${near.map((k) => { const d = dayDate(k); return `<a class="chip ${k === day ? 'on' : ''} ${k === tk ? 'today' : ''}" href="#/matchs/${k}">${d.toLocaleDateString('fr-FR', { weekday: 'short' })}<small>${d.getDate()}/${pad(d.getMonth() + 1)}</small></a>`; }).join('')}</div>
  <h2>${esc(dayLong(day))}</h2><div id="mlist"></div>`;
  $('#days .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  const draw = () => {
    const q = norm(mState.q);
    const ms = (IDX.byDay[day] || []).filter((m) => {
      const c = IDX.comp[m.comp];
      return (!mState.disc || c?.disc === mState.disc) && (!mState.sexe || c?.sexe === mState.sexe) && (!mState.fav || isFavMatch(m)) &&
        (!q || norm(`${m.t1.name} ${m.t2.name} ${c?.name} ${m.city || ''} ${m.venue || ''}`).includes(q));
    });
    $('#mlist').innerHTML = ms.length ? groupedMatches(ms) : '<div class="empty">Aucun match ce jour-là avec ces filtres.</div>';
  };
  draw();
  $('#mq').oninput = (e) => { mState.q = e.target.value; draw(); };
  app.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { mState[b.dataset.f] = b.dataset.v; store.set('f.' + b.dataset.f, b.dataset.v); views.matchs(day); }));
  $('[data-open]')?.addEventListener('click', () => { mState.open = !mState.open; views.matchs(day); });
  $('[data-fav]')?.addEventListener('click', () => { mState.fav = !mState.fav; views.matchs(day); });
};

views.comps = async () => {
  const by = {};
  D.comps.forEach((c) => ((by[c.disc] ||= {})[c.sexe] ||= []).push(c));
  let h = '<h1>Compétitions</h1>' + compTabs('comps');
  for (const disc of ['GAZON', 'SALLE', 'DEVELOP']) {
    if (!by[disc]) continue;
    for (const sx of ['M', 'F', 'FM']) {
      const list = (by[disc][sx] || []).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      if (!list.length) continue;
      h += `<h2>${discLabel(disc)} · ${sexeLabel(sx)}</h2><div class="card list">${list.map((c) => `<a href="#/comp/${c.id}"><div class="grow"><div>${esc(c.name)}</div></div><span class="chev">›</span></a>`).join('')}</div>`;
    }
  }
  app.innerHTML = h;
};

function drawStandings(box, d, id) {
    const COLS = [['pos', '#', 1, 'Classement officiel'], ['team', 'Équipe', 1, 'Ordre alphabétique'], ['j', 'J', -1, 'Matchs joués'], ['g', 'G', -1, 'Victoires'], ['n', 'N', -1, 'Nuls'], ['pp', 'P', 1, 'Moins de défaites'], ['bp', 'BP', -1, 'Meilleure attaque (buts pour)'], ['bc', 'BC', 1, 'Meilleure défense (buts contre)'], ['diff', '+/-', -1, 'Meilleure différence de buts'], ['pts', 'Pts', -1, 'Points']];
    const val = (r, k) => (k === 'team' ? r.team.name || '' : k === 'pp' ? (r.p || 0) + (r.f || 0) : r[k] ?? 0);
    const draw = () => {
      const { k, dir } = stSort, rows = [...d.standings].sort((a, b) => { const x = val(a, k), y = val(b, k); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir || a.pos - b.pos; });
      const th = COLS.map(([key, lab, def, tip]) => `<th data-s="${key}" title="${tip}" class="sortable${key === 'team' ? ' l' : ''}${k === key ? ' on' : ''}">${lab}${k === key ? (dir === 1 ? ' ▲' : ' ▼') : ''}</th>`).join('');
      box.innerHTML = `<div class="card"><table class="t st"><tr>${th}</tr>${rows.map((r) => { const tid = `${id}:${r.team.id}`; const t = IDX.teams[tid]; const fav = isFavTeam(t); const mv = r.last && r.pos < r.last ? '<span class="up">▲</span>' : r.last && r.pos > r.last ? '<span class="dn">▼</span>' : ''; const hl = (key) => (k === key ? ' class="hl"' : ''); return `<tr class="${fav ? 'fav' : ''}"><td class="pos">${r.pos}</td><td class="team"><a href="#/equipe/${tid}">${esc(r.team.name)}</a> ${mv}</td><td${hl('j')}>${r.j}</td><td${hl('g')}>${r.g}</td><td${hl('n')}>${r.n}</td><td${hl('pp')}>${r.p + (r.f || 0)}</td><td${hl('bp')}>${r.bp ?? ''}</td><td${hl('bc')}>${r.bc ?? ''}</td><td${hl('diff')}>${r.diff > 0 ? '+' : ''}${r.diff}</td><td class="pts">${r.pts}</td></tr>`; }).join('')}</table></div><p class="muted small">Touchez un en-tête pour trier (BP = attaque, BC = défense). Pts = points officiels FFH (pénalités déduites). ▲▼ = évolution depuis la journée précédente.</p>`;
      box.querySelectorAll('th[data-s]').forEach((h) => (h.onclick = () => { const def = COLS.find((c) => c[0] === h.dataset.s)[2]; stSort = h.dataset.s === stSort.k ? { k: stSort.k, dir: -stSort.dir } : { k: h.dataset.s, dir: def }; draw(); }));
    };
  if (d.standings.length) draw(); else box.innerHTML = '<div class="empty">Classement non disponible pour cette poule.</div>';
}

let cTab = 'standings';
let stSort = { k: 'pos', dir: 1 };
views.comp = async (id, pouleId) => {
  const c = IDX.comp[id]; if (!c) return notFound();
  pouleId = pouleId || c.poules[0].id;
  app.innerHTML = `<h1>${esc(c.name)}</h1><div class="muted small" style="margin:-8px 0 8px">${esc(discLabel(c.disc))} · ${esc(sexeLabel(c.sexe))}</div>
  ${c.poules.length > 1 ? `<div class="chips">${c.poules.map((p) => `<a class="chip ${p.id === pouleId ? 'on' : ''}" href="#/comp/${id}/${p.id}">${esc(p.label)}</a>`).join('')}</div>` : ''}
  <div class="tabsub">${[['standings', 'Classement'], ['calendar', 'Calendrier'], ['scorers', 'Buteurs']].map(([k, l]) => `<button data-t="${k}" class="${cTab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="ct"><div class="loading">Chargement…</div></div>`;
  app.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { cTab = b.dataset.t; views.comp(id, pouleId); }));
  const box = $('#ct');
  if (cTab === 'calendar') {
    const ms = D.matches.filter((m) => m.poule === pouleId).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const rounds = {};
    ms.forEach((m) => (rounds[m.round || m.tournoi || 'Matchs'] ||= []).push(m));
    const tk = todayKey(); let focus = null;
    box.innerHTML = Object.entries(rounds).map(([r, list]) => { const d = list[0].date?.slice(0, 10); const id = 'r' + Math.abs([...r].reduce((a, ch) => a * 31 + ch.charCodeAt(0) | 0, 7)); if (!focus && d >= tk) focus = id; return `<section class="group" id="${id}"><div class="group-h"><b>${esc(r)}</b><span>${d ? esc(dayLong(d).replace('Aujourd’hui – ', '')) : ''}</span></div><div class="card">${list.map((m) => matchCard(m)).join('')}</div></section>`; }).join('') || '<div class="empty">Calendrier non publié.</div>';
    if (focus) $('#' + focus)?.scrollIntoView({ block: 'start' });
    return;
  }
  try {
    const d = await api(`poule/${pouleId}`);
    if (cTab === 'scorers') {
      const draw = () => {
        const { k, dir } = scSort, tot = (s) => (s.green || 0) + (s.yellow || 0) + (s.red || 0);
        const val = { goals: (s) => s.goals, cards: tot, green: (s) => s.green || 0, yellow: (s) => s.yellow || 0, red: (s) => s.red || 0 }[k];
        const rows = [...d.scorers].sort((a, b) => (val(b) - val(a)) * dir || a.rank - b.rank);
        const th = ([key, lab, tip]) => `<th data-k="${key}" title="${tip}" class="sortable${scSort.k === key ? ' on' : ''}">${lab}${scSort.k === key ? (dir === 1 ? ' ▼' : ' ▲') : ''}</th>`;
        box.innerHTML = `<div class="card"><table class="t st"><tr><th>#</th><th class="l">Joueur</th>${[['goals', 'Buts', 'Trier par buts'], ['cards', 'Σ', 'Total des cartons'], ['green', '🟩', 'Verts'], ['yellow', '🟨', 'Jaunes'], ['red', '🟥', 'Rouges']].map(th).join('')}</tr>${rows.map((s, i) => `<tr><td class="pos">${scSort.k === 'goals' && dir === 1 ? s.rank : i + 1}</td><td class="team">${esc(s.name)}<div class="muted small">${esc(s.club || '')}</div></td><td class="pts">${s.goals}</td><td>${tot(s) || ''}</td><td>${s.green || ''}</td><td>${s.yellow || ''}</td><td>${s.red || ''}</td></tr>`).join('')}</table></div>`;
        box.querySelectorAll('th[data-k]').forEach((h) => (h.onclick = () => { scSort = { k: h.dataset.k, dir: scSort.k === h.dataset.k ? -scSort.dir : 1 }; draw(); }));
      };
      if (d.scorers.length) draw(); else box.innerHTML = '<div class="empty">Pas encore de buteurs.</div>';
      return;
    }
    drawStandings(box, d, id);
  } catch { box.innerHTML = '<div class="empty">Source FFH indisponible. Réessayez.</div>'; }
};

const teamComps = (t) => [...t.comps].map((id) => IDX.comp[id]).filter(Boolean);
const teamLabel = (t) => teamComps(t).map((c) => c.name).slice(0, 2).join(' · ');
const teamSub = (t) => [teamMeta(t), teamComps(t)[0]?.name].filter(Boolean).join(' · ');
const teamMeta = (t) => { const c = teamComps(t)[0]; return c ? `${discLabel(c.disc)} · ${sexeLabel(c.sexe)}` : ''; };
function toggleTeam(id) { const i = favs.teams.indexOf(id); i < 0 ? favs.teams.push(id) : favs.teams.splice(i, 1); saveFavs(); track('fav', { team: id, on: i < 0 }); if (i < 0) askNotif(); }
const teamRow = (t) => `<div class="row"><a class="grow tl" href="#/equipe/${t.id}"><b>${esc(t.name)}</b><span class="muted small">${esc(teamMeta(t))} · ${esc(teamComps(t).map((c) => c.name).slice(0, 2).join(' · '))}</span></a>${star(favs.teams.includes(t.id), `data-team="${t.id}"`)}</div>`;
let tState = { disc: '', sexe: '', q: '' };
views.equipes = async () => {
  const chip = (k, v, l) => `<button class="chip ${tState[k] === v ? 'on' : ''}" data-f="${k}" data-v="${v}">${l}</button>`;
  app.innerHTML = `<h1>Mes équipes</h1><p class="muted small" style="margin:-6px 0 10px">Chaque équipe est distincte : Élite Hommes, Élite Dames, U13 Filles… Cochez l’étoile des équipes que vous suivez.${hasFavs() ? ' <a href="#/agenda" style="color:var(--acc)">📅 Les ajouter à mon agenda</a>' : ''}</p>
  <input class="search" id="cq" type="search" placeholder="Nom du club, de l’équipe, ville ou compétition…" autocomplete="off" value="${esc(tState.q)}">
  <div class="chips">${chip('disc', '', 'Tout')}${chip('disc', 'GAZON', 'Gazon')}${chip('disc', 'SALLE', 'Salle')}<span style="width:8px"></span>${chip('sexe', '', 'H + F')}${chip('sexe', 'M', 'Hommes')}${chip('sexe', 'F', 'Femmes')}</div><div id="cl"></div>`;
  const all = Object.values(IDX.teams);
  const clubCity = (t) => (t.club && IDX.club[t.club] ? IDX.club[t.club].city || '' : '');
  const draw = () => {
    const q = norm(tState.q.trim());
    const mine = all.filter((t) => favs.teams.includes(t.id));
    let list = all.filter((t) => { const c = teamComps(t)[0]; return (!tState.disc || c?.disc === tState.disc) && (!tState.sexe || c?.sexe === tState.sexe) && (!q || q.split(/\s+/).every((w) => norm(`${t.name} ${teamLabel(t)} ${clubCity(t)} ${t.club && IDX.club[t.club]?.name || ''} ${teamMeta(t)}`).includes(w))); });
    list.sort((a, b) => a.name.localeCompare(b.name) || teamLabel(a).localeCompare(teamLabel(b)));
    const shown = list.slice(0, 60);
    $('#cl').innerHTML = (mine.length && !q ? `<h2>Mes favoris (${mine.length})</h2><div class="card list">${mine.map(teamRow).join('')}</div>` : '') +
      `<h2>${q || tState.disc || tState.sexe ? `${list.length} équipe${list.length > 1 ? 's' : ''}` : 'Toutes les équipes'}</h2><div class="card list">${shown.map(teamRow).join('') || '<div class="empty">Aucune équipe. Essayez « lille », « wattignies u13 »…</div>'}</div>${list.length > 60 ? '<p class="muted small center">Affinez la recherche pour voir les autres équipes.</p>' : ''}`;
    $('#cl').querySelectorAll('[data-team]').forEach((b) => (b.onclick = (ev) => { ev.preventDefault(); toggleTeam(b.dataset.team); draw(); }));
  };
  $('#cq').oninput = (e) => { tState.q = e.target.value; draw(); };
  app.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { tState[b.dataset.f] = b.dataset.v; views.equipes(); }));
  draw();
  if (migrated) { migrated = false; toast('Les favoris se choisissent maintenant par équipe précise'); }
};
views.clubs = views.equipes;

const compTabs = (on) => `<div class="tabsub">${[['comps', 'Classements'], ['buteurs', 'Buteurs'], ['joueurs', 'Joueurs'], ['arbitres', 'Arbitres']].map(([h, l]) => `<a href="#/${h}" class="${on === h ? 'on' : ''}">${l}</a>`).join('')}</div>`;
const favComps = () => [...new Set(favs.teams.map((id) => id.split(':')[0]))].filter((c) => IDX.comp[c]);
let sSel = '', sTouched = false;
views.buteurs = async () => {
  const mine = favComps();
  const sorted = D.comps.slice().sort((a, b) => (a.disc === b.disc ? 0 : a.disc === 'GAZON' ? -1 : 1) || a.order - b.order || a.name.localeCompare(b.name));
  if (!sTouched || !IDX.comp[sSel]) sSel = mine[0] || (sorted.find((c) => /elite hommes/i.test(c.name)) || sorted[0]).id;
  const opt = (c) => `<option value="${c.id}" ${c.id === sSel ? 'selected' : ''}>${esc(c.name)} — ${esc(discLabel(c.disc))} ${esc(sexeLabel(c.sexe))}</option>`;
  app.innerHTML = `<h1>Compétitions</h1>${compTabs('buteurs')}
  ${mine.length ? `<div class="chips" id="mc">${mine.map((id) => `<button class="chip ${id === sSel ? 'on' : ''}" data-c="${id}">${esc(IDX.comp[id].name)}</button>`).join('')}</div>` : '<p class="muted small">Suivez des équipes (onglet Équipes) pour retrouver ici les buteurs de vos championnats.</p>'}
  <select class="search" id="sc">${mine.length ? `<optgroup label="Mes championnats">${mine.map((id) => opt(IDX.comp[id])).join('')}</optgroup>` : ''}<optgroup label="Toutes les compétitions">${sorted.map(opt).join('')}</optgroup></select><div id="sl"><div class="loading">Chargement…</div></div>`;
  const load = async () => {
    const c = IDX.comp[sSel];
    const lists = await Promise.all(c.poules.map((p) => api('poule/' + p.id).then((d) => ({ p, d })).catch(() => null)));
    $('#sl').innerHTML = lists.filter(Boolean).map(({ p, d }) => d.scorers.length ? `${c.poules.length > 1 ? `<h2>${esc(p.label)}</h2>` : ''}<div class="card"><table class="t"><tr><th>#</th><th class="l">Joueur</th><th>Buts</th><th>🟩</th><th>🟨</th><th>🟥</th></tr>${d.scorers.map((s) => `<tr><td class="pos">${s.rank}</td><td class="team">${esc(s.name)}<div class="muted small">${esc(s.club || '')}</div></td><td class="pts">${s.goals}</td><td>${s.green || ''}</td><td>${s.yellow || ''}</td><td>${s.red || ''}</td></tr>`).join('')}</table></div>` : '').join('') || '<div class="empty">Pas encore de buteurs pour cette compétition.</div>';
  };
  const pick = (id) => { sSel = id; sTouched = true; views.buteurs(); };
  $('#sc').onchange = (e) => pick(e.target.value);
  app.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => pick(b.dataset.c)));
  load();
};

// ---------- Arbitres ----------
let rState = { q: '', sort: 'matches' };
const refStats = (r) => `<span title="Matchs arbitrés"><b>${r.matches}</b> match${r.matches > 1 ? 's' : ''}</span><span title="Total des cartons">Σ ${r.green + r.yellow + r.red}</span><span title="Total des cartons">Σ ${r.green + r.yellow + r.red}</span><span title="Cartons verts">🟩 ${r.green}</span><span title="Cartons jaunes">🟨 ${r.yellow}</span><span title="Cartons rouges">🟥 ${r.red}</span><span class="muted" title="Cartons par match">${r.perMatch} / match</span>`;
views.arbitres = async () => {
  const SORTS = [['matches', 'Matchs'], ['cards', 'Cartons'], ['perMatch', 'Cartons / match'], ['yellow', 'Jaunes'], ['red', 'Rouges']];
  app.innerHTML = `<h1>Compétitions</h1>${compTabs('arbitres')}
  <input class="search" id="rq" type="search" placeholder="Nom d’un arbitre…" autocomplete="off" value="${esc(rState.q)}">
  <div class="chips">${SORTS.map(([k, l]) => `<button class="chip ${rState.sort === k ? 'on' : ''}" data-s="${k}">${l}</button>`).join('')}</div>
  <div id="rt"></div><div id="rl"><div class="loading">Chargement…</div></div><p class="muted small" id="rnote"></p>`;
  let timer, seq = 0;
  const run = async () => {
    const my = ++seq;
    try {
      const d = await api(`referees?q=${encodeURIComponent(rState.q.trim())}&sort=${rState.sort}`);
      if (my !== seq) return;
      const t = d.totals;
      $('#rt').innerHTML = `<div class="tiles"><div><b>${t.matches}</b><span>matchs</span></div><div><b>${t.referees}</b><span>arbitres</span></div><div><b>${t.cards}</b><span>cartons</span></div><div><b>${t.perMatch}</b><span>cartons / match</span></div></div><div class="stats small" style="margin:6px 0 10px"><span>🟩 ${t.green}</span><span>🟨 ${t.yellow}</span><span>🟥 ${t.red}</span></div>`;
      $('#rl').innerHTML = d.rows.length ? `<div class="card list">${d.rows.map((r) => `<a href="#/arbitre/${r.id}"><div class="grow"><div><b>${esc(r.name)}</b></div><div class="stats">${refStats(r)}</div></div><span class="chev">›</span></a>`).join('')}</div>` : `<div class="empty">${d.coverage.withRefs < d.coverage.total ? 'Collecte des feuilles en cours, revenez dans quelques minutes.' : 'Aucun arbitre trouvé.'}</div>`;
      $('#rnote').textContent = `Un match arbitré à deux compte pour chaque arbitre : les cartons du match sont attribués à chacun. Données issues de ${d.coverage.withRefs} feuilles de match sur ${d.coverage.total}.${d.coverage.includeYouth ? '' : ' Catégories de jeunes exclues.'}`;
    } catch { $('#rl').innerHTML = '<div class="empty">Source indisponible.</div>'; }
  };
  $('#rq').oninput = (e) => { rState.q = e.target.value; clearTimeout(timer); timer = setTimeout(run, 250); };
  app.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { rState.sort = b.dataset.s; views.arbitres(); }));
  run();
};
views.arbitre = async (id) => {
  app.innerHTML = '<div class="loading">Chargement…</div>';
  try {
    const r = await api('referee/' + id);
    app.innerHTML = `<h1 style="margin-bottom:2px">${esc(r.name)}</h1><div class="muted small" style="margin-bottom:8px">Arbitre</div>
    <div class="tiles"><div><b>${r.matches}</b><span>matchs</span></div><div><b>${r.cards}</b><span>cartons</span></div><div><b>${r.perMatch}</b><span>cartons / match</span></div><div><b>${r.goalsPerMatch}</b><span>buts / match</span></div></div>
    <div class="stats small" style="margin:6px 0 10px"><span>🟩 ${r.green}</span><span>🟨 ${r.yellow}</span><span>🟥 ${r.red}</span></div>
    <h2>Par compétition</h2>${r.comps.map((c) => `<div class="card pad" style="margin-bottom:8px"><a href="#/comp/${c.comp.id}"><b>${esc(c.comp.name)}</b></a><div class="stats"><span><b>${c.matches}</b> match${c.matches > 1 ? 's' : ''}</span><span>🟩 ${c.green}</span><span>🟨 ${c.yellow}</span><span>🟥 ${c.red}</span></div></div>`).join('')}
    <h2>Match par match</h2><div class="card">${r.games.map((g) => { const m = D.matches.find((x) => x.id === g.m); return m ? `<div>${matchCard(m, { showComp: true })}<div class="stats small" style="padding:0 12px 8px 74px"><span>${g.c.some(Boolean) ? `${'🟩'.repeat(g.c[0])}${'🟨'.repeat(g.c[1])}${'🟥'.repeat(g.c[2])}` : '<span class="muted">Aucun carton</span>'}</span>${g.with.length ? `<span class="muted">avec ${esc(g.with.join(', '))}</span>` : ''}</div></div>` : ''; }).join('')}</div>`;
  } catch { app.innerHTML = '<div class="empty">Arbitre introuvable. <a class="btn" href="#/arbitres">Rechercher</a></div>'; }
};

// ---------- Joueurs ----------
let scSort = { k: 'goals', dir: 1 };
let jState = { q: '', mine: true, sort: 'goals' };
const JSORTS = [['goals', '⚽ Buts'], ['cards', 'Cartons (tous)'], ['green', '🟩'], ['yellow', '🟨'], ['red', '🟥'], ['matches', 'Matchs']];
const statCells = (r) => `<span title="Buts">⚽ <b>${r.goals}</b></span><span title="Cartons verts">🟩 ${r.green}</span><span title="Cartons jaunes">🟨 ${r.yellow}</span><span title="Cartons rouges">🟥 ${r.red}</span><span class="muted" title="Matchs joués">${r.matches} match${r.matches > 1 ? 's' : ''}</span>`;
views.joueurs = async () => {
  const mineTeams = favs.teams;
  app.innerHTML = `<h1>Compétitions</h1>${compTabs('joueurs')}
  <input class="search" id="jq" type="search" placeholder="Nom ou prénom du joueur…" autocomplete="off" value="${esc(jState.q)}">
  ${mineTeams.length ? `<div class="chips"><button class="chip ${jState.mine ? 'on' : ''}" data-m="1">★ Mes équipes</button><button class="chip ${!jState.mine ? 'on' : ''}" data-m="0">Tous les joueurs</button></div>` : ''}
  <div class="chips"><span class="muted small" style="align-self:center">Trier par</span>${JSORTS.map(([k, l]) => `<button class="chip ${jState.sort === k ? 'on' : ''}" data-js="${k}">${l}</button>`).join('')}</div>
  <div id="jl"><div class="loading">Chargement…</div></div><p class="muted small" id="jnote"></p>`;
  let timer, seq = 0;
  const run = async () => {
    const q = jState.q.trim(); const useMine = mineTeams.length && jState.mine;
    if (!useMine && q.length < 2) { $('#jl').innerHTML = '<div class="empty">Tapez au moins 2 lettres du nom d’un joueur.</div>'; return; }
    const my = ++seq;
    try {
      const d = await api(`players?q=${encodeURIComponent(q)}${useMine ? '&teams=' + encodeURIComponent(mineTeams.join(',')) : ''}&sort=${jState.sort}`);
      if (my !== seq) return;
      $('#jl').innerHTML = d.rows.length ? `<div class="card list">${d.rows.map((r) => `<a href="#/joueur/${r.id}"><div class="grow"><div><b>${esc(r.name)}</b></div><div class="muted small">${esc(r.team.name)} · ${esc(r.comp.name)}</div><div class="stats">${statCells(r)}</div></div><span class="chev">›</span></a>`).join('')}</div>${d.total > d.rows.length ? `<p class="muted small center">${d.total} résultats : affinez la recherche.</p>` : ''}` : '<div class="empty">Aucun joueur trouvé.</div>';
      $('#jnote').textContent = `Données issues de ${d.coverage.sheets} feuilles de match sur ${d.coverage.total} disponibles.${d.coverage.includeYouth ? '' : ' Catégories de jeunes exclues.'}`;
    } catch { $('#jl').innerHTML = '<div class="empty">Source indisponible.</div>'; }
  };
  $('#jq').oninput = (e) => { jState.q = e.target.value; clearTimeout(timer); timer = setTimeout(run, 250); };
  app.querySelectorAll('[data-js]').forEach((b) => (b.onclick = () => { jState.sort = b.dataset.js; views.joueurs(); }));
  app.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { jState.mine = b.dataset.m === '1'; views.joueurs(); }));
  run();
};
views.joueur = async (id) => {
  app.innerHTML = '<div class="loading">Chargement…</div>';
  try {
    const p = await api('player/' + id);
    const tot = p.rows.reduce((a, r) => ({ goals: a.goals + r.goals, green: a.green + r.green, yellow: a.yellow + r.yellow, red: a.red + r.red, matches: a.matches + r.matches }), { goals: 0, green: 0, yellow: 0, red: 0, matches: 0 });
    app.innerHTML = `<h1 style="margin-bottom:2px">${esc(p.name)}</h1><div class="stats" style="margin-bottom:10px">${statCells(tot)}</div>
    ${p.rows.map((r) => `<div class="card pad" style="margin-bottom:8px"><a href="#/equipe/${r.team.id}"><b>${esc(r.team.name)}</b></a><div class="muted small">${esc(r.comp.name)}</div><div class="stats">${statCells(r)}</div></div>`).join('')}
    <h2>Match par match</h2><div class="card">${p.games.map((g) => g.match ? `<div>${matchCard(g.match, { showComp: true })}<div class="stats small" style="padding:0 12px 8px 74px">${g.goals ? `⚽ ${g.goals} ` : ''}${'🟩'.repeat(g.c[0])}${'🟨'.repeat(g.c[1])}${'🟥'.repeat(g.c[2])}${!g.goals && !g.c.some(Boolean) ? '<span class="muted">—</span>' : ''}</div></div>` : '').join('')}</div>`;
  } catch { app.innerHTML = '<div class="empty">Joueur introuvable. <a class="btn" href="#/joueurs">Rechercher</a></div>'; }
};

views.club = async (code) => {
  const c = IDX.club[code]; if (!c) return notFound();
  const teams = Object.values(IDX.teams).filter((t) => t.club === code).sort((x, y) => (teamComps(x)[0]?.order ?? 99) - (teamComps(y)[0]?.order ?? 99) || x.name.localeCompare(y.name));
  app.innerHTML = `<h1>${esc(c.name)}</h1><div class="muted small" style="margin:-8px 0 10px">${esc(c.city || '')}</div>
  ${teams.length ? `<div class="card">${teams.map(teamRow).join('')}</div>` : '<div class="empty">Aucune équipe engagée cette saison.</div>'}`;
  app.querySelectorAll('[data-team]').forEach((b) => (b.onclick = () => { toggleTeam(b.dataset.team); views.club(code); }));
};

views.agenda = async () => {
  const teams = favs.teams.filter((id) => IDX.teams[id]);
  const cal = store.get('cal', { prefix: {}, alarm: 60 });
  if (!teams.length) { app.innerHTML = '<h1>Agenda</h1><div class="empty">Choisissez d’abord vos équipes favorites.<br><a class="btn primary" href="#/equipes">⭐ Choisir mes équipes</a></div>'; return; }
  const pre = (id) => { const p = (cal.prefix[id] || '').trim(); return p ? p + ' ' : ''; };
  const url = () => `${location.origin}/api/cal.ics?${teams.map((id) => 't=' + encodeURIComponent(id + '|' + pre(id))).join('&')}&alarm=${cal.alarm}`;
  app.innerHTML = `<h1>Mes matchs dans mon agenda</h1><p class="muted small" style="margin:-6px 0 10px">Abonnez-vous une fois : les matchs de vos équipes arrivent dans Google Agenda (ou Apple, Outlook…) et se mettent à jour tout seuls (horaire, lieu, score).</p>
  <h2>Préfixe par équipe <span class="muted small" style="font-weight:400">(optionnel)</span></h2><div class="card list">${teams.map((id) => `<div class="row"><div class="grow"><b>${esc(IDX.teams[id].name)}</b><div class="muted small">${esc(teamSub(IDX.teams[id]))}</div><input class="search mini" data-p="${esc(id)}" placeholder="Ex. Clément –" value="${esc(cal.prefix[id] || '')}"></div></div>`).join('')}</div>
  <h2>Rappel</h2><select class="search" id="al">${[[0, 'Aucun rappel'], [30, '30 minutes avant'], [60, '1 heure avant'], [120, '2 heures avant'], [1440, 'La veille']].map(([v, l]) => `<option value="${v}" ${+cal.alarm === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
  <h2>S’abonner</h2><div class="card pad"><p style="margin:0 0 8px"><a class="btn primary" id="gc" target="_blank" rel="noopener">Ajouter à Google Agenda</a> <a class="btn" id="wc">Apple / Outlook</a> <button class="btn" id="cp">Copier le lien</button></p>
  <div class="muted small">Exemple de titre : <b id="ex"></b></div><div class="muted small" style="margin-top:6px">Google Agenda actualise les agendas abonnés environ toutes les 12 à 24 h. Ce lien ne contient que la liste de vos équipes, aucune donnée personnelle.</div></div>`;
  const upd = () => {
    const u = url(); const w = u.replace(/^https?:/, 'webcal:');
    $('#gc').href = 'https://calendar.google.com/calendar/u/0/r?cid=' + encodeURIComponent(w); $('#wc').href = w;
    const t = IDX.teams[teams[0]]; $('#ex').textContent = `${pre(teams[0])}${t.name} vs …`;
    $('#cp').onclick = async () => { try { await navigator.clipboard.writeText(u); toast('Lien copié : collez-le dans « Ajouter par URL »'); } catch { prompt('Copiez ce lien', u); } };
  };
  app.querySelectorAll('[data-p]').forEach((i) => (i.oninput = () => { cal.prefix[i.dataset.p] = i.value; store.set('cal', cal); upd(); }));
  $('#al').onchange = (e) => { cal.alarm = +e.target.value; store.set('cal', cal); upd(); };
  upd();
};

let eTab = 'matchs';
views.equipe = async (id, tab) => {
  const t = IDX.teams[id]; if (!t) return notFound();
  eTab = tab || 'matchs';
  const ms = D.matches.filter((m) => m.t1.id === id || m.t2.id === id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const on = favs.teams.includes(id);
  const compId = id.split(':')[0], pouleId = (ms.find((m) => m.poule) || {}).poule;
  const TABS = [['matchs', 'Matchs'], ['classement', 'Classement'], ['joueurs', 'Joueurs']];
  app.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><div><h1 style="margin-bottom:0">${esc(t.name)}</h1><div class="muted small">${esc(teamMeta(t))}</div><div class="small">${[...t.comps].map((c) => `<a href="#/comp/${c}" style="color:var(--acc)">${esc(IDX.comp[c]?.name)}</a>`).join(' · ')}</div></div>${star(on, 'id="fav"')}</div>
  <p>${t.club && IDX.club[t.club] ? `<a class="btn" href="#/club/${t.club}">Voir le club</a> ` : ''}${on ? '<a class="btn" href="#/agenda">📅 Dans mon agenda</a>' : ''}</p>
  <div class="tabsub">${TABS.map(([k, l]) => `<a data-t="${k}" class="${eTab === k ? 'on' : ''}" href="#/equipe/${id}/${k}">${l}</a>`).join('')}</div><div id="et"></div>`;
  $('#fav').onclick = () => { toggleTeam(id); views.equipe(id, eTab); };
  const box = $('#et');
  if (eTab === 'classement') {
    box.innerHTML = '<div class="loading">Chargement…</div>';
    if (!pouleId) { box.innerHTML = '<div class="empty">Classement non disponible.</div>'; return; }
    try { const d = await api('poule/' + pouleId); drawStandings(box, d, compId); box.insertAdjacentHTML('beforeend', `<p><a class="btn" href="#/comp/${compId}/${pouleId}">Toute la compétition</a></p>`); }
    catch { box.innerHTML = '<div class="empty">Source FFH indisponible. Réessayez.</div>'; }
  } else if (eTab === 'joueurs') {
    box.innerHTML = '<div class="loading">Chargement…</div>';
    try {
      const d = await api(`players?team=${encodeURIComponent(id)}&limit=200&sort=${jState.sort}`);
      const chips = `<div class="chips"><span class="muted small" style="align-self:center">Trier par</span>${JSORTS.map(([k, l]) => `<button class="chip ${jState.sort === k ? 'on' : ''}" data-js="${k}">${l}</button>`).join('')}</div>`;
      box.innerHTML = d.rows.length ? chips + `<div class="card list">${d.rows.map((r) => `<a href="#/joueur/${r.id}"><div class="grow"><div><b>${esc(r.name)}</b></div><div class="stats">${statCells(r)}</div></div><span class="chev">›</span></a>`).join('')}</div>` : '<div class="empty">Pas encore de feuilles de match pour cette équipe.</div>';
      box.querySelectorAll('[data-js]').forEach((b) => (b.onclick = () => { jState.sort = b.dataset.js; views.equipe(id, 'joueurs'); }));
    } catch { box.innerHTML = '<div class="empty">Source indisponible.</div>'; }
  } else {
    box.innerHTML = `<div class="card">${ms.map((m) => matchCard(m, { showComp: true })).join('')}</div>`;
  }
};

async function preMatch(m) {
  const box = $('#pre'); if (!box) return;
  const pl = (id) => D.matches.filter((x) => !x.bye && x.status === 'played' && (x.t1.id === id || x.t2.id === id)).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  const form = (id) => pl(id).slice(0, 5).reverse().map((x) => { const [f, c] = x.t1.id === id ? [x.s1, x.s2] : [x.s2, x.s1]; const r = f > c ? 'V' : f < c ? 'D' : 'N'; return `<span class="fm ${r}" title="${esc(x.t1.name)} ${x.s1}-${x.s2} ${esc(x.t2.name)}">${r}</span>`; }).join('') || '<span class="muted">—</span>';
  const ids = [m.t1.id, m.t2.id];
  const [st, p1, p2] = await Promise.all([m.poule ? api('poule/' + m.poule).catch(() => null) : null, ...ids.map((id) => api(`players?team=${encodeURIComponent(id)}&limit=200&sort=goals`).catch(() => null))]);
  const row = (id) => st?.standings.find((r) => `${m.comp}:${r.team.id}` === id);
  const pos = (id) => { const r = row(id); return r ? `<b>${r.pos}${r.pos === 1 ? 'er' : 'e'}</b> · ${r.pts} pts` : '—'; };
  const att = (id) => { const r = row(id); return r && r.j ? `${(r.bp / r.j).toFixed(1)} but${r.bp / r.j >= 2 ? 's' : ''} / match` : '—'; };
  const def = (id) => { const r = row(id); return r && r.j ? `${(r.bc / r.j).toFixed(1)} encaissé${r.bc / r.j >= 2 ? 's' : ''} / match` : '—'; };
  const top = (p) => { const r = p?.rows.find((x) => x.goals > 0); return r ? `${esc(r.name)} <span class="muted">(${r.goals})</span>` : '—'; };
  const cards = (p) => { if (!p?.rows.length) return '—'; const c = (r) => r.green + r.yellow + r.red; const tot = p.rows.reduce((s, r) => s + c(r), 0); const w = [...p.rows].sort((x, y) => c(y) - c(x))[0]; return `${tot}${c(w) ? ` <span class="muted">· ${esc(w.name)} (${c(w)})</span>` : ''}`; };
  const h2h = D.matches.filter((x) => !x.bye && x.status === 'played' && ((x.t1.id === ids[0] && x.t2.id === ids[1]) || (x.t1.id === ids[1] && x.t2.id === ids[0]))).sort((x, y) => (x.date || '').localeCompare(y.date || ''));
  const R = (l, f) => `<tr><td class="muted small">${l}</td><td>${f(ids[0], p1)}</td><td>${f(ids[1], p2)}</td></tr>`;
  box.innerHTML = `<h2>Avant le match</h2><div class="card pre"><table class="t"><tr><th></th><th class="l">${esc(m.t1.name)}</th><th class="l">${esc(m.t2.name)}</th></tr>${R('Classement', pos)}${R('5 derniers', form)}${R('Attaque', att)}${R('Défense', def)}${R('Meilleur buteur', (id, p) => top(p))}${R('Cartons', (id, p) => cards(p))}</table></div>${h2h.length ? `<h2>Déjà rencontrés cette saison</h2><div class="card">${h2h.map((x) => matchCard(x, { showComp: true })).join('')}</div>` : ''}`;
}
const isStaff = (p) => !p.gk && !/^\d+$/.test(String(p.shirt || '').trim());
views.match = async (id) => {
  const m = D.matches.find((x) => x.id === id); if (!m) return notFound();
  const c = IDX.comp[m.comp];
  const played = m.status === 'played';
  app.innerHTML = `<div class="card"><div class="sheet-h"><a class="muted small" href="#/comp/${m.comp}">${esc(c?.name || '')}${m.round ? ' · ' + esc(m.round) : ''}</a>
  <div class="vs"><a class="tn" href="#/equipe/${m.t1.id}">${esc(m.t1.name)}</a><div class="big">${played ? `${m.s1} - ${m.s2}` : m.status === 'forfeit' ? 'Forfait' : 'vs'}</div><a class="tn" href="#/equipe/${m.t2.id}">${esc(m.t2.name)}</a></div>
  <div class="kv"><span>📅 ${m.date ? esc(dayLong(m.date.slice(0, 10))) : 'Date à définir'}${hhmm(m) ? ' · ' + hhmm(m) : ''}</span>${m.venue ? `<span>📍 ${esc(m.venue)}${m.city ? ', ' + esc(m.city) : ''}</span>` : ''}${m.reason ? `<span class="tag warn">${esc(m.reason)}</span>` : ''}</div>
  <div id="goals" class="small" style="margin-top:8px"></div><p style="margin:12px 0 0"><button class="btn" id="share">Partager</button> ${m.venue ? `<a class="btn" target="_blank" rel="noopener" href="https://www.openstreetmap.org/search?query=${encodeURIComponent(m.venue + ' ' + (m.city || ''))}">Itinéraire</a>` : ''}</p></div></div>
  <div id="pre"></div><div id="sheet">${m.sheet ? '<div class="loading">Chargement de la feuille de match…</div>' : '<div class="empty">Feuille de match pas encore disponible.</div>'}</div>`;
  $('#share').onclick = async () => { const data = { title: `${m.t1.name} – ${m.t2.name}`, text: played ? `${m.t1.name} ${m.s1}-${m.s2} ${m.t2.name}` : `${m.t1.name} – ${m.t2.name}`, url: location.href }; try { navigator.share ? await navigator.share(data) : (await navigator.clipboard.writeText(location.href), toast('Lien copié')); } catch {} };
  if (m.status === 'upcoming' || m.status === 'stopped') preMatch(m);
  if (!m.sheet) return;
  try {
    const s = await api('match/' + id);
    const col = (i) => `<div><div class="small muted" style="margin-bottom:4px"><b>${esc(m['t' + (i + 1)].name)}</b></div>${s.scorers[i].length ? `<div class="pl"><span>⚽</span><span>${s.scorers[i].map((g) => esc(g.name || 'N°' + g.no) + (g.n > 1 ? ' ×' + g.n : '')).join(', ')}</span></div>` : ''}${s.players[i].filter((p) => !isStaff(p)).map((p) => `<div class="pl"><span class="no">${p.gk ? 'GK' : esc(p.shirt)}</span><span class="nm">${esc(p.name)}</span>${p.card ? `<span class="cd ${p.card}" title="Carton"></span>` : ''}</div>`).join('')}${s.players[i].some(isStaff) ? `<div class="small muted" style="margin-top:8px"><b>Encadrement</b></div>${s.players[i].filter(isStaff).map((p) => `<div class="staff"><span class="nm2">${esc(p.name)}</span><span class="muted small">${esc(p.shirt)}</span></div>`).join('')}` : ''}${s.injuries[i] ? `<div class="small muted" style="margin-top:6px">🩹 ${esc(s.injuries[i])}</div>` : ''}</div>`;
    const gl = (i) => s.scorers[i].map((g) => `${esc(g.name || 'N°' + g.no)}${g.n > 1 ? ' ×' + g.n : ''}`).join(', ');
    if (s.scorers[0].length + s.scorers[1].length) $('#goals').innerHTML = `<div class="cols" style="text-align:left"><div>⚽ ${gl(0) || '—'}</div><div>⚽ ${gl(1) || '—'}</div></div>`;
    const cd = s.cards;
    $('#sheet').innerHTML = `<h2>Feuille de match</h2><div class="card"><div class="cols">${col(0)}${col(1)}</div></div>
    ${cd.green + cd.yellow + cd.red ? `<p class="small muted center">Cartons : ${cd.green ? `<span class="cd green"></span> ×${cd.green} ` : ''}${cd.yellow ? `<span class="cd yellow"></span> ×${cd.yellow} ` : ''}${cd.red ? `<span class="cd red"></span> ×${cd.red}` : ''}</p>` : ''}
    ${s.officials.length ? `<h2>Officiels</h2><div class="card list">${s.officials.map((o) => o.id ? `<a href="#/arbitre/${o.id}"><div class="grow"><div><b>${esc(o.name)}</b></div><div class="muted small">${esc(o.role)} · voir ses statistiques</div></div><span class="chev">›</span></a>` : `<div class="row"><div class="grow"><div>${esc(o.name)}</div><div class="muted small">${esc(o.role)}</div></div></div>`).join('')}</div>` : ''}`;
  } catch { $('#sheet').innerHTML = '<div class="empty">Feuille indisponible pour le moment.</div>'; }
};

views.actus = async () => {
  app.innerHTML = '<h1>Actualités FFH</h1><div class="card" id="nl"><div class="loading">Chargement…</div></div><p class="center"><a class="btn" href="https://www.ffhockey.org" target="_blank" rel="noopener">ffhockey.org ↗</a></p>';
  try { const n = await api('news'); $('#nl').innerHTML = n.map((x, i) => newsCard(x, i === 0)).join(''); } catch { $('#nl').innerHTML = '<div class="empty">Actualités indisponibles.</div>'; }
};

views.search = async () => {
  app.innerHTML = '<input class="search" id="sq" type="search" placeholder="Club, équipe, compétition, ville…" autofocus autocomplete="off"><div id="sr"></div>';
  const go = () => {
    const q = norm($('#sq').value.trim()); if (q.length < 2) { $('#sr').innerHTML = '<div class="empty">Tapez au moins 2 lettres.</div>'; return; }
    const clubs = D.clubs.filter((c) => norm(c.name + ' ' + (c.city || '')).includes(q)).slice(0, 8);
    const clubName = (t) => (t.club && IDX.club[t.club]?.name) || '';
    const teams = Object.values(IDX.teams).filter((t) => q.split(/\s+/).every((w) => norm(`${t.name} ${clubName(t)} ${teamLabel(t)}`).includes(w))).sort((x, y) => x.name.localeCompare(y.name) || (teamComps(x)[0]?.order ?? 99) - (teamComps(y)[0]?.order ?? 99)).slice(0, 30);
    const comps = D.comps.filter((c) => norm(c.name).includes(q)).slice(0, 8);
    const sec = (t, arr) => (arr.length ? `<h2>${t}</h2><div class="card list">${arr.join('')}</div>` : '');
    $('#sr').innerHTML = sec('Clubs', clubs.map((c) => `<a href="#/club/${c.code}"><div class="grow"><div>${esc(c.name)}</div><div class="muted small">${esc(c.city || '')}</div></div><span class="chev">›</span></a>`)) +
      sec('Équipes', teams.map((t) => `<a href="#/equipe/${t.id}"><div class="grow"><div><b>${esc(t.name)}</b></div><div class="muted small">${esc(teamSub(t))}</div></div><span class="chev">›</span></a>`)) +
      sec('Compétitions', comps.map((c) => `<a href="#/comp/${c.id}"><div class="grow"><div>${esc(c.name)}</div><div class="muted small">${discLabel(c.disc)} · ${sexeLabel(c.sexe)}</div></div><span class="chev">›</span></a>`)) || '<div class="empty">Aucun résultat.</div>';
    if (!clubs.length && !teams.length && !comps.length) $('#sr').innerHTML = '<div class="empty">Aucun résultat.</div>';
  };
  $('#sq').oninput = go; $('#sq').focus(); go();
};
const notFound = () => (app.innerHTML = '<div class="empty">Page introuvable. <a class="btn" href="#/">Accueil</a></div>');

// ---------- routeur ----------
async function route(keep) {
  const [, name = '', a, b] = location.hash.replace(/^#/, '').split('/');
  const v = { '': 'home', matchs: 'matchs', comps: 'comps', comp: 'comp', clubs: 'equipes', equipes: 'equipes', club: 'club', equipe: 'equipe', match: 'match', actus: 'actus', search: 'search', buteurs: 'buteurs', joueurs: 'joueurs', joueur: 'joueur', arbitres: 'arbitres', arbitre: 'arbitre', agenda: 'agenda' }[name] || 'home';
  const tab = { home: 'home', matchs: 'matchs', match: 'matchs', comps: 'comps', comp: 'comps', buteurs: 'comps', joueurs: 'comps', joueur: 'comps', arbitres: 'comps', arbitre: 'comps', equipes: 'equipes', club: 'equipes', equipe: 'equipes', agenda: 'equipes', actus: 'home', search: 'home' }[v];
  const root = ['home', 'matchs', 'comps', 'equipes', 'actus', 'buteurs', 'joueurs', 'arbitres', 'agenda'].includes(v);
  $('#back').hidden = root;
  document.querySelectorAll('.tabs a').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
  if (!D) { app.innerHTML = '<div class="loading">Chargement des résultats…</div>'; await load(true); }
  if (!D) { app.innerHTML = '<div class="empty">Impossible de charger les données.<br><button class="btn" onclick="location.reload()">Réessayer</button></div>'; return; }
  if (keep !== true) window.scrollTo(0, 0);
  if (keep !== true) track('view', { page: ['equipe', 'comp', 'match', 'club'].includes(v) && a ? `${v}:${a}` : v });
  try { await views[v](a, b); } catch (e) { console.error(e); app.innerHTML = '<div class="empty">Une erreur est survenue.</div>'; }
}
let depth = 0, backing = false; // profondeur de navigation interne (bouton retour)
addEventListener('hashchange', () => { if (backing) { depth = Math.max(depth - 1, 0); backing = false; } else depth++; route(); });
$('#back').onclick = () => { if (depth > 0) { backing = true; history.back(); } else location.hash = '#/'; };

// ---------- mesure d'audience anonyme (identifiant aléatoire, aucune donnée personnelle) ----------
const DNT = navigator.doNotTrack === '1' || window.doNotTrack === '1';
const rnd = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
let VID = store.get('vid', null); if (!VID) { VID = rnd(12); store.set('vid', VID); }
const SID = rnd(8);
function track(type, extra = {}) {
  if (DNT) return;
  try { fetch('/api/track', { method: 'POST', keepalive: true, headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ type, vid: VID, sid: SID, ...extra }) }).catch(() => {}); } catch {}
}
setInterval(() => { if (!document.hidden) track('ping'); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) track('ping'); });

// ---------- Web Push (app fermée) ----------
const b64uToU8 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
async function syncPush(enable) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) { if (enable === false) return false; const { key } = await (await fetch('/api/push/key')).json(); sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToU8(key) }); }
    await fetch('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON(), favs }) });
    return true;
  } catch (e) { console.warn('push', e); return false; }
}

// ---------- alertes de score (app ouverte) ----------
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 4000); }
function askNotif() { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(() => { bellState(); syncPush(); }); }
function bellState() { $('#bell').classList.toggle('on', 'Notification' in window && Notification.permission === 'granted'); }
$('#bell').onclick = async () => { if (!('Notification' in window)) return toast('Notifications non supportées sur cet appareil'); if (Notification.permission === 'denied') return toast('Notifications bloquées dans les réglages'); if (Notification.permission === 'default') await Notification.requestPermission(); bellState(); const ok = Notification.permission === 'granted' && (await syncPush(true)); toast(ok ? 'Alertes activées, même application fermée' : Notification.permission === 'granted' ? 'Alertes actives (application ouverte uniquement)' : 'Alertes désactivées'); };
function diffAlerts() {
  const snap = store.get('snap', null); const cur = {};
  const mine = D.matches.filter(isFavMatch);
  mine.forEach((m) => (cur[m.id] = `${m.s1}-${m.s2}-${m.status}|${m.date || ''}|${m.venue || ''}`));
  const notify = (m, title, body) => {
    toast(body);
    if ('Notification' in window && Notification.permission === 'granted') navigator.serviceWorker?.ready.then((r) => r.showNotification(title, { body, icon: '/icon.svg', tag: m.id, data: { url: '/#/match/' + m.id } }));
  };
  if (snap) for (const m of mine) {
    const old = snap[m.id]; if (old === undefined || old === cur[m.id]) continue;
    const [os, od = null, ov = null] = old.split('|'), [cs] = cur[m.id].split('|');
    const names = `${m.t1.name} – ${m.t2.name}`;
    if (os !== cs && m.status === 'played') notify(m, 'Résultat FFH', `⚽ ${m.t1.name} ${m.s1} - ${m.s2} ${m.t2.name}`);
    else if (od !== null && m.status === 'upcoming' && (od !== (m.date || '') || ov !== (m.venue || ''))) notify(m, 'Match modifié', `🕒 ${names} : ${od !== (m.date || '') ? `nouvel horaire ${m.date ? dayLong(m.date.slice(0, 10)) + (hhmm(m) ? ' ' + hhmm(m) : '') : 'à définir'}` : `nouveau lieu ${m.venue || 'à définir'}`}`);
    else if (os !== cs && m.status === 'cancelled') notify(m, 'Match annulé', `❌ ${names} annulé`);
  }
  store.set('snap', cur);
}

// ---------- démarrage ----------
(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  bellState(); syncPush(false);
  track('hello', { favs: favs.teams, pwa: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true });
  await route(); diffAlerts();
  setInterval(async () => { if (document.hidden) return; if (await load()) { diffAlerts(); if (!/^#\/(search|equipes|clubs)/.test(location.hash)) route(true); } }, 60e3);
})();
