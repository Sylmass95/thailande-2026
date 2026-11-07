# Thaïlande 2026 : carnet de route, audio guide et assistant

Un seul dépôt GitHub pour tout : la webapp sur le **Minix** (installable depuis Chrome), l’**APK Android**, et les modifications pilotées depuis **Claude Code** sur le téléphone, publiées en **environ une minute**.

```
Claude Code (téléphone) pousse une branche
  → GitHub : pull request, build + test, fusion automatique dans main   (~30-45 s)
  → Minix : détecte main, récupère le code, reconstruit la page         (~10 s)
  → App ouverte : détecte la nouvelle version et se recharge            (~15 s, APK ~30 s)
```

## Ce qu’il faut

- Un compte GitHub (gratuit).
- Le **Mac** avec le Terminal, une seule fois.
- Le **Minix** avec **Docker et Compose v2**, joignable en SSH depuis le Mac. Sous Windows : utilisez **WSL** (Ubuntu) avec l’intégration WSL de Docker Desktop, et lancez les commandes dans le terminal Ubuntu.
- **Tailscale** (gratuit) pour l’accès en HTTPS depuis le téléphone : indispensable pour installer la webapp, utiliser le GPS, les notifications et l’APK.

## 1. Créer le dépôt (téléphone ou Mac)

1. github.com → **New repository** → nom `thailande-2026`, **Private**, sans README → *Create*.
2. Dans le dépôt : **Settings → Actions → General → Workflow permissions** → cochez **Read and write permissions** et **Allow GitHub Actions to create and approve pull requests** → *Save*. Sans ce réglage, la fusion automatique est bloquée.

## 2. Créer deux jetons GitHub

Photo de profil → **Settings → Developer settings → Personal access tokens**. Copiez chaque jeton aussitôt : GitHub ne l’affiche qu’une fois.

- **Jeton A, pour le Mac** : *Tokens (classic)* → *Generate new token (classic)* → cochez `repo` et `workflow`. Il ne sert qu’à l’étape 3.
- **Jeton B, pour le Minix** : *Fine-grained tokens* → *Generate new token* → **Repository access : Only select repositories → thailande-2026** → **Permissions → Contents : Read-only** → expiration après le voyage. Le Minix ne pourra que lire ce dépôt.

## 3. Envoyer le projet depuis le Mac (une fois)

Décompressez le zip dans Téléchargements, puis dans le Terminal :

```bash
cd ~/Downloads/thailande-2026
git init -b main
git add -A
git commit -m "Projet initial"
git remote add origin https://github.com/VOTRE-NOM/thailande-2026.git
git push -u origin main
```

Identifiant demandé : votre nom GitHub ; mot de passe : le **jeton A**. L’onglet **Actions** lance alors la première compilation de l’APK (10 à 15 minutes, elle peut tourner pendant la suite).

## 4. Installer sur le Minix depuis le Mac (une fois)

```bash
scp ~/Downloads/thailande-2026/deploy/install.sh UTILISATEUR@IP-DU-MINIX:~/
ssh UTILISATEUR@IP-DU-MINIX
bash install.sh
```

Le script demande le dépôt (`VOTRE-NOM/thailande-2026`) et le **jeton B**. Il télécharge le code dans `~/thailande-2026`, construit la page et démarre trois services : l’app, l’API Tricount et la mise à jour automatique. La première fois, comptez quelques minutes. Ensuite, l’app répond sur `http://IP-DU-MINIX:8080`.

Pour vérifier que les mises à jour arrivent :
```bash
docker compose -f ~/thailande-2026/deploy/docker-compose.yml logs -f updater
```

## 5. HTTPS avec Tailscale (une fois)

Sur le Minix (toujours en SSH) :
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up                 # ouvrez le lien affiché et connectez votre compte
```
Dans la console Tailscale (login.tailscale.com) → **DNS** → activez **MagicDNS** et **HTTPS Certificates**. Puis sur le Minix :
```bash
sudo tailscale serve --bg 8080
```
L’adresse affichée, du type `https://minix.xxxx.ts.net`, est celle de votre app. Sur le téléphone, installez l’appli **Tailscale** et connectez le même compte.

## 6. Sur le téléphone

- **Webapp** : Chrome → `https://minix.xxxx.ts.net` → ⋮ → **Installer l’application**. Elle marche hors ligne et se met à jour seule.
- **APK** (alarmes natives) : dépôt GitHub → **Releases → APK – dernière version** → `thailande-2026.apk`. Dans l’APK, l’adresse du Minix est préremplie (`MINIX_DEFAULT` dans `src/app.js`) ; sinon **Pratique → Réglages → Serveur Minix** : collez `https://minix.xxxx.ts.net`. L’APK reçoit alors aussi les mises à jour en une trentaine de secondes.
- **Claude Code** : appli Claude → onglet **Code** → connectez GitHub et autorisez `thailande-2026` → créez l’environnement par défaut (accès réseau « de confiance »).

## 7. Faire une modification

Dans Claude Code, choisissez le dépôt et écrivez par exemple : « Ajoute un dîner au marché de Chiang Mai le 9 novembre à 19 h ». Claude modifie, teste et pousse une branche ; **le reste est automatique**. Environ une minute plus tard, l’app ouverte affiche la nouvelle version. Elle se recharge seule si vous ne l’utilisez pas, sinon elle propose « Mettre à jour ».

- Test en échec : rien n’est publié, la pull request reste ouverte avec un commentaire, et Claude Code peut corriger.
- Pour préparer sans publier, demandez une branche `wip/…`.

## Options (sur le Minix, dans `~/thailande-2026/deploy/.env`)

Éditez le fichier avec `nano ~/thailande-2026/deploy/.env`, puis relancez `docker compose -f ~/thailande-2026/deploy/docker-compose.yml up -d` :
- **Assistant IA** : `ANTHROPIC_API_KEY` (console.anthropic.com, facturé à l’usage ; activez aussi la recherche web dans la console pour les restaurants) et `APP_TOKEN` (un mot de passe, à saisir aussi dans l’app : Pratique → Réglages).
- **Tricount** : rien à faire, collez simplement le lien de partage dans la page Tricount de l’app.

## Dépannage

| Problème | Solution |
| --- | --- |
| La fusion automatique ne se fait pas | Vérifiez le réglage de l’étape 1.2 ; regardez l’onglet Actions. |
| Le Minix ne se met plus à jour | `logs -f updater` : « GitHub répond 401 » = jeton B expiré → relancez `bash install.sh` avec un nouveau jeton. |
| L’app affiche une ancienne version | Fermez et rouvrez-la ; la vérification a lieu à chaque ouverture. |
| L’APK ne se met pas à jour | Vérifiez l’adresse du Minix dans ses Réglages et que Tailscale est actif sur le téléphone. |

## Contenu
`src/` sources de l’app · `public/` icônes, manifeste, service worker · `build.mjs` assemblage · `test/` test automatique · `server/` serveur Node · `tricount/` API perso Tricount · `deploy/` installation et mise à jour du Minix · `apk/` Android · `.github/workflows/` fusion automatique et APK · `CLAUDE.md` consignes pour Claude Code.
