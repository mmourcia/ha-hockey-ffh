# Changelog

## 1.0.0
- Première version : résultats, classements, feuilles de match, favoris, actus, Web Push.

## 1.0.1
- Icônes PNG (add-on et PWA), manifest et apple-touch-icon.

## 1.0.2
- Favoris par équipe précise (Élite Hommes, Élite Dames, U13 Filles… distincts) : correction de l'identifiant d'équipe FFH partagé entre compétitions.
- Nouvel écran « Équipes » (recherche par club, ville, compétition, filtres).
- Bouton retour sur tous les écrans de détail.

## 1.0.3
- Feuille de match : les buteurs sont nommés (numéro résolu en joueur).
- Nouvel écran « Buteurs » : classement par compétition (onglet Classements).
- Accueil compact : un bloc par équipe suivie, 6 matchs du jour, 2 actus.
- Menu toujours visible (en haut sur ordinateur).

## 1.1.0
- Section Joueurs : recherche par nom, buts, cartons et matchs (agrégés depuis les feuilles de match ; catégories de jeunes exclues, aucun numéro de licence exposé).
- Buteurs : championnats de vos équipes favorites en premier.
- Publication HTTPS intégrée via Tailscale Funnel (options `tailscale_authkey` et `tailscale_hostname`).

## 1.2.0
- Panneau « Hockey FFH » dans la barre latérale de Home Assistant (Ingress) : état de la synchro FFH, lien public cliquable, feuilles/joueurs, notifications push, historique, boutons de synchronisation.

## 1.3.0
- Option `include_youth_players` (désactivée par défaut) pour inclure les catégories de jeunes dans la section Joueurs.

## 1.3.1
- Correctif : les cartons du classement des buteurs étaient faux (l’API FFH les cumule) ; ils sont désormais recalculés depuis les feuilles de match.

## 1.4.0
- Classements d’équipes triables par colonne (meilleure attaque BP, meilleure défense BC, différence, victoires…).
