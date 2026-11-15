# Hockey FFH – Résultats (add-on Home Assistant)

PWA de résultats de la Fédération Française de Hockey, packagée comme add-on Home Assistant OS.

## Installation
[![Ajouter ce dépôt à Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fmmourcia%2Fha-hockey-ffh)

1. Paramètres → Modules complémentaires → Boutique → ⋮ → **Dépôts** → ajouter `https://github.com/mmourcia/ha-hockey-ffh`.
2. Installer **Hockey FFH – Résultats**, renseigner `vapid_subject`, démarrer.
3. Ouvrir `http://<haos>:8099` ; exposer en HTTPS (Tailscale Funnel) pour le Web Push.

## Développement local
```bash
cd ffh_resultats/app && npm start   # http://localhost:8080
npm test
```
Détails techniques, choix PWA et limites : [ffh_resultats/app/README.md](ffh_resultats/app/README.md).
