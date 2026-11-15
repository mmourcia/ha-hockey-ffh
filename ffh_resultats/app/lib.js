// Normalisation des données FFH (fonctions pures, testables)
export const decodeEntities = (s = '') =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
export const stripTags = (s = '') => decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const num = (v) => (v === '' || v == null || isNaN(+v) ? null : +v);

export function normMatch(r, comp) {
  const sc = r.Scores || {};
  const j = r.Journee || {};
  const derog = r.RencDateDerog && !r.RencDateDerog.startsWith('0000') ? r.RencDateDerog : null;
  const date = derog || (j.JourDate && !j.JourDate.startsWith('0000') ? j.JourDate : null);
  const s1 = num(sc.RencButsEqp1), s2 = num(sc.RencButsEqp2);
  const forfait = sc.RencForfait === 'O' || sc.RencForfait === 'Y';
  let status = 'upcoming';
  if (r.RencNonJoue === 'O') status = 'cancelled';
  else if (r.RencArrete === 'O') status = 'stopped';
  else if (forfait) status = 'forfeit';
  else if (s1 != null && s2 != null) status = 'played';
  // EquipeId FFH est partagé entre compétitions (ex. LILLE MHC dames/hommes) : identité = compétition + équipe
  const team = (e) => e && { id: `${comp.id}:${e.EquipeId}`, name: e.EquipeNom || 'Exempt', club: (e.Structure?.StructureCode && e.Structure.StructureCode !== '0') ? e.Structure.StructureCode : null };
  const bye = !r.Equipe1?.EquipeNom || !r.Equipe2?.EquipeNom;
  const L = r.LieuDeRencontre || {};
  return {
    id: r.RencId, comp: comp.id, poule: r.Poule?.PouleId || j.PouleId,
    round: j.JourLib || null, roundNum: num(j.JourNum),
    tournoi: r.Tournoi?.TournLib && r.Tournoi.TournId !== '0' ? r.Tournoi.TournLib : null,
    date, t1: team(r.Equipe1), t2: team(r.Equipe2), s1, s2,
    pen1: num(sc.RencPenEqp1), pen2: num(sc.RencPenEqp2),
    bye, status, reason: r.RencNonJoueRaison || r.RencArreteRaison || sc.RencForfaitRaison || null,
    sheet: r.FeuilleMatchDispo === 'O',
    venue: L.Libelle || null, city: L.Adresse?.AdresseCommune || null,
  };
}

export function normComp(c, poules) {
  return {
    id: c.ManifId, name: [c.ManifLib, c.ManifLibComplement].filter(Boolean).join(' – '),
    sexe: c.ManifSexe, disc: c.Discipline?.DisciplineCode, discLabel: c.Discipline?.DisciplineLibelle,
    zone: c.Zone?.ZoneLibelle || null, order: num(c.ManifOrdre) ?? 0,
    poules: poules.map((p) => ({ id: p.PouleId, label: p.PouleLib, phase: p.PhaseId })),
  };
}

export function normStandings(resp) {
  const rows = resp?.Classement?.ClassmentLignes || [];
  return rows.map((l) => ({
    pos: num(l.ClassmPos), last: num(l.ClassmPosLast), pts: num(l.ClassmPts), j: num(l.ClassmMatchJ),
    g: num(l.ClassmMatchG), n: num(l.ClassmMatchN), p: num(l.ClassmMatchP), f: num(l.ClassmMatchF),
    bp: num(l.ClassmButP), bc: num(l.ClassmButC), diff: num(l.ClassmDiff), pen: num(l.ClassmPenalite),
    team: { id: l.Equipe?.EquipeId, name: l.Equipe?.EquipeNom },
  }));
}

export function normScorers(resp) {
  const rows = resp?.ClassementButeurs?.ClassmentButeursLignes || [];
  return rows.map((l) => ({
    rank: num(l.ClassOrdre), goals: num(l.ClasButButs), green: num(l.ClasButVerts),
    yellow: num(l.ClasButJaunes), red: num(l.ClasButRouges),
    name: [l.Personne?.PersonnePrenom, l.Personne?.PersonneNom].filter(Boolean).join(' '),
    club: l.Structure?.StructureNomCourt || l.Structure?.StructureNom || null,
    clubCode: l.Structure?.StructureCode || null,
  }));
}

