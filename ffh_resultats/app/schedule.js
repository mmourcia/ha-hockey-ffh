// Ordonnancement intelligent des synchronisations FFH : rapide autour des matchs, espacé quand rien ne se passe.
import { parisToDate } from './ics.js';

const MIN = 60e3, H = 3600e3;
// fenêtre d'un match : de 30 min avant le coup d'envoi à 4 h après (les scores sont saisis par les clubs dans l'heure qui suit)
export const WINDOW = { before: 30 * MIN, after: 4 * H };

function startOf(m) {
  if (!m.date || m.bye) return null;
  const timed = m.date.slice(11, 16) !== '00:00';
  const d = parisToDate(timed ? m.date : m.date.slice(0, 10) + ' 10:00:00'); // horaire inconnu : on surveille la journée
  return d ? d.getTime() : null;
}

// retourne { delay (ms), mode, why } ; base = cadence « en direct » (réglage refresh_minutes)
export function nextDelay(matches, now = Date.now(), base = 5 * MIN) {
  let live = false, nextStart = Infinity;
  for (const m of matches) {
    if (m.status === 'cancelled') continue;
    const s = startOf(m); if (s == null) continue;
    const untimed = m.date.slice(11, 16) === '00:00';
    const before = untimed ? 4 * H : WINDOW.before, after = untimed ? 12 * H : WINDOW.after;
    if (now >= s - before && now <= s + after) live = true;
    else if (s - before > now) nextStart = Math.min(nextStart, s - before);
  }
  if (live) return { delay: base, mode: 'live' };
  const until = nextStart - now; // avant le début de la prochaine fenêtre
  const cap = (d, mode) => ({ delay: Math.max(MIN, Math.min(d, until)), mode });
  if (!isFinite(until)) return { delay: 6 * H, mode: 'idle' };
  if (until <= 3 * H) return cap(30 * MIN, 'soon'); // dernière ligne droite : reports / changements de terrain
  if (until <= 24 * H) return cap(2 * H, 'today');
  return cap(6 * H, 'idle'); // rien à surveiller : on ne dérange pas la FFH (réveil exact avant le prochain match)
}

// compétitions ayant un match dans sa fenêtre de suivi (pour ne relire que celles-là pendant les matchs)
export function liveComps(matches, now = Date.now()) {
  const out = new Set();
  for (const m of matches) {
    if (m.status === 'cancelled') continue;
    const s = startOf(m); if (s == null) continue;
    const untimed = m.date.slice(11, 16) === '00:00';
    if (now >= s - (untimed ? 4 * H : WINDOW.before) && now <= s + (untimed ? 12 * H : WINDOW.after)) out.add(m.comp);
  }
  return out;
}
