OMBRE//GEEK — JEU COMPLET
===========================

DÉMARRAGE LE PLUS SIMPLE
-------------------------
1. Double-cliquez sur « OMBRE_GEEK_portable.html ».
2. Le jeu se lance directement dans votre navigateur.
3. Aucune installation et aucune connexion Internet ne sont nécessaires.

Sous Windows, vous pouvez aussi double-cliquer sur « LANCER_OMBRE_GEEK.bat ».

VERSION PROJET / PWA
--------------------
Le dossier contient également les sources séparées :
- index.html
- src/styles.css
- src/data.js
- src/app.js
- manifest.webmanifest
- sw.js

Pour profiter de l'installation PWA et du cache Service Worker, servez le dossier avec un petit serveur local, par exemple :

  python -m http.server 8080

Puis ouvrez : http://localhost:8080

CONTENU
-------
- Plus de 50 silhouettes vectorielles originales.
- 6 modes : Arcade, Contre-la-montre, Survie, Duel local, Défi quotidien et Entraînement.
- 4 difficultés.
- Catégories filtrables.
- Score, bonus de rapidité, combos, indices et vies.
- Multijoueur local de 2 à 4 joueurs.
- Collection illustrée avec fiches déblocables.
- Statistiques, records, niveau et expérience.
- Sauvegarde automatique dans le navigateur.
- Interface responsive PC, tablette et mobile.
- Effets sonores générés en temps réel, sans fichiers audio externes.
- Mode hors ligne et plein écran.

COMMANDES
---------
Solo :
- Souris / tactile : choisissez une réponse.
- 1 à 4 : sélectionner une réponse.
- H : utiliser un indice.
- Échap : pause.
- Entrée : passer immédiatement à la manche suivante après la révélation.

Duel local :
- Joueur 1 : A
- Joueur 2 : L
- Joueur 3 : Q
- Joueur 4 : M
- Après le buzz : 1 à 4 pour répondre, ou cliquez sur une réponse.
- Sur écran tactile, touchez la carte du joueur pour buzzer.

SAUVEGARDE
----------
La progression est enregistrée automatiquement avec localStorage : scores, collection, expérience, statistiques et options.
La page Statistiques contient un bouton de réinitialisation complète.

PERSONNALISATION
----------------
Les silhouettes et leurs métadonnées sont regroupées dans « src/data.js ».
Chaque illustration est un SVG construit avec des formes vectorielles et une palette de six couleurs.

MENTION
-------
Les illustrations sont des interprétations vectorielles originales réalisées pour ce quiz. Les noms de personnages, jeux et marques cités appartiennent à leurs ayants droit respectifs. Projet non officiel destiné au divertissement.
