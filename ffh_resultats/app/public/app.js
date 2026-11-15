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
const isFavTeam = (t) => t && (favs.teams.includes(t.id) || (t.club && favs.clubs.includes(t.club)));
const isFavMatch = (m) => isFavTeam(m.t1) || isFavTeam(m.t2);
const hasFavs = () => favs.clubs.length + favs.teams.length > 0;

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
const shortDay = (m) => (m.date ? dayDate(m.date.slice(0, 10)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '–');
const sexeLabel = (s) => ({ M: 'Hommes', F: 'Femmes', FM: 'Mixte' }[s] || s);
const discLabel = (d) => ({ GAZON: 'Gazon', SALLE: 'Salle', DEVELOP: 'Développement' }[d] || d);
const isLate = (m) => m.status === 'upcoming' && m.date && new Date(m.date.replace(' ', 'T')).getTime() < Date.now() - 2 * 3600e3;
const isLive = (m) => { if (m.status !== 'upcoming' || !m.date) return false; const t = new Date(m.date.replace(' ', 'T')).getTime(); return Date.now() >= t && Date.now() < t + 2 * 3600e3; };

// ---------- composants ----------
function matchCard(m, { showComp = false } = {}) {
  const played = m.status === 'played';
  const w = played ? (m.s1 > m.s2 ? 1 : m.s2 > m.s1 ? 2 : 0) : 0;
  const when = played || m.status === 'forfeit' ? `<b>${m.status === 'forfeit' ? 'FORF.' : 'FIN'}</b>${shortDay(m)}` : m.status === 'cancelled' ? `<b>Annulé</b>${shortDay(m)}` : m.status === 'stopped' ? `<b>Arrêté</b>${shortDay(m)}` : isLate(m) ? `<b>?</b>${shortDay(m)}` : isLive(m) ? `<b style="color:var(--live)">● EN COURS</b>${hhmm(m)}` : `<b>${hhmm(m) || '—'}</b>${shortDay(m)}`;
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

views.home = async () => {
  const mine = hasFavs() ? D.matches.filter((m) => !m.bye && isFavMatch(m)) : [];
  const now = Date.now();
  const t = (m) => new Date((m.date || '').replace(' ', 'T')).getTime();
  const last = mine.filter((m) => m.status === 'played').sort((a, b) => t(b) - t(a)).slice(0, 5);
  const next = mine.filter((m) => m.status === 'upcoming' && t(m) > now - 2 * 3600e3).sort((a, b) => t(a) - t(b)).slice(0, 5);
  let h = '';
  if (!hasFavs()) h += `<div class="hero"><h1>Tous les résultats du hockey français</h1><p>Sans rien choisir : gazon et salle, toutes divisions. Choisissez vos clubs pour un fil personnalisé.</p><a class="btn primary" href="#/clubs">⭐ Choisir mes clubs</a></div>`;
  else {
    h += `<h2>Mes équipes<a href="#/clubs">Gérer</a></h2>`;
    h += next.length ? `<div class="card">${next.map((m) => matchCard(m, { showComp: true })).join('')}</div>` : '<div class="card pad muted">Aucun match à venir programmé.</div>';
    if (last.length) h += `<h2>Derniers résultats</h2><div class="card">${last.map((m) => matchCard(m, { showComp: true })).join('')}</div>`;
  }
  const tk = todayKey();
  const keys = Object.keys(IDX.byDay).sort();
  const dk = IDX.byDay[tk] ? tk : keys.find((k) => k > tk) || keys[keys.length - 1];
  if (dk) h += `<h2>${esc(dayLong(dk))}<a href="#/matchs/${dk}">Tout voir</a></h2>${groupedMatches(IDX.byDay[dk].slice(0, 40))}`;
  h += `<h2>À la une<a href="#/actus">Toutes les actus</a></h2><div class="card" id="home-news"><div class="loading">…</div></div>`;
  app.innerHTML = h;
  api('news').then((n) => { $('#home-news').innerHTML = n.slice(0, 3).map((x, i) => newsCard(x, i === 0)).join(''); }).catch(() => { $('#home-news').innerHTML = '<div class="pad muted">Actualités indisponibles.</div>'; });
};

let mState = { disc: store.get('f.disc', ''), sexe: store.get('f.sexe', ''), fav: false, q: '' };
views.matchs = async (day) => {
  const keys = Object.keys(IDX.byDay).sort();
  const tk = todayKey();
  day = day || keys.find((k) => k >= tk) || keys[keys.length - 1];
  const chip = (k, v, label) => `<button class="chip ${mState[k] === v ? 'on' : ''}" data-f="${k}" data-v="${v}">${label}</button>`;
  const near = keys.filter((k) => Math.abs(dayDate(k) - dayDate(day)) < 40 * 864e5);
  app.innerHTML = `<input class="search" id="mq" type="search" placeholder="Équipe, club, compétition, ville…" value="${esc(mState.q)}">
  <div class="chips">${chip('disc', '', 'Tout')}${chip('disc', 'GAZON', 'Gazon')}${chip('disc', 'SALLE', 'Salle')}<span style="width:8px"></span>${chip('sexe', '', 'H + F')}${chip('sexe', 'M', 'Hommes')}${chip('sexe', 'F', 'Femmes')}${hasFavs() ? `<span style="width:8px"></span><button class="chip ${mState.fav ? 'on' : ''}" data-fav>★ Mes équipes</button>` : ''}</div>
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
  $('[data-fav]')?.addEventListener('click', () => { mState.fav = !mState.fav; views.matchs(day); });
};

views.comps = async () => {
  const by = {};
  D.comps.forEach((c) => ((by[c.disc] ||= {})[c.sexe] ||= []).push(c));
  let h = '<h1>Compétitions</h1>';
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

let cTab = 'standings';
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
      box.innerHTML = d.scorers.length ? `<div class="card"><table class="t"><tr><th>#</th><th class="l">Joueur</th><th>Buts</th><th title="Verts">🟩</th><th>🟨</th><th>🟥</th></tr>${d.scorers.map((s) => `<tr class="${favs.clubs.includes(s.clubCode) ? 'fav' : ''}"><td class="pos">${s.rank}</td><td class="team">${esc(s.name)}<div class="muted small">${esc(s.club || '')}</div></td><td class="pts">${s.goals}</td><td>${s.green || ''}</td><td>${s.yellow || ''}</td><td>${s.red || ''}</td></tr>`).join('')}</table></div>` : '<div class="empty">Pas encore de buteurs.</div>';
      return;
    }
    box.innerHTML = d.standings.length ? `<div class="card"><table class="t"><tr><th>#</th><th class="l">Équipe</th><th>J</th><th>G</th><th>N</th><th>P</th><th>+/-</th><th>Pts</th></tr>${d.standings.map((r) => { const t = IDX.teams[r.team.id]; const fav = isFavTeam(t); const mv = r.last && r.pos < r.last ? '<span class="up">▲</span>' : r.last && r.pos > r.last ? '<span class="dn">▼</span>' : ''; return `<tr class="${fav ? 'fav' : ''}"><td class="pos">${r.pos}</td><td class="team"><a href="#/equipe/${r.team.id}">${esc(r.team.name)}</a> ${mv}</td><td>${r.j}</td><td>${r.g}</td><td>${r.n}</td><td>${r.p + (r.f || 0)}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td><td class="pts">${r.pts}</td></tr>`; }).join('')}</table></div><p class="muted small">Pts = points officiels FFH (pénalités déduites). ▲▼ = évolution depuis la journée précédente.</p>` : '<div class="empty">Classement non disponible pour cette poule.</div>';
  } catch { box.innerHTML = '<div class="empty">Source FFH indisponible. Réessayez.</div>'; }
};

