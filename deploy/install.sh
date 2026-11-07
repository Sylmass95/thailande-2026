#!/usr/bin/env bash
# Installation unique sur le Minix (Linux, macOS ou Windows via WSL).
# Usage :  bash install.sh        (aucun autre prérequis que Docker)
set -euo pipefail
echo "=== Carnet de route Thaïlande 2026 : installation ==="
command -v docker >/dev/null || { echo "Docker n'est pas installé sur cette machine."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Il manque « docker compose » (Compose v2)."; exit 1; }

read -r -p "Dépôt GitHub (ex. : sylvain/thailande-2026) : " REPO
read -r -s -p "Jeton GitHub (fine-grained, Contents : lecture seule) : " TOKEN; echo
DIR="${INSTALL_DIR:-$HOME/thailande-2026}"
URL="https://git:${TOKEN}@github.com/${REPO}.git"

git_run() {  # git du Minix, sinon git dans un conteneur
  if command -v git >/dev/null; then git "$@"; else docker run --rm -v "$(dirname "$DIR"):$(dirname "$DIR")" -w "$(dirname "$DIR")" alpine/git "$@"; fi
}
if [ -d "$DIR/.git" ]; then
  echo "Dépôt déjà présent dans $DIR : mise à jour."
  git_run -C "$DIR" remote set-url origin "$URL"
  git_run -C "$DIR" pull -q origin main
else
  mkdir -p "$(dirname "$DIR")"
  git_run clone -q "$URL" "$DIR"
fi

cd "$DIR/deploy"
[ -f .env ] || cp .env.example .env
set_env() { if grep -q "^$1=" .env; then sed -i.bak "s|^$1=.*|$1=$2|" .env && rm -f .env.bak; else echo "$1=$2" >> .env; fi; }
set_env REPO_DIR "$DIR"
set_env GITHUB_REPO "$REPO"
set_env GITHUB_TOKEN "$TOKEN"
chmod 600 .env

echo "Construction de la page…"
docker run --rm -v "$DIR:$DIR" -w "$DIR" node:22-alpine node build.mjs
echo "Démarrage des services (première fois : quelques minutes)…"
docker compose up -d --build

IP=$( (hostname -I 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || echo "IP-DU-MINIX") | awk '{print $1}')
echo
echo "Installé. L'app répond sur http://${IP}:8080"
echo "Chaque modification fusionnée sur GitHub arrive ici en une dizaine de secondes."
echo "Journal des mises à jour : docker compose -f $DIR/deploy/docker-compose.yml logs -f updater"
