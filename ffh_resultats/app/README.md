# Hockey FFH – Résultats (PWA)

Résultats, calendriers, classements, feuilles de match et actus de la FFH, sans devoir choisir une équipe.

```bash
npm start        # http://localhost:8080  (PORT=… pour changer) — Node ≥ 20, zéro dépendance
npm test
```

## Pourquoi une PWA (et pas app native / site classique)
| Critère | PWA | Native | Site classique |
|---|---|---|---|
| Une seule base de code iOS/Android/desktop | ✅ | ❌ (2 apps ou framework) | ✅ |
| Installable sur l'écran d'accueil | ✅ | ✅ | ❌ |
| Mise à jour instantanée (résultats = contenu vivant) | ✅ | ❌ (review stores) | ✅ |
| Hors-ligne (stade sans réseau) | ✅ | ✅ | ❌ |
| Lien partageable par match/équipe (SEO, WhatsApp) | ✅ | ❌ | ✅ |
| Coût / délai pour une fédération | faible | élevé | faible |

Les stores restent possibles plus tard en encapsulant la PWA (TWA / Capacitor).

## Architecture
- `server.js` : proxy + cache + normalisation des API REST officielles (`championnats.ffhockey.org/rest2`, celles qu'utilise déjà le site actuel). Index complet de la saison (≈ 110 compétitions, 3 000 matchs) reconstruit toutes les 5 min, classements/feuilles en cache court.
- `lib.js` : normalisation + parseur de feuille de match (HTML FFH → JSON : compos, cartons, buteurs, blessures, officiels) + extraction des actus de ffhockey.org (le flux RSS officiel est vide).
- `public/` : front vanilla JS (routeur hash), service worker (réseau d'abord, repli hors-ligne), manifest.

## Fonctions
Accueil personnalisé · Matchs par jour avec filtres (gazon/salle, H/F, favoris, recherche libre équipe/ville/compétition) · Classements, calendriers, buteurs · Fiche club/équipe · Feuille de match native (plus de PDF) · Favoris (clubs/équipes) · Alertes de score · Actus FFH · Recherche globale · Partage.

## Limites connues / suite
- Web Push (app fermée) : implémenté (`push.js`, VAPID). Exige HTTPS ; sur iOS, PWA installée requise. Définir `VAPID_SUBJECT`.
- Pas d'événements de match en direct (la FFH ne publie que le score final) ; un match dont l'heure est passée sans score affiche « ? ».
- Les données sont celles de la FFH ; vérifier avec la fédération les conditions d'usage/CGU de l'API avant diffusion publique.

## Hébergement sur Home Assistant OS (add-on local)
1. `./addon/build.sh` puis copier le dossier `addon/` vers `/addons/ffh_resultats/` (partage Samba « addons » ou add-on SSH).
2. Paramètres → Modules complémentaires → ⋮ → *Rechercher les mises à jour* → installer **Hockey FFH Résultats** → renseigner `vapid_subject` → démarrer.
3. Interface sur `http://<haos>:8099`. Pour l'accès public en HTTPS (obligatoire pour le push) : exposer le port 8099 via Tailscale Funnel, comme le journal de famille.
`/data` de l'add-on est sauvegardé avec les snapshots HA (clés VAPID et abonnements inclus).
