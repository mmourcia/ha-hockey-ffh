# Hockey FFH – Résultats

PWA de résultats de la Fédération Française de Hockey (gazon, salle, développement) : matchs, classements, feuilles de match natives, favoris, actus, Web Push.

## Configuration
| Option | Rôle |
|---|---|
| `vapid_subject` | Contact `mailto:` envoyé aux services push (obligatoire en pratique) |
| `refresh_minutes` | Cadence de relecture des API FFH pendant les matchs (défaut 5). Hors matchs la synchronisation s'espace toute seule : toutes les 10 min dans les 3 h avant un match, 30 min dans les 24 h avant, 60 min sinon ; elle repart de 30 min avant chaque coup d'envoi jusqu'à 4 h après. |
| `include_youth_players` | `false` par défaut. Si `true`, les joueurs des catégories de jeunes (mineurs) sont indexés et consultables dans la section Joueurs. À n'activer qu'avec l'accord de la fédération si le site est public |
| `tailscale_authkey` | Clé `tskey-auth-…` réutilisable : publie le site en HTTPS via Tailscale Funnel (laisser vide pour ne pas publier) |
| `tailscale_hostname` | Nom de l'appareil : adresse `https://<nom>.<réseau>.ts.net` |

## Accès
Interface sur le port **8099**. Le Web Push exige HTTPS : renseignez `tailscale_authkey` (prérequis : HTTPS et Funnel activés dans la console Tailscale) ou utilisez un reverse proxy.
Les clés VAPID, abonnements et le cache sont dans `/data` (inclus dans les sauvegardes HA).
