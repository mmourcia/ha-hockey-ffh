// Web Push sans dépendance : VAPID (ES256) + push "sans charge utile".
// Le service worker récupère ensuite le détail via /api/push/pending (pas de chiffrement de payload nécessaire).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const b64u = (b) => Buffer.from(b).toString('base64url');

export function createPush(dataDir, subject = process.env.VAPID_SUBJECT || 'mailto:contact@example.org') {
  const keyFile = path.join(dataDir, 'vapid.json');
  const subFile = path.join(dataDir, 'subs.json');
  let keys;
  if (fs.existsSync(keyFile)) keys = JSON.parse(fs.readFileSync(keyFile));
  else {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    keys = { priv: privateKey.export({ format: 'pem', type: 'pkcs8' }), pub: b64u(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')])) };
    fs.writeFileSync(keyFile, JSON.stringify(keys), { mode: 0o600 });
  }
  const subs = fs.existsSync(subFile) ? JSON.parse(fs.readFileSync(subFile)) : {}; // endpoint -> {sub, favs, pending[]}
  const save = () => fs.writeFileSync(subFile, JSON.stringify(subs));

  function jwt(aud) {
    const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const p = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
    const sig = crypto.sign('sha256', Buffer.from(`${h}.${p}`), { key: keys.priv, dsaEncoding: 'ieee-p1363' });
    return `${h}.${p}.${b64u(sig)}`;
  }
  async function ping(endpoint) {
    const r = await fetch(endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: 'high', 'Content-Length': '0', Authorization: `vapid t=${jwt(new URL(endpoint).origin)}, k=${keys.pub}` }, signal: AbortSignal.timeout(15e3) });
    if (r.status === 404 || r.status === 410) { delete subs[endpoint]; save(); }
    return r.status;
  }
  const valid = (s) => s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint);
  return {
    publicKey: keys.pub,
    subscribe(sub, favs) {
      if (!valid(sub)) throw new Error('subscription invalide');
      const clean = { clubs: (favs?.clubs || []).slice(0, 50).map(String), teams: (favs?.teams || []).slice(0, 100).map(String) };
      subs[sub.endpoint] = { sub: { endpoint: sub.endpoint }, favs: clean, pending: subs[sub.endpoint]?.pending || [] }; save();
    },
    unsubscribe(endpoint) { delete subs[endpoint]; save(); },
    take(endpoint) { const s = subs[endpoint]; if (!s) return []; const p = s.pending; s.pending = []; save(); return p; },
    // events: [{match}] des scores nouveaux/modifiés
    async notify(matches) {
      let sent = 0;
      for (const s of Object.values(subs)) {
        const mine = matches.filter((m) => [m.t1, m.t2].some((t) => s.favs.teams.includes(t.id) || (t.club && s.favs.clubs.includes(t.club))));
        if (!mine.length) continue;
        mine.slice(0, 5).forEach((m) => s.pending.push({ id: m.id, title: 'Résultat FFH', body: `${m.t1.name} ${m.s1} - ${m.s2} ${m.t2.name}`, url: `/#/match/${m.id}` }));
        s.pending = s.pending.slice(-20); save();
        await ping(s.sub.endpoint).then(() => sent++).catch((e) => console.warn('push', e.message));
      }
      return sent;
    },
  };
}
