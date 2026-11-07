#!/bin/sh
# Mise à jour automatique depuis GitHub, toutes les UPDATE_INTERVAL secondes (10 par défaut).
# La vérification utilise une requête conditionnelle : « rien de neuf » (304) ne consomme pas de quota GitHub.
set -u
INTERVAL="${UPDATE_INTERVAL:-10}"
cd "$REPO_DIR" || { echo "Dossier $REPO_DIR introuvable"; exit 1; }
git config --global --add safe.directory "$REPO_DIR"
COMPOSE="docker compose --project-directory $REPO_DIR/deploy -f $REPO_DIR/deploy/docker-compose.yml"
ETAG=""
CURRENT=$(git rev-parse HEAD 2>/dev/null)
echo "Mises à jour automatiques actives : $GITHUB_REPO, toutes les ${INTERVAL} s (version $CURRENT)."

while true; do
  if [ -n "$ETAG" ]; then COND="If-None-Match: $ETAG"; else COND="X-First-Check: 1"; fi
  CODE=$(curl -s -o /tmp/commit.json -D /tmp/headers.txt -w '%{http_code}' \
    -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
    -H "$COND" "https://api.github.com/repos/$GITHUB_REPO/commits/main")
  if [ "$CODE" = "200" ]; then
    ETAG=$(grep -i '^etag:' /tmp/headers.txt | cut -d' ' -f2- | tr -d '\r')
    LATEST=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync("/tmp/commit.json","utf8")).sha||"")}catch(e){}')
    if [ -n "$LATEST" ] && [ "$LATEST" != "$CURRENT" ]; then
      echo "$(date '+%F %T') : nouvelle version $LATEST"
      if git fetch -q origin main; then
        CHANGED=$(git diff --name-only HEAD origin/main)
        git reset -q --hard origin/main
        if node build.mjs; then
          CURRENT="$LATEST"
          if echo "$CHANGED" | grep -qE '^(server|tricount)/|^deploy/(docker-compose\.yml|\.env\.example)$'; then
            echo "Reconstruction des conteneurs app et tricount…"
            $COMPOSE up -d --build app tricount
          fi
          if echo "$CHANGED" | grep -qE '^deploy/(update\.sh|updater\.Dockerfile)$'; then
            echo "Mise à jour du service updater lui-même…"
            $COMPOSE up -d --build updater
          fi
        else
          echo "Échec du build : la version précédente reste en ligne."
        fi
      else
        echo "Échec de git fetch (réseau ou jeton GitHub ?)."
      fi
    fi
  elif [ "$CODE" != "304" ]; then
    echo "$(date '+%F %T') : GitHub répond $CODE (jeton expiré ou réseau ?)."
    sleep 50
  fi
  sleep "$INTERVAL"
done