views.clubs = async () => {
  app.innerHTML = `<h1>Clubs & favoris</h1><input class="search" id="cq" type="search" placeholder="Rechercher un club ou une ville…" autocomplete="off"><div id="cl"></div>`;
  const draw = () => {
    const q = norm($('#cq').value);
    const list = D.clubs.filter((c) => !q || norm(c.name + ' ' + c.full + ' ' + (c.city || '')).includes(q)).sort((a, b) => (favs.clubs.includes(b.code) - favs.clubs.includes(a.code)) || a.name.localeCompare(b.name));
    $('#cl').innerHTML = `<div class="card list">${list.map((c) => `<div class="row"><a style="padding:0;border:0" class="grow" href="#/club/${c.code}"><div>${esc(c.name)}</div><div class="muted small">${esc(c.city || '')}</div></a>${star(favs.clubs.includes(c.code), `data-club="${c.code}"`)}</div>`).join('') || '<div class="empty">Aucun club.</div>'}</div>`;
    $('#cl').querySelectorAll('[data-club]').forEach((b) => (b.onclick = () => { toggleClub(b.dataset.club); draw(); }));
  };
  $('#cq').oninput = draw; draw();
};
function toggleClub(code) { const i = favs.clubs.indexOf(code); i < 0 ? favs.clubs.push(code) : favs.clubs.splice(i, 1); saveFavs(); if (favs.clubs.includes(code)) askNotif(); }

