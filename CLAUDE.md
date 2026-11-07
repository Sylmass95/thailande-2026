# Carnet de route Thaïlande 2026 — consignes pour Claude Code

Application de voyage (roadbook, rappels, audio guide, trajets, assistant IA, budget/Tricount) pour deux voyageurs français en Thaïlande du 5 au 19 novembre 2026. Toute l’interface et tous les textes sont **en français**.

## Où modifier quoi
- `src/data/programme.js` : hôtels (`HOTELS`), programme jour par jour (`DAYS`, via `D(...)`), rappels (`REMINDERS`, via `R(...)`).
  - Étape : `["HH:MM","Titre","Détail","type","idSite","offset","tz","idTrajet"]`, type ∈ visit, transport, meal, rest, pratique. Heures locales de Thaïlande (+07:00) sauf jours 1 et 15 (Paris, Doha).
  - Rappel : `R("id","JJ","HH:MM","+07:00","Titre","Texte")` ; un identifiant unique et stable.
- `src/data/audioguide.js` : `SITES` (textes lus à voix haute : phrases courtes, nombres en lettres, pas d’abréviations ni de parenthèses).
- `src/data/trajets.js` : `LEGS` (estimations de prix en THB, `unit` = tot | pp | inc), `APPS`, `RIDE_BY_CITY`.
- `src/data/pratique.js` : réservations, espèces, check-lists, urgences, phrases thaïes.
- `src/app.js` : logique et écrans (vanilla JS, une seule IIFE). La variable `BUILD` ({v, t}) est ajoutée par `build.mjs`. Budget prérempli : `ROADBOOK_BUDGET`, `ROADBOOK_PREPAID`, `BIG_PLANNED`.
- `src/head.html` : HTML de base et CSS (thème clair/sombre via variables). `src/head-artifact.html` : même chose sans manifeste, pour la page claude.ai.
- `server/server.js` : serveur Node (fichiers + proxy assistant IA `/api/chat` + relais Tricount `/api/tricount`).
- `tricount/bridge.py` : API perso Tricount en lecture seule (client communautaire non officiel `tricount-api`).
- `deploy/` : ce qui tourne sur le Minix. Le service `updater` relit `main` toutes les 10 s, lance `node build.mjs` et ne reconstruit les conteneurs que si `server/`, `tricount/` ou `deploy/` changent.
- `apk/` : projet Capacitor (Android). `apk/www/index.html` est généré depuis `dist/apk.html`, ne pas le modifier. L’APK reçoit les nouvelles versions du CSS et du JS depuis le Minix (`app-bundle.json`) ; seul un changement du squelette HTML de `src/head.html` (hors `<style>`) exige de réinstaller l’APK.

## Règles
- Après toute modification : `npm install` (une fois), puis `npm run build && npm test`. Ne pousse rien si le test échoue.
- Ne jamais committer de secret (clé API, APP_TOKEN, jeton GitHub, fichier `.env`).
- Ne pas modifier `dist/`, `dist-artifact/` ni `apk/www/index.html` à la main : ils sont générés.
- Typographie française dans les textes affichés : apostrophe ’, guillemets « », espaces avant : ; ? !
- L’app doit rester utilisable hors ligne : pas de nouvelle dépendance externe dans la page.
- Les montants et horaires non confirmés sont présentés comme des estimations à vérifier.

## Publication (automatique, environ une minute)
- Travaille sur une branche (par exemple `claude/…`) et pousse-la. Le workflow `auto-merge.yml` ouvre la pull request, relance `npm run build && npm test`, puis **fusionne tout seul dans `main`** si tout passe. Inutile d’attendre une validation humaine.
- Si le test échoue, la PR reste ouverte avec un commentaire : corrige et repousse sur la même branche.
- Pour une modification à ne pas publier tout de suite, utilise une branche `wip/…` (pas de fusion automatique).
- Après la fusion : le Minix récupère `main` en ~10 s et reconstruit `dist/` ; l’app ouverte le détecte via `version.json` en ~15 s (APK : ~30 s) et se recharge quand l’utilisateur ne fait rien, sinon propose « Mettre à jour ». `apk.yml` recompile aussi l’APK (release `apk-latest`) si `src/`, `public/` ou `apk/` ont changé.
- Ne jamais pousser directement sur `main` sans avoir lancé le test : le Minix publierait la version telle quelle.
- La page publiée sur claude.ai n’est pas mise à jour par GitHub (fichier `dist-artifact/` généré par le build).
