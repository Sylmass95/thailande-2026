FROM docker:27-cli
RUN apk add --no-cache git nodejs curl && (docker compose version >/dev/null 2>&1 || apk add --no-cache docker-cli-compose)
COPY update.sh /update.sh
ENTRYPOINT ["/bin/sh", "/update.sh"]
