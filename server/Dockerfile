# Construit depuis la racine du dépôt. La page elle-même est lue dans dist/ (WEB_ROOT),
# reconstruit par le service « updater » à chaque mise à jour : pas besoin de reconstruire cette image.
FROM node:22-alpine
WORKDIR /app
COPY server/server.js ./
ENV PORT=8080 WEB_ROOT=/repo/dist
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1
USER node
CMD ["node", "server.js"]
