# affiliate-bot: mantem a sessao da Central de Afiliados e gera os links.
#
# Base slim + apenas Chromium: a imagem oficial do Playwright traz tambem
# Firefox e WebKit, que nao usamos.
#
# Contexto de build esperado: raiz do repositorio.

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/affiliate-bot/package.json apps/affiliate-bot/
RUN npm ci --workspace @afiliado/affiliate-bot --include-workspace-root

FROM deps AS build
COPY apps/affiliate-bot ./apps/affiliate-bot
RUN npm run build -w @afiliado/affiliate-bot

FROM base AS runtime
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/affiliate-bot/dist ./apps/affiliate-bot/dist
COPY --from=build /app/apps/affiliate-bot/package.json ./apps/affiliate-bot/

# Somente Chromium, com as bibliotecas de sistema que ele exige.
RUN npx --yes playwright@1.62.1 install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm

# O guard do `affiliate:login` precisa existir AQUI: e ele que explica que o
# login roda na maquina do operador, e nao dentro do container.
COPY --from=build /app/apps/affiliate-bot/scripts ./apps/affiliate-bot/scripts

# O estado (perfil + sessao exportada) NAO entra na imagem: vem por bind mount.
ENV AFFILIATE_BROWSER_PROFILE_PATH=/garimpo/affiliate-profile
ENV AFFILIATE_SESSION_STATE_PATH=/garimpo/affiliate-session.json

WORKDIR /app/apps/affiliate-bot
EXPOSE 3400
CMD ["node", "dist/main.js"]
