# Changelog

## 1.9.0
- Ergonomie : la date passe devant l'heure sur les cartes de match ; 4 onglets (Actus accessible depuis l'accueil) ; filtres de la page Matchs repliés derrière un bouton ; premier lancement guidé (« Quelle est votre équipe ? »).
- Équipes homonymes : compétition et catégorie affichées partout (recherche, listes), recherche aussi par club.
- Agenda : abonnement ICS (Google Agenda, Apple, Outlook) aux matchs des équipes favorites, préfixe personnalisé par équipe, rappel, mise à jour automatique des horaires/lieux/scores (page #/agenda).
- Accueil « Cette semaine » : matchs à venir des favoris avec lieu, itinéraire, météo et partage aux autres parents ; alerte quand l'horaire ou le lieu d'un match change.
- Fiche match à venir : « Avant le match » (classement, 5 derniers, attaque/défense, meilleur buteur, cartons, confrontations de la saison).

## 1.8.1
- Fiche équipe, onglet Joueurs : même tri (buts, total des cartons, verts, jaunes, rouges, matchs) ; total « Σ » affiché partout.

## 1.8.0
- Classement par joueur : tri par buts, total des cartons (tous cartons confondus), verts, jaunes, rouges ou matchs ; le total « Σ » s'affiche sur chaque joueur.
- Onglet Buteurs d'une compétition : colonnes cliquables (buts, Σ cartons, 🟩, 🟨, 🟥).

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

## 1.5.0
- Équipes favorites : rang et points sur l’accueil, raccourcis Classement / Calendrier / Joueurs, fiche équipe à onglets (Matchs, Classement, Joueurs).

## 1.5.1
- Correctif : page Club (erreur), boutons de raccourcis qui se chevauchent, encadrement (chef d’équipe, entraîneur) recouvert sur les feuilles de match, « 1 m. » remplacé par « 1 match ».

## 1.5.2
- Accueil : bloc équipe favorite refait (en-tête, boutons Classement/Calendrier/Joueurs en grille, matchs) pour éviter tout chevauchement.

## 1.6.0
- Nouvelle section Arbitres (Classements → Arbitres) : matchs arbitrés, cartons verts/jaunes/rouges, cartons par match, fiche détaillée par arbitre. Pour un match arbitré à deux, les cartons comptent pour chaque arbitre. Les arbitres de la feuille de match sont cliquables.
- Au premier démarrage, les feuilles déjà stockées sont relues une fois pour récupérer les arbitres.

## 1.7.0
- Panneau HA : nouvel onglet « Fréquentation » (visiteurs en ligne, visiteurs par jour/semaine, durée des visites, pages et rubriques les plus vues, équipes les plus mises en favori, appareils, liste des visiteurs anonymes avec leurs favoris).
- Mesure anonyme : identifiant aléatoire par navigateur, sans adresse IP ni nom ; respecte « Ne pas suivre » ; conservation 180 jours ; mention sur l’accueil.

## 1.7.1
- Feuille de match : les arbitres sont des lignes cliquables (« voir ses statistiques ») menant à leur fiche.
- Confidentialité : les numéros de licence ne sont plus renvoyés par l’API publique (joueurs, blessures).
