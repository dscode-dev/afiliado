# API NestJS. Build multi-stage a partir da raiz do monorepo, porque o
# npm workspaces resolve as dependencias no lockfile da raiz.
#
# Contexto de build esperado: raiz do repositorio.

FROM node:22-alpine AS base
# openssl e exigido pelo engine do Prisma no Alpine.
RUN apk add --no-cache openssl
WORKDIR /app

# CA adicional, opcional e vazia por padrao.
#
# Em maquinas onde um antivirus ou proxy corporativo intercepta TLS (Norton,
# Zscaler e afins), o certificado do registry chega reemitido por uma CA que
# so existe no trust store do sistema operacional -- e o `npm ci` morre com
# UNABLE_TO_VERIFY_LEAF_SIGNATURE. Passe o PEM em base64 para destravar:
#
#   docker compose build --build-arg EXTRA_CA_CERT_B64="$(base64 -w0 ca.crt)"
ARG EXTRA_CA_CERT_B64=""
RUN if [ -n "$EXTRA_CA_CERT_B64" ]; then \
      mkdir -p /etc/ssl/extra && \
      echo "$EXTRA_CA_CERT_B64" | base64 -d > /etc/ssl/extra/extra-ca.crt; \
    fi

# ---------------------------------------------------------------------------
# Dependencias: camada estavel, invalidada apenas quando o lockfile muda.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/api/scripts apps/api/scripts/
COPY apps/admin/package.json apps/admin/
# `ls` resolve para vazio quando nao ha CA extra, e o Node ignora a variavel.
RUN NODE_EXTRA_CA_CERTS="$(ls /etc/ssl/extra/extra-ca.crt 2>/dev/null)" npm ci

# ---------------------------------------------------------------------------
# Build: gera o Prisma Client e compila o TypeScript.
# ---------------------------------------------------------------------------
FROM deps AS build
COPY apps/api ./apps/api
RUN npm run db:generate -w @afiliado/api \
 && npm run build -w @afiliado/api

# ---------------------------------------------------------------------------
# Migrations: precisa da CLI do Prisma, entao mantem as devDependencies.
# Roda como servico one-shot no compose, antes da API subir.
# ---------------------------------------------------------------------------
FROM build AS migrate
WORKDIR /app/apps/api
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# Dependencias de producao, apenas da workspace da API.
#
# `npm prune` na raiz manteria as dependencias do admin (Next, React) e as
# devDependencies das workspaces. Instalar so o que a API precisa deixa a
# imagem substancialmente menor.
# ---------------------------------------------------------------------------
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/api/scripts apps/api/scripts/
COPY apps/admin/package.json apps/admin/
RUN NODE_EXTRA_CA_CERTS="$(ls /etc/ssl/extra/extra-ca.crt 2>/dev/null)" \
    npm ci --omit=dev --workspace @afiliado/api --include-workspace-root

# ---------------------------------------------------------------------------
# Runtime: sem devDependencies, sem fontes TypeScript.
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./
# O Prisma Client e gerado no build; precisa ser trazido para o runtime.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/scripts ./apps/api/scripts
COPY --from=build /app/apps/api/dist ./apps/api/dist

WORKDIR /app/apps/api
USER node
EXPOSE 3333
CMD ["node", "dist/main.js"]