// Feuille de match : HTML FFH -> JSON structuré
export function parseSheet(html = '') {
  const h = html.replace(/<style>[\s\S]*?<\/style>/g, '');
  const out = { players: [[], []], goals: ['', ''], injuries: ['', ''], officials: [], info: {}, cards: { green: 0, yellow: 0, red: 0 } };
  const tbody = (h.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '';
  for (const row of tbody.match(/<tr>[\s\S]*?<\/tr>/g) || []) {
    const tds = row.match(/<td[\s\S]*?<\/td>/g) || [];
    if (tds.length < 8) continue;
    [0, 4].forEach((o, side) => {
      const name = stripTags(tds[o + 2]);
      if (!name) return;
      const card = /CartonRouge/.test(tds[o + 3]) ? 'red' : /CartonJaune/.test(tds[o + 3]) ? 'yellow' : /CartonVert/.test(tds[o + 3]) ? 'green' : null;
      if (card) out.cards[card]++;
      const cnt = (re) => (tds[o + 3].match(re) || []).length;
      const cd = { green: cnt(/CartonVert/g), yellow: cnt(/CartonJaune/g), red: cnt(/CartonRouge/g) };
      const shirt = stripTags(tds[o + 1]);
      out.players[side].push({ licence: stripTags(tds[o]), shirt, gk: /gardien/i.test(shirt), name, card, cd, hl: /txt-vert|txt-orange/.test(tds[o + 2]) });
    });
  }
  const buteurs = [...h.matchAll(/<strong>Buteurs\s*:\s*<\/strong>([\s\S]*?)<\/div>/g)].map((m) => stripTags(m[1]));
  out.goals = [buteurs[0] || '', buteurs[1] || ''];
  // résolution numéro de maillot -> joueur
  out.scorers = out.goals.map((g, side) => [...g.matchAll(/N°\s*(\d+)\s*(?:\(\s*x\s*(\d+)\s*\))?/gi)].map((m) => {
    const p = out.players[side].find((x) => x.shirt === m[1]);
    return { no: m[1], name: p ? p.name : null, n: +(m[2] || 1) };
  }));
  const inj = [...h.matchAll(/Blessures\s*:\s*<\/strong>([\s\S]*?)<div class="cl2">/g)].map((m) => stripTags(m[1]));
  out.injuries = [inj[0] || '', inj[1] || ''];
  for (const m of h.matchAll(/<strong>(Arbitre \d|Délégué \d|Capitaine[^<]*)<\/strong><\/p>\s*<p>([\s\S]*?)<\/p>/g)) {
    const v = stripTags(m[2]); if (v) out.officials.push({ role: stripTags(m[1]), name: v.replace(/^\d+\s*-\s*/, ''), licence: (v.match(/^(\d+)\s*-/) || [])[1] || null });
  }
  const info = (label) => (h.match(new RegExp(label + '\\s*:?\\s*</strong>\\s*([^<]*)')) || [])[1]?.trim() || null;
  out.info = { date: info('Date'), time: info('Horaire'), field: info('Terrain') };
  out.teamNames = [...h.matchAll(/<strong>NOM : <\/strong>([^<]*)/g)].map((m) => decodeEntities(m[1]).trim());
  return out;
}

export function parseRss(xml = '') {
  const tag = (s, t) => decodeEntities(((s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim();
  return (xml.match(/<item>[\s\S]*?<\/item>/g) || []).map((it) => {
    const raw = (it.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '';
    const descHtml = decodeEntities(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
    const img = (descHtml.match(/<img[^>]+src="([^"]+)"/) || [])[1] || null;
    return {
      title: tag(it, 'title'), link: tag(it, 'link'), date: tag(it, 'pubDate') ? new Date(tag(it, 'pubDate')).toISOString() : null,
      summary: stripTags(descHtml).slice(0, 280), image: img, category: tag(it, 'category') || null,
    };
  });
}

export const clubOf = (name = '') => name.replace(/\s+\d+$/, '').replace(/\s+[A-Z]$/, '');

// News : le flux RSS du site FFH est vide -> extraction des vignettes "magazine-item" (Joomla)
export function parseNewsHtml(html = '', base = 'https://www.ffhockey.org') {
  const out = [];
  for (const blk of html.split('magazine-item link-item').slice(1)) {
    const link = (blk.match(/<a href="(\/actualites\/[^"]+\.html)"[^>]*itemprop="url"/) || blk.match(/<h3[\s\S]*?<a href="([^"]+)"/) || [])[1];
    const title = stripTags((blk.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1] || '');
    if (!link || !title) continue;
    const img = (blk.match(/<img[^>]+src="([^"#?]+)/) || [])[1];
    out.push({
      title, link: base + link, image: img ? (img.startsWith('http') ? img : base + img) : null,
      category: stripTags((blk.match(/itemprop="genre">([\s\S]*?)<\/span>/) || [])[1] || '') || null,
      date: (blk.match(/<time datetime="([^"]+)"/) || [])[1] || null,
      credit: stripTags((blk.match(/class="img-caption">([\s\S]*?)<\/p>/) || [])[1] || '') || null,
    });
  }
  return out;
}
