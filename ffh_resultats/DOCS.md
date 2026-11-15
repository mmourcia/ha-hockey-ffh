# Hockey FFH – Résultats

PWA de résultats de la Fédération Française de Hockey (gazon, salle, développement) : matchs, classements, feuilles de match natives, favoris, actus, Web Push.

## Configuration
| Option | Rôle |
|---|---|
| `vapid_subject` | Contact `mailto:` envoyé aux services push (obligatoire en pratique) |
| `refresh_minutes` | Fréquence de relecture des API FFH (défaut 5) |

## Accès
Interface sur le port **8099**. Le Web Push exige HTTPS : exposez ce port avec Tailscale Funnel ou un reverse proxy.
Les clés VAPID, abonnements et le cache sont dans `/data` (inclus dans les sauvegardes HA).
