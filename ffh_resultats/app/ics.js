// Agenda iCalendar (.ics) des matchs d'équipes favorites — fonctions pures
const pad = (n) => String(n).padStart(2, '0');
const esc = (s = '') => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// repli des lignes à 75 octets
const fold = (l) => { const b = Buffer.from(l); if (b.length <= 74) return l; let out = '', cur = ''; for (const ch of l) { if (Buffer.byteLength(cur + ch) > (out ? 73 : 74)) { out += (out ? '\r\n ' : '') + cur; cur = ''; } cur += ch; } return out + (out ? '\r\n ' : '') + cur; };

// "2026-11-15 16:00:00" (heure de Paris) -> Date UTC
export function parisToDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s || ''); if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const off = (t) => { const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t; };
  return new Date(guess - off(guess - off(guess)));
}
const utc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

// teams : [{ id, prefix }]  ; opts : { base, alarm (minutes, 0 = aucun), duration (minutes), name }
export function buildIcs(matches, comps, teams, { base = '', alarm = 0, duration = 120, name = 'Hockey FFH' } = {}) {
  const pre = new Map(teams.map((t) => [t.id, t.prefix || '']));
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hockey FFH Resultats//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(name)}`, `NAME:${esc(name)}`, 'X-WR-CALDESC:Matchs de vos équipes favorites (Hockey FFH – Résultats)', 'X-WR-TIMEZONE:Europe/Paris', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  const stamp = utc(new Date());
  const seen = new Set();
  for (const m of matches) {
    if (m.bye || !m.date || !m.t1 || !m.t2) continue;
    const mine = [m.t1.id, m.t2.id].filter((id) => pre.has(id)); if (!mine.length) continue;
    const prefix = pre.get(mine[0]); // si les deux équipes sont suivies, on garde le préfixe de la première
    const comp = comps[m.comp];
    const score = m.status === 'played' ? ` (${m.s1}-${m.s2})` : '';
    const title = `${prefix}${m.t1.name} vs ${m.t2.name}${score}${m.status === 'forfeit' ? ' (forfait)' : ''}`;
    const timed = m.date.slice(11, 16) !== '00:00';
    const ev = ['BEGIN:VEVENT', `UID:${m.id}-${mine[0].replace(/[^\w]/g, '')}@ffh-resultats`, `DTSTAMP:${stamp}`];
    if (timed) { const s = parisToDate(m.date); if (!s) continue; ev.push(`DTSTART:${utc(s)}`, `DTEND:${utc(new Date(s.getTime() + duration * 60e3))}`); }
    else { const d = m.date.slice(0, 10).replace(/-/g, ''); const e = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8) + 1)); ev.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${e.getUTCFullYear()}${pad(e.getUTCMonth() + 1)}${pad(e.getUTCDate())}`); }
    ev.push(`SUMMARY:${esc(title)}`);
    const desc = [comp && `${comp.name}${m.round ? ' – ' + m.round : ''}`, comp && [comp.disc === 'SALLE' ? 'Salle' : 'Gazon', comp.sexe === 'F' ? 'Femmes' : comp.sexe === 'M' ? 'Hommes' : ''].filter(Boolean).join(' · '), m.reason, base && `Feuille de match : ${base}/#/match/${m.id}`].filter(Boolean).join('\n');
    ev.push(`DESCRIPTION:${esc(desc)}`);
    const loc = [m.venue, m.city].filter(Boolean).join(', '); if (loc) ev.push(`LOCATION:${esc(loc)}`);
    if (base) ev.push(`URL:${base}/#/match/${m.id}`);
    ev.push(`STATUS:${m.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:TRANSPARENT');
    if (alarm > 0 && timed && m.status === 'upcoming') ev.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, `TRIGGER:-PT${alarm}M`, 'END:VALARM');
    ev.push('END:VEVENT');
    if (seen.has(ev[1])) continue; seen.add(ev[1]); L.push(...ev);
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

// "id|préfixe" (valeur du paramètre t)
export const parseTeams = (vals = []) => vals.map((v) => { const i = v.indexOf('|'); return i < 0 ? { id: v, prefix: '' } : { id: v.slice(0, i), prefix: v.slice(i + 1).slice(0, 40) }; }).filter((t) => /^\d+:\d+$/.test(t.id)).slice(0, 30);