views.club = async (code) => {
  const c = IDX.club[code]; if (!c) return notFound();
  const teams = Object.values(IDX.teams).filter((t) => t.club === code);
  const ms = D.matches.filter((m) => m.t1.club === code || m.t2.club === code).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const tk = todayKey(); const upcoming = ms.filter((m) => m.status === 'upcoming'); const done = ms.filter((m) => m.status !== 'upcoming').reverse();
  app.innerHTML = `<div class="row" style="display:flex;align-items:center;justify-content:space-between"><div><h1 style="margin-bottom:0">${esc(c.name)}</h1><div class="muted small">${esc(c.city || '')}</div></div>${star(favs.clubs.includes(code), 'id="fav"')}</div>
  <h2>Équipes engagées</h2><div class="card list">${teams.map((t) => `<a href="#/equipe/${t.id}"><div class="grow"><div>${esc(t.name)}</div><div class="muted small">${[...t.comps].map((id) => esc(IDX.comp[id]?.name)).join(' · ')}</div></div><span class="chev">›</span></a>`).join('') || '<div class="pad muted">Aucune équipe engagée cette saison.</div>'}</div>
  ${upcoming.length ? `<h2>À venir</h2><div class="card">${upcoming.slice(0, 15).map((m) => matchCard(m, { showComp: true })).join('')}</div>` : ''}
  ${done.length ? `<h2>Résultats</h2><div class="card">${done.slice(0, 20).map((m) => matchCard(m, { showComp: true })).join('')}</div>` : ''}`;
  $('#fav').onclick = () => { toggleClub(code); views.club(code); };
};

