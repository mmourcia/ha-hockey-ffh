# Changelog

## 1.14.1
- Le badge du direct précise l'état : « Quart-temps N · chrono », « Fin du Q1 », « Mi-temps » (pause après le Q2), « Fin du Q3 », « Fin du Q4 », « Fin de match ». Le bouton de saisie reste « Pause » : l'appli déduit le libellé du quart-temps qui vient de se terminer. Pastilles des cartes alignées (« ● Mi-temps »).

## 1.14.0
- Saisie d'un but en deux temps : « But » enregistre et compte tout de suite ; l'appli demande ensuite « Qui ? » avec les joueurs de l'équipe (suggestions, recherche par prénom / nom / n°) ; « Je ne sais pas » ferme sans buteur. Un seul joueur correspondant au texte = son nom officiel est utilisé ; plusieurs = le bon est à toucher dans la liste ; aucun = texte conservé tel quel. Même question après l'issue « But » d'un penalty corner ou d'un stroke.
- Le buteur peut être renseigné ou corrigé après coup (action `who`).

## 1.13.3
- Fiche match : quand personne ne saisit encore, le tableau affiche les deux équipes et « 0 – 0 » (les noms d'équipes étaient masqués).

## 1.13.2
- Match de démonstration (#/match/demo) : reprend les équipes réelles de PHC Marcq – LMHC (15 nov.) pour tester la saisie avec un vrai effectif (résolution des buteurs, ex. « Yvan » → HANNOIR YVAN).

## 1.13.1
- Agenda : adresse d'abonnement en `/cal/hockey-ffh.ics` (plus compatible avec Google Agenda), nom d'agenda personnalisable, description du calendrier ; explications sur le délai de première lecture par Google et l'ajout manuel « À partir de l'URL ».

## 1.13.0
- Frise du direct : chaque fait porte le chrono du quart-temps (« Q2 07:32 ») au lieu de l'heure ; badge de validation sur chaque ligne (« 1 personne » ou « ✓ validé par N personnes »).
- Chrono : « Pause » arrête le chrono et le retour sur le même quart-temps le reprend (plus de remise à zéro) ; un nouveau quart-temps repart de 00:00.
- Saisie du buteur : texte libre résolu sur l'effectif de l'équipe (prénom, nom, n° de maillot dans n'importe quel ordre) ; suggestions pendant la frappe ; si plusieurs joueurs correspondent, le choix est proposé.
- L'index des joueurs conserve le dernier n° de maillot connu (jamais le n° de licence).

## 1.12.1
- Chrono indicatif : il ne s'arrête plus à 15:00, il continue (16:42, 18:10…) jusqu'à ce qu'un saisisseur déclare le quart-temps suivant. Le cumul « ≈ N' de jeu » reste plafonné à 15' par quart-temps.

## 1.12.0
- Temps réel : la fiche match reçoit les mises à jour par flux SSE (quasi instantané, sans rafraîchir) ; l'interrogation périodique ne sert plus que de secours. Mise à jour immédiate au réveil du téléphone / retour sur l'onglet.
- Chrono indicatif visible par les spectateurs : « Quart-temps 2 · 07:32 » et « ≈ 22' de jeu », avec la mention qu'il n'inclut pas les arrêts de jeu (penalty corners, strokes, blessures…). Une minute approximative s'affiche aussi sur les pastilles « ● Q2 » des cartes.

## 1.11.4
- « Je saisis ce match » n'est plus mémorisé définitivement : il vaut pour l'onglet en cours (le bouton réapparaît à la réouverture) et est effacé par « Remettre à zéro » de la démo.
- Bandeau du match centré sur ordinateur.

## 1.11.3
- Fiche match à venir : les infos du match (compétition, date, lieu, partage, itinéraire) passent dans un bandeau compact tout en haut, au-dessus du score et du panneau de saisie ; les noms d'équipes ne sont plus répétés quand le direct est affiché.

## 1.11.2
- Panneau HA : le badge de synchronisation affiche l'ancienneté et l'heure de la dernière synchro (« Synchronisation OK · il y a 3 min (14:32) »).
- Accueil du site : « Résultats FFH synchronisés il y a N min ».

## 1.11.1
- Suivi en direct : tous les faits saisis comptent tout de suite (plus de « à confirmer ») ; quand plusieurs spectateurs saisissent la même chose, la ligne indique « validé par N personnes ».
- Mise en page : le score est tout en haut de la fiche match ; celui qui saisit a son panneau de contrôle compact visible sans défiler (deux colonnes par équipe : But, Penalty corner, Stroke) et la frise passe en bas de page ; celui qui regarde voit la frise juste sous le score, du plus récent au plus ancien.

## 1.11.0
- Le nom du championnat est mis en avant sur les cartes de match (gras, couleur d'accent, texte complet).
- Saisie en direct : buteur facultatif (nom ou n°), penalty corner et stroke par équipe avec leur issue (arrêté, but, non cadré) — une issue « but » ajoute le but au score (« sur penalty corner / stroke ») —, commentaires libres, frise chronologique des faits de jeu avec heure et confirmations.
- Modération : onglet « Saisies en direct » dans le panneau HA pour supprimer un commentaire ; liens refusés automatiquement.

## 1.10.1
- Agenda : cases à cocher pour choisir quelles équipes favorites ajouter ; préfixe facultatif avec un libellé neutre.
- Classements : colonne « Forme » (5 derniers résultats V/N/D, le plus récent à droite).
- Match de démonstration `#/match/demo` pour s'entraîner à la saisie en direct à tout moment (remise à zéro possible).

## 1.10.0
- Score en direct collaboratif (non officiel) : sur la fiche d'un match, de 3 h avant à 6 h après le coup d'envoi, n'importe quel spectateur peut « saisir ce match » (aucun compte, aucune validation à gérer). Il indique le quart-temps (Q1-Q4, pause, fin du match) et touche « But » pour chaque équipe.
- Concordance : chaque saisisseur a son propre compteur ; un but est « confirmé ✓N » quand plusieurs spectateurs l'ont vu (même équipe, même quart-temps), sinon « à confirmer ». La période affichée est celle de la majorité.
- Affichage : bloc « En direct » (score, buts par quart-temps, nombre de confirmations), pastille ● Q2 / Pause / Terminé sur les cartes de match et l'accueil, alerte de but non officiel pour les équipes favorites. Tout est étiqueté non officiel et disparaît à la publication de la feuille FFH.
- Garde-fous : identifiant anonyme, limite par adresse (150 saisies / 10 min), 30 saisisseurs et 30 buts max par match, saisie fermée une fois la feuille officielle publiée. Données dans DATA_DIR/live.json, purgées après 36 h.

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
