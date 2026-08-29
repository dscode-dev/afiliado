# Admin Next.js. Usa o output `standalone`, que empacota apenas o servidor e
# as dependencias realmente alcancadas pelo bundle.
#
# Contexto de build esperado: raiz do repositorio.

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
RUN npm ci

FROM deps AS build
COPY apps/admin ./apps/admin
# A URL da API e resolvida em runtime (Server Components), nao no build.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @afiliado/admin

FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# `standalone` ja traz o node_modules minimo necessario.
COPY --from=build /app/apps/admin/.next/standalone ./
COPY --from=build /app/apps/admin/.next/static ./apps/admin/.next/static

USER node
EXPOSE 3000
CMD ["node", "apps/admin/server.js"]