views.equipe = async (id) => {
  const t = IDX.teams[id]; if (!t) return notFound();
  const ms = D.matches.filter((m) => m.t1.id === id || m.t2.id === id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const on = favs.teams.includes(id);
  app.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between"><div><h1 style="margin-bottom:0">${esc(t.name)}</h1><div class="muted small">${[...t.comps].map((c) => `<a href="#/comp/${c}" style="color:var(--acc)">${esc(IDX.comp[c]?.name)}</a>`).join(' · ')}</div></div>${star(on, 'id="fav"')}</div>
  ${t.club && IDX.club[t.club] ? `<p><a class="btn" href="#/club/${t.club}">Voir le club ${esc(IDX.club[t.club].name)}</a></p>` : ''}
  <h2>Calendrier & résultats</h2><div class="card">${ms.map((m) => matchCard(m, { showComp: true })).join('')}</div>`;
  $('#fav').onclick = () => { const i = favs.teams.indexOf(id); i < 0 ? favs.teams.push(id) : favs.teams.splice(i, 1); saveFavs(); if (i < 0) askNotif(); views.equipe(id); };
};

views.match = async (id) => {
  const m = D.matches.find((x) => x.id === id); if (!m) return notFound();
  const c = IDX.comp[m.comp];
  const played = m.status === 'played';
  app.innerHTML = `<div class="card"><div class="sheet-h"><a class="muted small" href="#/comp/${m.comp}">${esc(c?.name || '')}${m.round ? ' · ' + esc(m.round) : ''}</a>
  <div class="vs"><a class="tn" href="#/equipe/${m.t1.id}">${esc(m.t1.name)}</a><div class="big">${played ? `${m.s1} - ${m.s2}` : m.status === 'forfeit' ? 'Forfait' : 'vs'}</div><a class="tn" href="#/equipe/${m.t2.id}">${esc(m.t2.name)}</a></div>
  <div class="kv"><span>📅 ${m.date ? esc(dayLong(m.date.slice(0, 10))) : 'Date à définir'}${hhmm(m) ? ' · ' + hhmm(m) : ''}</span>${m.venue ? `<span>📍 ${esc(m.venue)}${m.city ? ', ' + esc(m.city) : ''}</span>` : ''}${m.reason ? `<span class="tag warn">${esc(m.reason)}</span>` : ''}</div>
  <p style="margin:12px 0 0"><button class="btn" id="share">Partager</button> ${m.venue ? `<a class="btn" target="_blank" rel="noopener" href="https://www.openstreetmap.org/search?query=${encodeURIComponent(m.venue + ' ' + (m.city || ''))}">Itinéraire</a>` : ''}</p></div></div>
  <div id="sheet">${m.sheet ? '<div class="loading">Chargement de la feuille de match…</div>' : '<div class="empty">Feuille de match pas encore disponible.</div>'}</div>`;
  $('#share').onclick = async () => { const data = { title: `${m.t1.name} – ${m.t2.name}`, text: played ? `${m.t1.name} ${m.s1}-${m.s2} ${m.t2.name}` : `${m.t1.name} – ${m.t2.name}`, url: location.href }; try { navigator.share ? await navigator.share(data) : (await navigator.clipboard.writeText(location.href), toast('Lien copié')); } catch {} };
  if (!m.sheet) return;
  try {
    const s = await api('match/' + id);
    const col = (i) => `<div><div class="small muted" style="margin-bottom:4px"><b>${esc(m['t' + (i + 1)].name)}</b></div>${s.goals[i] ? `<div class="pl"><span>⚽</span><span>${esc(s.goals[i])}</span></div>` : ''}${s.players[i].map((p) => `<div class="pl"><span class="no">${p.gk ? 'GK' : esc(p.shirt)}</span><span class="nm">${esc(p.name)}</span>${p.card ? `<span class="cd ${p.card}" title="Carton"></span>` : ''}</div>`).join('')}${s.injuries[i] ? `<div class="small muted" style="margin-top:6px">🩹 ${esc(s.injuries[i])}</div>` : ''}</div>`;
    const cd = s.cards;
    $('#sheet').innerHTML = `<h2>Feuille de match</h2><div class="card"><div class="cols">${col(0)}${col(1)}</div></div>
    ${cd.green + cd.yellow + cd.red ? `<p class="small muted center">Cartons : ${cd.green ? `<span class="cd green"></span> ×${cd.green} ` : ''}${cd.yellow ? `<span class="cd yellow"></span> ×${cd.yellow} ` : ''}${cd.red ? `<span class="cd red"></span> ×${cd.red}` : ''}</p>` : ''}
    ${s.officials.length ? `<h2>Officiels</h2><div class="card list">${s.officials.map((o) => `<div class="row"><div class="grow"><div>${esc(o.name)}</div><div class="muted small">${esc(o.role)}</div></div></div>`).join('')}</div>` : ''}`;
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
    const teams = Object.values(IDX.teams).filter((t) => norm(t.name).includes(q)).slice(0, 10);
    const comps = D.comps.filter((c) => norm(c.name).includes(q)).slice(0, 8);
    const sec = (t, arr) => (arr.length ? `<h2>${t}</h2><div class="card list">${arr.join('')}</div>` : '');
    $('#sr').innerHTML = sec('Clubs', clubs.map((c) => `<a href="#/club/${c.code}"><div class="grow"><div>${esc(c.name)}</div><div class="muted small">${esc(c.city || '')}</div></div><span class="chev">›</span></a>`)) +
      sec('Équipes', teams.map((t) => `<a href="#/equipe/${t.id}"><div class="grow"><div>${esc(t.name)}</div></div><span class="chev">›</span></a>`)) +
      sec('Compétitions', comps.map((c) => `<a href="#/comp/${c.id}"><div class="grow"><div>${esc(c.name)}</div><div class="muted small">${discLabel(c.disc)} · ${sexeLabel(c.sexe)}</div></div><span class="chev">›</span></a>`)) || '<div class="empty">Aucun résultat.</div>';
    if (!clubs.length && !teams.length && !comps.length) $('#sr').innerHTML = '<div class="empty">Aucun résultat.</div>';
  };
  $('#sq').oninput = go; $('#sq').focus(); go();
};
const notFound = () => (app.innerHTML = '<div class="empty">Page introuvable. <a class="btn" href="#/">Accueil</a></div>');

// ---------- routeur ----------
async function route(keep) {
  const [, name = '', a, b] = location.hash.replace(/^#/, '').split('/');
  const v = { '': 'home', matchs: 'matchs', comps: 'comps', comp: 'comp', clubs: 'clubs', club: 'club', equipe: 'equipe', match: 'match', actus: 'actus', search: 'search' }[name] || 'home';
  const tab = { home: 'home', matchs: 'matchs', match: 'matchs', comps: 'comps', comp: 'comps', clubs: 'clubs', club: 'clubs', equipe: 'clubs', actus: 'actus' }[v];
  document.querySelectorAll('.tabs a').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
  if (!D) { app.innerHTML = '<div class="loading">Chargement des résultats…</div>'; await load(true); }
  if (!D) { app.innerHTML = '<div class="empty">Impossible de charger les données.<br><button class="btn" onclick="location.reload()">Réessayer</button></div>'; return; }
  if (keep !== true) window.scrollTo(0, 0);
  try { await views[v](a, b); } catch (e) { console.error(e); app.innerHTML = '<div class="empty">Une erreur est survenue.</div>'; }
}
addEventListener('hashchange', () => route());

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
  D.matches.filter(isFavMatch).forEach((m) => (cur[m.id] = `${m.s1}-${m.s2}-${m.status}`));
  if (snap) for (const m of D.matches.filter(isFavMatch)) {
    if (snap[m.id] !== undefined && snap[m.id] !== cur[m.id] && m.status === 'played') {
      const body = `${m.t1.name} ${m.s1} - ${m.s2} ${m.t2.name}`;
      toast('⚽ ' + body);
      if ('Notification' in window && Notification.permission === 'granted') navigator.serviceWorker?.ready.then((r) => r.showNotification('Résultat FFH', { body, icon: '/icon.svg', tag: m.id, data: { url: '/#/match/' + m.id } }));
    }
  }
  store.set('snap', cur);
}

// ---------- démarrage ----------
(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  bellState(); syncPush(false);
  await route(); diffAlerts();
  setInterval(async () => { if (document.hidden) return; if (await load()) { diffAlerts(); if (!/^#\/(search|clubs)/.test(location.hash)) route(true); } }, 60e3);
})();
