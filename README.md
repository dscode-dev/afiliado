# Garimpo

> Inteligência e distribuição automatizada de boas oportunidades de compra.

Sistema interno que garimpa ofertas do Mercado Livre e as distribui em canais públicos.

> 📖 **Vai operar o painel?** Comece pelo
> **[Manual do Operador](docs/MANUAL-DO-OPERADOR.md)** — passo a passo, em português, sem
> jargão técnico. O restante deste README é documentação técnica.

O produto monitora produtos e ofertas, registra links de afiliado, avalia oportunidades e
distribui as melhores em canais públicos (Telegram, Facebook, WhatsApp). O cliente final é
sempre levado **diretamente ao Mercado Livre** — não existe checkout, pagamento, estoque,
logística nem atendimento transacional próprio.

> **Estado atual: PR-09 — Mercado Livre real + geração automática de link de afiliado.**
> O pipeline fecha ponta a ponta sem ação humana por produto: produto real → link de afiliado
> gerado sozinho → oportunidade avaliada → publicação. **Sem link, não publica.**

## Visão do fluxo

```text
Mercado Livre           [PR-02 — integrado · PR-09 OAuth Authorization Code]
      ↓
Product / PriceSnapshot [PR-02 — dados reais]
      ↓
Affiliate Link Generator [PR-09 — automático, adapter NÃO oficial]
      ↓
Opportunity Engine      [PR-03 — score determinístico]
      ↓
AffiliateLink           [PR-09 — gerado automaticamente; obrigatório para publicar]
      ↓
Offer                   [PR-03 — gerada automaticamente]
      ↓
Distribution            [PR-04 — Telegram]
      ↓
Telegram [PR-04]  ·  Facebook [PR-06]  ·  WhatsApp [PR-07, semiassistido]

        ↺ Autopilot     [PR-05 — o ciclo acima roda sozinho, opt-in por destino]
```

Hoje o catálogo é alimentado pela API oficial do Mercado Livre, mantém histórico de preços, é
avaliado por um engine determinístico que gera `Offer`, e as oportunidades aprovadas podem ser
publicadas em canais do Telegram e em Páginas do Facebook — manualmente ou pelo autopilot, que
executa todo o ciclo em intervalos controlados. Para o WhatsApp o sistema prepara o conteúdo e o
operador publica, porque não existe API oficial para Canais.

## Arquitetura

Monolito modular simples, sem message broker, cache ou serviços distribuídos.

```text
Next.js (admin, :3000)
      │  HTTP/JSON  (API_BASE_URL)
      ▼
NestJS (API REST, :3333)
      │  Prisma
      ▼
PostgreSQL (:5432, Docker)
```

Decisões conscientes deste PR:

- **Monolito modular** — um processo, módulos separados por domínio. Sem microservices.
- **Prisma + PostgreSQL** — migrations versionadas e tipos gerados; sem camada de repositório
  adicional, os services falam com o Prisma diretamente.
- **Sem abstrações especulativas** — módulos existem apenas quando têm código real.
  `marketplace` e `content` ainda não existem como pastas, porque ainda não têm conteúdo.
- **Dinheiro como `NUMERIC(12,2)`** — nunca ponto flutuante. Trafega na API como *string*
  para não perder precisão em JSON.
- **Server Components + Server Actions** no admin — sem biblioteca de estado no cliente.

## Identidade

O produto chama-se **Garimpo**. A logo original fica em `assets/logo.png` e é servida pelo painel
em `/assets/logo.png` — usada **sem nenhuma alteração**: mesma imagem, mesmas cores, proporção
3:1 preservada por `height: auto` (nunca esticada).

A paleta do painel foi amostrada da própria logo: petróleo profundo `#002030`–`#005060` e dourado
`#f0b000` como acento. O dourado é usado em bordas e destaques, nunca como cor de texto sobre
fundo claro — o contraste não seria suficiente.

Módulos técnicos internos (`modules/affiliate`, `affiliate_links`, …) mantêm seus nomes: branding
não é refactor arquitetural.

## Stack

| Camada    | Tecnologia                          |
| --------- | ----------------------------------- |
| API       | NestJS 11 + TypeScript (CommonJS)   |
| ORM       | Prisma 6                            |
| Banco     | PostgreSQL 16                       |
| Admin     | Next.js 15 (App Router) + React 19  |
| Testes    | Jest + Supertest (contra o banco real) |
| Infra dev | Docker Compose (somente PostgreSQL) |

Monorepo com **npm workspaces**. Sem Turborepo, Nx ou framework interno.

## Estrutura

```text
.
├── docker-compose.yml           # postgres + migrate + api + admin
├── assets/logo.png              # logo original do Garimpo
├── .dockerignore
├── docker/postgres/init/        # cria o banco de testes no primeiro boot
├── .env.example                 # todas as variáveis, documentadas
├── apps/
│   ├── api/                     # NestJS
│   │   ├── Dockerfile           # multi-stage: deps -> build -> migrate/runtime
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── main.ts          # bootstrap HTTP
│   │   │   ├── bootstrap.ts     # pipes/filtros/CORS compartilhados com os testes
│   │   │   ├── app.module.ts
│   │   │   ├── config/          # validação de env vars no boot
│   │   │   ├── common/          # Prisma, logger, filtro de erros, DTOs comuns
│   │   │   ├── health/          # GET /health
│   │   │   └── modules/
│   │   │       ├── catalog/       # Product, PriceSnapshot, import e sync
│   │   │       ├── marketplace/   # client oficial do Mercado Livre
│   │   │       ├── affiliate/     # AffiliateLink
│   │   │       ├── opportunity/   # Offer, engine de score (scoring/)
│   │   │       ├── distribution/  # Channel, Publication
│   │   │       │   ├── publish/    # ChannelPublisher + dispatcher comum
│   │   │       │   ├── telegram/
│   │   │       │   ├── facebook/
│   │   │       │   ├── whatsapp/  # renderer (sem API oficial)
│   │   │       │   └── manual/    # fluxo semiassistido
│   │   │       ├── affiliate/     # AffiliateLink + generation/ (gerador)
│   │   │       ├── auth/          # AdminUser, sessões, guard global
│   │   │       ├── automation/    # orquestrador, scheduler, política
│   │   │       └── analytics/     # contadores do dashboard
│   │   └── test/                # testes de integração
│   ├── affiliate-bot/           # adapter NÃO oficial: sessão + geração de link
│   │   ├── Dockerfile
│   │   └── src/                 # console adapter, servidor HTTP, login
│   └── admin/                   # Next.js (painel Garimpo)
│       ├── Dockerfile           # build -> standalone
│       ├── public/assets/       # logo servida em /assets/logo.png
│       └── app/(app)/           # rotas autenticadas; /login fica fora
│       ├── app/                 # uma pasta por tela (page.tsx + actions.ts)
│       ├── components/          # formulário genérico, ações de linha, helpers de UI
│       └── lib/                 # cliente HTTP da API interna e tipos
```

### Módulos atuais

| Módulo         | Conteúdo                          | Status                        |
| -------------- | --------------------------------- | ----------------------------- |
| `catalog`      | `Product`, `PriceSnapshot`        | import/sync reais + histórico |
| `affiliate`    | `AffiliateLink`                   | cadastro manual + rastreio de origem |
| `opportunity`  | `Offer`, `OpportunityEvaluation`  | engine de score + decisão humana |
| `distribution` | `Channel`, `Publication`, Telegram, Facebook, WhatsApp | publicação idempotente; `ChannelPublisher` para destinos automáticos e fluxo semiassistido para o WhatsApp |
| `automation`   | orquestrador, scheduler, política | ciclo automático (autopilot)  |
| `analytics`    | contadores do dashboard           | mínimo, só o que o painel usa |
| `marketplace`  | integração oficial Mercado Livre  | implementado (client, auth, highlights) |
| `content`      | geração de mensagem/copy          | **não existe** — PR futuro    |

`content` continua sem existir como pasta: módulos nascem junto com o código que os justificam.

## Como subir localmente

Há dois modos. Escolha um:

| Modo | Quando usar | Comando |
| ---- | ----------- | ------- |
| **Só o banco** | Desenvolvimento: hot reload na API e no admin | `npm run db:up` + `npm run dev` |
| **Stack completa** | Rodar tudo em containers, como em produção | `npm run stack:up` |

### Identidade

O produto chama-se **Garimpo**. A logo original fica em `assets/logo.png` e é servida pelo painel
em `/assets/logo.png` — usada **sem nenhuma alteração**: mesma imagem, mesmas cores, proporção
3:1 preservada por `height: auto` (nunca esticada).

A paleta do painel foi amostrada da própria logo: petróleo profundo `#002030`–`#005060` e dourado
`#f0b000` como acento. O dourado é usado em bordas e destaques, nunca como cor de texto sobre
fundo claro — o contraste não seria suficiente.

Módulos técnicos internos (`modules/affiliate`, `affiliate_links`, …) mantêm seus nomes: branding
não é refactor arquitetural.

## Stack completa em Docker

```bash
cp .env.example .env      # ajuste as credenciais que for usar
npm run stack:up          # postgres + migrations + api + admin
npm run stack:ps          # estado dos serviços
npm run stack:logs        # logs da api e do admin
npm run stack:down        # derruba tudo (o volume do banco é preservado)
```

Serviços:

| Serviço | O que é | Porta |
| ------- | ------- | ----- |
| `postgres` | PostgreSQL 16 com healthcheck | `127.0.0.1:5432` |
| `migrate` | One-shot: aplica `prisma migrate deploy` e encerra | — |
| `api` | NestJS (imagem multi-stage, sem devDependencies) | `127.0.0.1:3333` |
| `admin` | Next.js em modo `standalone` | `127.0.0.1:3000` |

A ordem é garantida por dependências: `api` só sobe depois que `postgres` está *healthy* **e**
`migrate` terminou com sucesso; `admin` só sobe depois que `api` está *healthy*. Isso elimina a
corrida entre schema e aplicação.

O admin fala com a API pela rede interna do compose (`http://api:3333`). Todas as chamadas são
server-side (Server Components e Server Actions), então nada disso é resolvido pelo browser.

> **Porta 5432 já ocupada?** Se outro projeto seu tem um PostgreSQL rodando, ajuste
> `POSTGRES_PORT` no `.env` (ex.: `5433`) e atualize `DATABASE_URL` e `TEST_DATABASE_URL` para a
> mesma porta. O erro aparece como `Bind for 127.0.0.1:5432 failed: port is already allocated`.

### Acesso pela rede local

O painel (`3000`) e a API (`3333`) são publicados em `${BIND_HOST:-0.0.0.0}`, ou seja,
alcançáveis por outras máquinas da rede. O Postgres e o `affiliate-bot` ficam em `127.0.0.1`:
não há motivo para expô-los.

Para operar de outro computador:

```bash
# no .env da máquina que roda a stack
BIND_HOST=0.0.0.0
SESSION_COOKIE_SECURE=false
```

Depois, acesse `http://IP-DA-MAQUINA:3000` (ex.: `http://192.168.1.233:3000`).

> ⚠️ **`SESSION_COOKIE_SECURE=false` é obrigatório para HTTP na rede local.** O cookie de sessão
> sai como `Secure` por padrão, e o browser só aceita cookie `Secure` sem TLS quando a origem é
> `localhost`. Por um IP da rede ele é descartado em silêncio: o login parece funcionar, redireciona
> para o dashboard e a navegação seguinte volta para a tela de login, sem mensagem de erro.
> **Volte para `true` assim que houver HTTPS na frente** — sem TLS o cookie trafega em texto claro
> pela rede.

Só o servidor Next fala com a API: nenhum componente de browser faz requisição direta. Por isso
não é preciso mexer em `CORS_ORIGINS` para o acesso pela rede local — apenas a porta `3000`
precisa estar alcançável.

Se houver um proxy reverso na frente, ajuste também `TRUST_PROXY`; sem isso o limite de tentativas
de login passa a contar todos os acessos como vindos de um IP só.

> **Porta 3000 ocupada?** Ajuste `ADMIN_PORT` no `.env` (o mesmo vale para `API_PORT`).

> **Não escale `api` para mais de uma réplica.** A trava do autopilot é em memória (ver
> *Autopilot → Premissa: instância única*).

Configuração: o compose lê o `.env` da raiz e repassa as variáveis para a `api`, com os mesmos
defaults documentados em *Variáveis de ambiente* — inclusive `TELEGRAM_AUTO_PUBLISH_ENABLED=false`.
O painel continua sem editar configuração.

### Desenvolvimento com hot reload

Pré-requisitos: **Node 20+** e **Docker**.

```bash
# 1. dependências
npm install

# 2. configuração
cp .env.example .env

# 3. banco (PostgreSQL em Docker; cria também o banco de testes)
npm run db:up

# 4. migrations + Prisma Client
npm run db:migrate
npm run db:generate

# 5. aplicação
npm run dev:api      # API   -> http://localhost:3333
npm run dev:admin    # Admin -> http://localhost:3000
```

O painel abre em `http://localhost:3000` e redireciona para `/dashboard`.

## Variáveis de ambiente

Todas em `.env` na raiz, compartilhado por API e admin. Ver `.env.example`.

| Variável            | Obrigatória | Descrição                                                    |
| ------------------- | ----------- | ------------------------------------------------------------ |
| `DATABASE_URL`      | sim         | Connection string PostgreSQL usada pela API e pelas migrations |
| `APP_ENV`           | sim         | `development` \| `test` \| `production`                       |
| `API_PORT`          | sim         | Porta HTTP da API (padrão `3333`)                             |
| `TEST_DATABASE_URL` | testes      | Banco dedicado à suíte — as tabelas são truncadas entre casos |
| `CORS_ORIGINS`      | não         | Lista separada por vírgula, ou `*` (padrão `http://localhost:3000`) |
| `LOG_LEVEL`         | não         | `debug` \| `log` \| `warn` \| `error` (padrão `log`)          |
| `POSTGRES_PORT`     | não         | Porta exposta pelo container (padrão `5432`)                  |
| `API_BASE_URL`      | não         | URL da API consumida pelo admin (padrão `http://localhost:3333`) |
| `MELI_CLIENT_ID`      | integração | Client ID da aplicação no DevCenter do Mercado Livre |
| `MELI_CLIENT_SECRET`  | integração | Client Secret. **Secret** — apenas em `.env` |
| `MELI_REDIRECT_URI`   | não        | Redirect URI registrada; usada só para obter o refresh token |
| `MELI_SITE_ID`        | não        | Site do Mercado Livre. Esta versão aceita apenas `MLB` |
| `MELI_REFRESH_TOKEN`  | não        | **Secret.** Se definido, usa o grant `refresh_token` |
| `MELI_TIMEOUT_MS`     | não        | Timeout por chamada ao Mercado Livre (padrão `10000`) |
| `MELI_SYNC_CONCURRENCY` | não      | Concorrência do sync em lote, 1 a 8 (padrão `4`) |
| `MELI_API_BASE_URL`   | não        | Base da API oficial; sobrescrita apenas nos testes |
| `OPPORTUNITY_APPROVED_THRESHOLD`  | não | Score mínimo para `APPROVED` (padrão `85`) |
| `OPPORTUNITY_CANDIDATE_THRESHOLD` | não | Score mínimo para `CANDIDATE` (padrão `70`) |
| `OPPORTUNITY_COOLDOWN_HOURS`      | não | Janela em que a mesma oportunidade não é reprocessada (padrão `24`) |
| `OPPORTUNITY_HISTORY_WINDOW_DAYS` | não | Janela do histórico de preços na avaliação (padrão `30`) |
| `TELEGRAM_BOT_TOKEN`  | publicação | **Secret.** Token do bot do @BotFather. Só em `.env` |
| `TELEGRAM_TIMEOUT_MS` | não        | Timeout por chamada à Bot API (padrão `15000`) |
| `TELEGRAM_MAX_RETRY_AFTER_SECONDS` | não | Teto para respeitar o `retry_after` de 429 (padrão `5`) |
| `TELEGRAM_API_BASE_URL` | não      | Base da Bot API; sobrescrita apenas nos testes |
| `AUTOMATION_SCHEDULER_ENABLED` | não | Liga os jobs agendados (padrão `true`) |
| `PRODUCT_REFRESH_INTERVAL_MINUTES` | não | Intervalo do sync + popularidade (padrão `60`) |
| `OPPORTUNITY_EVALUATION_INTERVAL_MINUTES` | não | Intervalo da avaliação (padrão `30`) |
| `TELEGRAM_DISTRIBUTION_INTERVAL_MINUTES` | não | Intervalo da distribuição (padrão `15`) |
| `TELEGRAM_AUTO_PUBLISH_ENABLED` | não | **Autopilot. Padrão `false`** — publicação é opt-in |
| `TELEGRAM_MAX_POSTS_PER_HOUR` | não | Limite por canal por hora (padrão `2`) |
| `TELEGRAM_MAX_POSTS_PER_DAY` | não | Limite por canal por dia (padrão `12`) |
| `TELEGRAM_MIN_SCORE` | não | Score mínimo para publicação automática (padrão `85`) |
| `TELEGRAM_MAX_OFFER_AGE_HOURS` | não | Idade máxima da oferta (padrão `24`) |
| `TELEGRAM_PUBLISH_START_HOUR` / `_END_HOUR` | não | Janela de publicação (padrão `7`/`22`) |
| `META_APP_ID` / `META_APP_SECRET` | publicação FB | Credenciais da app Meta. **Secret** |
| `META_PAGE_ACCESS_TOKEN` | publicação FB | **Secret.** Page Access Token com `pages_manage_posts` |
| `META_API_VERSION` | não | Versão da Graph API (padrão `v21.0`) |
| `META_TIMEOUT_MS` | não | Timeout por chamada à Graph API (padrão `15000`) |
| `META_API_BASE_URL` | não | Base da Graph API; sobrescrita apenas nos testes |
| `FACEBOOK_AUTO_PUBLISH_ENABLED` | não | **Autopilot do Facebook. Padrão `false`** |
| `FACEBOOK_MAX_POSTS_PER_HOUR` | não | Limite por Page por hora (padrão `1`) |
| `FACEBOOK_MAX_POSTS_PER_DAY` | não | Limite por Page por dia (padrão `6`) |
| `FACEBOOK_MIN_SCORE` | não | Score mínimo para publicação automática (padrão `85`) |
| `ADMIN_SESSION_TTL_HOURS` | não | Duração da sessão administrativa (padrão `12`) |
| `ADMIN_LOGIN_MAX_ATTEMPTS` | não | Tentativas de login por janela (padrão `5`) |
| `ADMIN_LOGIN_WINDOW_MINUTES` | não | Janela do freio de força bruta (padrão `15`) |
| `TRUST_PROXY` | não | Confiança em reverse proxy: `false` (padrão), `true`, nº de saltos ou lista de IPs |
| `MELI_TOKEN_SECRET` | OAuth | **Secret.** Cifra o refresh token rotativo no banco |
| `AFFILIATE_BOT_URL` | não | URL do affiliate-bot (padrão `http://localhost:3400`) |
| `AFFILIATE_BOT_SECRET` | não | **Secret.** Compartilhado entre API e bot |
| `AFFILIATE_BROWSER_PROFILE_PATH` | não | Perfil persistente do browser. **Contém sessão real** |
| `AFFILIATE_TAG` | não | Força uma tag; vazio = descoberta automática |
| `AFFILIATE_GENERATION_CONCURRENCY` | não | Concorrência da geração em lote (padrão `3`) |
| `APP_TIMEZONE` | não | Timezone da janela (padrão `America/Sao_Paulo`) |

`APP_ENV`, `API_PORT` e `DATABASE_URL` são validados no boot: a aplicação falha rápido e com
mensagem clara se algo estiver ausente ou inválido. `MELI_CLIENT_ID` e `MELI_CLIENT_SECRET`
precisam ser definidos **juntos** — configurar pela metade é erro de configuração e falha no boot.
Os limiares de oportunidade também são validados no boot (0–100, e `CANDIDATE` ≤ `APPROVED`).

**Nenhuma credencial de Meta ou Telegram existe ainda.**

## Banco de dados e migrations

```bash
npm run db:up              # sobe o PostgreSQL
npm run db:migrate         # cria/aplica migrations em desenvolvimento
npm run db:migrate:deploy  # aplica migrations (produção/CI)
npm run db:generate        # regenera o Prisma Client
npm run db:studio          # inspeção visual do banco
npm run db:down            # derruba o container
```

Migrations em `apps/api/prisma/migrations/`. **O nome da pasta define a ordem de aplicação**, e o
prefixo precisa ser um timestamp UTC crescente — uma migration escrita à mão com horário local
pode ordenar antes das anteriores e quebrar um banco criado do zero.

1. `init_foundation` — tabelas, enums, foreign keys, índices e uniqueness.
2. `money_integrity_constraints` — `CHECK` de valores monetários, escrita à mão (o Prisma não
   gera `CHECK`).
3. `marketplace_sync_and_price_history` — campos de sincronização em `products`
   (`permalink`, `sellerId`, `categoryId`, `currencyId`, `marketplaceStatus`, `lastSyncedAt`)
   e a tabela `price_snapshots`.
4. `price_snapshot_constraints` — `CHECK` de preços não negativos no histórico.
5. `opportunity_engine` — sinais de popularidade e vendedor em `products`, rastreio de origem em
   `affiliate_links`, `UNIQUE (productId, price)` em `offers` e a tabela
   `opportunity_evaluations`.
6. `publication_idempotency` — `UNIQUE (offerId, channelId)` em `publications`.
7. `admin_authentication` — `admin_users` e `admin_sessions`, com `email` e `tokenHash` únicos.
8. `affiliate_generation_and_oauth` — `source`/`tag`/`originUrl`/`generatedAt`/`verifiedAt` em
   `affiliate_links`, e `marketplace_credentials` (refresh token cifrado).

Constraints relevantes:

- `products (marketplace, marketplaceItemId)` **UNIQUE** — identidade do produto no marketplace.
- `channels (type, name)` **UNIQUE** — evita canais duplicados do mesmo tipo.
- `affiliate_links.productId` e `offers.productId` → `products` **ON DELETE CASCADE**.
- `publications.offerId` → `offers` **ON DELETE CASCADE**.
- `publications.channelId` → `channels` **ON DELETE RESTRICT** — não se apaga um canal que já
  possui histórico de publicação.
- `CHECK` de preços não negativos e desconto entre 0 e 100.
- `price_snapshots.productId` → `products` **ON DELETE CASCADE**, com índice
  `(productId, capturedAt DESC)` para leitura do histórico.
- `offers (productId, price)` **UNIQUE** — identidade de uma oportunidade; é o que garante a
  idempotência da geração automática no próprio banco.
- `opportunity_evaluations.productId` **UNIQUE** + **CASCADE** — uma avaliação por produto.
- `publications (offerId, channelId)` **UNIQUE** — uma oferta é publicada no máximo uma vez por
  canal; é essa constraint que impede duplicidade sob chamadas concorrentes.
- `admin_users.email` **UNIQUE** e `admin_sessions.tokenHash` **UNIQUE**, com `admin_sessions`
  em **CASCADE**: apagar o admin encerra as sessões dele.

## API

Base: `http://localhost:3333`. **Todos os endpoints exigem sessão**, exceto os marcados como
públicos (ver *Autenticação administrativa*). Todas as listagens aceitam `?take=` (máx. 100) e `?skip=`, e
respondem `{ data, total, take, skip }`.

| Método  | Rota                   | Descrição                                            |
| ------- | ---------------------- | ---------------------------------------------------- |
| `GET`   | `/health`              | **Público.** Aplicação + PostgreSQL (503 se o banco cair) |
| `POST`  | `/auth/login`          | **Público.** Abre sessão administrativa              |
| `POST`  | `/auth/logout`         | **Público.** Encerra a sessão; idempotente           |
| `GET`   | `/auth/me`             | Identidade da sessão atual                           |
| `GET`   | `/auth/mercado-livre/authorize` | Inicia a autorização OAuth (uma vez)        |
| `GET`   | `/auth/mercado-livre/callback`  | **Público.** Callback do Mercado Livre      |
| `GET`   | `/auth/mercado-livre/status`    | Se a integração já está autorizada          |
| `GET`   | `/affiliate-links/generation/status` | Sessão do bot e tag ativa              |
| `POST`  | `/affiliate-links/generate` | Gera os links que faltam (lote)                 |
| `POST`  | `/affiliate-links/generate/:productId` | Garante link de um produto           |
| `GET`   | `/products`            | Filtros: `active`, `marketplace`, `search`           |
| `GET`   | `/products/:id`        |                                                      |
| `POST`  | `/products`            |                                                      |
| `PATCH` | `/products/:id`        | `marketplace` e `marketplaceItemId` são imutáveis    |
| `POST`  | `/products/import`     | Importa um item real do Mercado Livre (idempotente) |
| `POST`  | `/products/sync`       | Sincroniza todos os ativos; devolve relatório do lote |
| `POST`  | `/products/:id/sync`   | Sincroniza um produto                                |
| `POST`  | `/products/refresh-popularity` | Atualiza popularidade dos ativos (1 chamada por categoria) |
| `POST`  | `/products/evaluate`   | Avalia todos os ativos; devolve relatório do lote    |
| `POST`  | `/products/:id/evaluate` | Avalia um produto no Opportunity Engine            |
| `GET`   | `/products/:id/prices` | Histórico de preços, mais recente primeiro (`?limit=`) |
| `GET`   | `/affiliate-links`     | Filtros: `productId`, `active`                       |
| `POST`  | `/affiliate-links`     |                                                      |
| `PATCH` | `/affiliate-links/:id` | `productId` é imutável                               |
| `GET`   | `/channels`            | Filtros: `type`, `active`                            |
| `POST`  | `/channels`            |                                                      |
| `PATCH` | `/channels/:id`        | `type` é imutável                                    |
| `GET`   | `/offers`              | Filtros: `status`, `productId`                       |
| `POST`  | `/offers`              |                                                      |
| `PATCH` | `/offers/:id`          | `productId` é imutável                               |
| `GET`   | `/publications`        | Filtros: `status`, `channelId`, `offerId`            |
| `GET`   | `/analytics/summary`   | Contadores do dashboard                              |
| `GET`   | `/marketplace/mercado-livre/highlights` | Mais vendidos por categoria (`?categoryId=`) |
| `GET`   | `/opportunities`       | Estado operacional (`?status=`, `?category=`, `?minScore=`) |
| `POST`  | `/opportunities/:productId/decision` | Registra decisão humana (`APPROVED`/`REJECTED`) |
| `DELETE`| `/opportunities/:productId/decision` | Remove o override e devolve a decisão ao engine |
| `POST`  | `/offers/:id/publish`  | Publica no Telegram (`{ "channelId": "..." }`)      |
| `POST`  | `/offers/:id/publish-all` | Publica em todos os canais ativos suportados     |
| `POST`  | `/publications/:id/retry` | Reenvia uma publicação `FAILED`                   |
| `POST`  | `/channels/:id/test`   | Valida o canal (Telegram `getChat` / Facebook `GET /{page-id}`), sem publicar |
| `GET`   | `/offers/:id/manual-preview` | Texto pronto para copiar (`?channelId=`), somente leitura |
| `POST`  | `/offers/:id/manual-publication` | Registra publicação feita manualmente pelo operador |
| `POST`  | `/automation/run`      | Executa agora o mesmo ciclo do scheduler            |
| `GET`   | `/automation/status`   | Autopilot, execução atual, última execução e limites |

Publicações são **somente leitura**: nada as cria ainda, e isso é intencional.

### Formato de erro

Toda falha responde no mesmo formato:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Ja existe um registro com o mesmo valor para: marketplace, marketplaceItemId",
  "path": "/products",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

`stack` só aparece fora de `APP_ENV=production`. Erros do Prisma são traduzidos: `P2002` → 409,
`P2003` → 422, `P2025` → 404.

## Autenticação administrativa

O Garimpo é um painel de operador único ou equipe interna pequena. A autenticação é
proporcional a isso: **email e senha, sessão em cookie, nada além**. Sem organizações, RBAC,
SSO, MFA ou cadastro público.

### Modelo

```text
Browser
   ↓  formulário de login
Next.js (Server Action)
   ↓  POST /auth/login
API  ──►  token opaco + AdminSession
   ↓
Cookie HttpOnly na origem do painel
   ↓  Authorization: Bearer <token>
API valida a cada requisição
```

**Fonte única da verdade: a API.** O painel não mantém sessão própria — guarda o token opaco
emitido pela API e o encaminha. Não há duas sessões para sair de sincronia.

O token vai para a API como `Authorization: Bearer`, nunca como cookie ambiente — então **a API
não tem superfície de CSRF**. Ver *CSRF* abaixo.

### Primeiro administrador

Não existe cadastro público. O primeiro admin é criado por comando:

```bash
npm run admin:create
# Email do admin: operador@exemplo.com
# Senha:            (não aparece na tela)
# Confirme a senha: (não aparece na tela)
```

A senha é lida com o eco desligado — não aparece no terminal, no histórico do shell nem em log.
Mínimo de 12 caracteres. **Se já existir admin com aquele email, o comando falha e não altera
nada**: recriar seria uma troca silenciosa de senha.

### Senhas

**argon2id**, com os parâmetros recomendados pelo OWASP: 19 MiB de memória, 2 iterações,
paralelismo 1. Cada senha tem salt próprio, então a mesma senha gera hashes diferentes.

Em `APP_ENV=test` o custo cai (4 MiB, 1 iteração) para a suíte não ficar impraticável — o custo
do KDF não é o que protege um banco de testes.

Nunca SHA-256, MD5 ou cifra reversível para senha.

> **Por que o token de sessão usa SHA-256, então?** Porque não é uma senha. O token são 32 bytes
> de CSPRNG — entropia alta demais para força bruta, então um KDF lento não acrescentaria nada.
> No banco fica apenas `sha256(token)`; vazamento do banco não permite reconstruir o token.

### Sessão

| | |
| --- | --- |
| Cookie | `garimpo_session` |
| Flags | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` em produção |
| TTL | `ADMIN_SESSION_TTL_HOURS` (padrão **12h**) |
| Armazenamento | `admin_sessions` — só o hash do token |

`HttpOnly` significa que **o JavaScript da página nunca alcança o token**. Nada é guardado em
`localStorage` ou `sessionStorage` — há teste que verifica isso em todo o painel.

`Secure` só é ligado em produção; em `http://localhost` o cookie seria descartado pelo browser.

Sessão expirada, revogada, ou de usuário desativado → **401**, e a linha expirada é removida.
Não há renovação automática: passadas as 12h, entra de novo.

**Limpeza**: sessões vencidas são apagadas no próprio login e na validação. Sem job dedicado.

### Logout

```bash
curl -X POST http://localhost:3333/auth/logout -H "Authorization: Bearer <token>"
```

Invalida a sessão no banco e limpa o cookie. **Idempotente**: sem token, ou com token já
inválido, responde `204` do mesmo jeito. Encerrar uma sessão não derruba as outras do mesmo
usuário.

No painel, o botão **Sair** fica no rodapé da sidebar, ao lado do email do admin.

### O que é público

A API é **autenticada por padrão**: o guard é global e só rotas marcadas com `@Public()` ficam
abertas. Um controller novo nasce protegido — não depende de alguém lembrar de protegê-lo.

| Rota | Por quê |
| ---- | ------- |
| `GET /health` | Orquestradores precisam consultar sem credencial. Devolve apenas status, uptime e o resultado do ping no banco — nunca versão, URL do banco, token ou stack |
| `POST /auth/login` | Óbvio |
| `POST /auth/logout` | Idempotente e inofensivo |

**Todo o resto exige sessão**, incluindo leitura: `/products`, `/affiliate-links`, `/channels`,
`/offers`, `/opportunities`, `/publications`, `/analytics`, `/automation`, `/marketplace/*`.

As mais sensíveis — `POST /automation/run`, `/offers/:id/publish`, `/offers/:id/publish-all`,
`/publications/:id/retry`, `/offers/:id/manual-publication`, `/channels/:id/test` — têm teste
próprio garantindo `401` anônimo.

### Painel

`/login` é a única rota pública. Todas as demais vivem no grupo autenticado, cujo layout chama
`requireAdmin()` a cada render: sem sessão, `redirect('/login')`. Anônimo tentando `/dashboard`
recebe **307 → /login**; autenticado tentando `/login` vai para `/dashboard`.

**Server Actions validam a sessão explicitamente.** Uma action não é segura só porque a página
exige login — ela é um endpoint POST próprio. Toda action administrativa começa com
`await requireAdmin()`, e há teste que falha se alguma exportação escapar disso.

O cliente HTTP do painel também trata `401` da API redirecionando para `/login`, porque layout e
página renderizam em paralelo: o redirect do layout sozinho não impediria a página de estourar
antes.

### CSRF

Proporcional à arquitetura, sem framework adicional:

1. **A API não aceita credencial ambiente para operações do painel** — o token vai por
   `Authorization: Bearer`, que um formulário cross-site não consegue enviar.
2. **`SameSite=Lax`** no cookie do painel: o browser não o envia em POST cross-site.
3. **Server Actions do Next.js** verificam a origem da requisição por padrão.

O cookie é aceito pela API apenas como conveniência para acesso direto por browser; o painel não
depende disso.

### Força bruta

Contador em memória por **email + IP**: `ADMIN_LOGIN_MAX_ATTEMPTS` (padrão 5) tentativas em
`ADMIN_LOGIN_WINDOW_MINUTES` (padrão 15). Excedido, responde `429` com `Retry-After`.

**A conta nunca é bloqueada permanentemente** — a janela expira sozinha, e um login bem-sucedido
zera o contador.

O login também nivela o tempo de resposta entre "email inexistente" e "senha errada": quando o
usuário não existe, ainda gastamos uma verificação argon2, para não vazar a existência do email
por timing. A mensagem é sempre a mesma: `Invalid credentials`.

> ⚠️ O contador vive na memória do processo. Isso basta na **instância única** da V1; múltiplas
> réplicas exigiriam storage compartilhado — mesma limitação já documentada para o autopilot.

### Logs

Registramos `login_success` (com `adminUserId`), `login_failed` (com o motivo interno), `logout`
e `session_expired`.

**Nunca** senha, cookie, token de sessão, hash ou header `Authorization`. Verificado no smoke:
zero ocorrências da senha, do token e de hash argon2 nos logs de API e painel.

### Deployment

> **O Garimpo já pode sair do localhost** — mas atrás de HTTPS. `Secure` só é aplicado ao cookie
> quando `APP_ENV=production` / `NODE_ENV=production`; servir o painel em HTTP puro na rede
> exporia o cookie de sessão.

**Reverse proxy**: `TRUST_PROXY` é explícito e vem `false` por padrão. Aceita `true`, um número
de saltos, ou lista de IPs/sub-redes. Confiar cegamente em `X-Forwarded-For` deixaria qualquer
cliente forjar o próprio IP e escapar do limite de tentativas de login — por isso o padrão é não
confiar. Ligue-o **apenas** quando houver de fato um proxy à frente, e prefira o número de saltos
ou a lista de IPs a `true`.

O `docker-compose` continua publicando as portas em `127.0.0.1`. Para expor, coloque um proxy com
TLS à frente e ajuste `TRUST_PROXY` e `CORS_ORIGINS`.

## Integração Mercado Livre

Somente **APIs oficiais** de `https://api.mercadolibre.com`. Não há scraping, automação de
browser nem geração automática de link de afiliado. Site suportado: **MLB (Brasil)**.

### 1. Criar a aplicação

1. Acesse o [DevCenter](https://developers.mercadolivre.com.br/devcenter) e crie uma aplicação.
2. Registre uma **Redirect URI** (mesmo valor de `MELI_REDIRECT_URI`).
3. Copie **Client ID** e **Client Secret** para o `.env`.

```bash
MELI_CLIENT_ID=seu-client-id
MELI_CLIENT_SECRET=seu-client-secret
MELI_SITE_ID=MLB
```

### 2. Autenticação

A aplicação obtém o token sozinha e o mantém **apenas em memória**, renovando pouco antes de
expirar. Nada é gravado no banco, e o token nunca aparece em log nem em resposta da API.

Dois grants, escolhidos automaticamente:

- **`client_credentials`** (padrão) — usado quando só há `MELI_CLIENT_ID` e `MELI_CLIENT_SECRET`.
  Suficiente para leitura de itens, preços, categorias e highlights.
- **`refresh_token`** — usado se `MELI_REFRESH_TOKEN` estiver definido, para quando a aplicação
  precisar de contexto de usuário.

Para obter um refresh token (fluxo `authorization_code`), autorize a aplicação no browser:

```text
https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=$MELI_CLIENT_ID&redirect_uri=$MELI_REDIRECT_URI
```

e troque o `code` recebido na redirect por tokens:

```bash
curl -X POST https://api.mercadolibre.com/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d grant_type=authorization_code \
  -d client_id="$MELI_CLIENT_ID" \
  -d client_secret="$MELI_CLIENT_SECRET" \
  -d code="$CODE" \
  -d redirect_uri="$MELI_REDIRECT_URI"
```

Guarde o `refresh_token` em `MELI_REFRESH_TOKEN` no `.env`. **Nunca versione esse valor.**

> Sem credenciais a API sobe normalmente; apenas os endpoints que dependem do Mercado Livre
> respondem `502`. O resto do sistema continua funcionando.

### Endpoints oficiais consumidos

| Endpoint                                     | Uso                                                     |
| -------------------------------------------- | ------------------------------------------------------- |
| `POST /oauth/token`                          | Obtém/renova o access token                             |
| `GET /items/:itemId`                         | Título, categoria, imagem, seller, permalink, status    |
| `GET /items?ids=...`                         | Multiget (até 20) para resolver os highlights           |
| `GET /items/:itemId/prices`                  | **Fonte de verdade de preço** (`standard` + `regular_amount`) |
| `GET /categories/:categoryId`                | Nome da categoria                                       |
| `GET /highlights/MLB/category/:categoryId`   | Até 20 mais vendidos da categoria                       |
| `GET /products/:productId`                   | Resolve highlights de catálogo (buy box winner)         |

Os campos de preço de `/items` são legados e **não** são usados para gravar valor — só
`/items/:id/prices` alimenta `currentPrice` e o histórico.

### Importar um item

Pelo admin, em `/products` → *Importar do Mercado Livre*. Ou pela API:

```bash
curl -X POST http://localhost:3333/products/import \
  -H 'Content-Type: application/json' \
  -d '{"marketplaceItemId":"MLB1234567890"}'
```

A importação é **idempotente**: reimportar o mesmo id atualiza o produto existente em vez de
duplicar. O fluxo é `item → validação de site → normalização → Product → PriceSnapshot`.

### Sincronizar

```bash
# um produto
curl -X POST http://localhost:3333/products/<uuid>/sync

# todos os ativos, com relatório
curl -X POST http://localhost:3333/products/sync
# => {"total":42,"synced":7,"unchanged":34,"failed":1,"failures":[...]}
```

O lote roda com concorrência pequena (`MELI_SYNC_CONCURRENCY`, padrão 4, máx. 8), sequencial por
worker. **A falha de um item não aborta o lote nem corrompe o estado anterior daquele produto**:
todas as chamadas externas acontecem antes da escrita, e a escrita é uma transação.

Sincroniza título, imagem, categoria, seller, permalink, moeda, status do anúncio, preço atual,
preço original e `lastSyncedAt`.

`active` é **nossa** flag de monitoramento, não o status do anúncio. O sync só a desliga quando o
anúncio é encerrado (`closed`); `paused` é temporário e não desativa nada, e nada que o operador
desativou é reativado automaticamente. O status do marketplace fica em `marketplaceStatus`.

### Histórico de preços

```bash
curl "http://localhost:3333/products/<uuid>/prices?limit=50"
# => [{"price":"799.00","originalPrice":"999.00","currencyId":"BRL","capturedAt":"..."}]
```

Ordenado do **mais recente para o mais antigo**. Padrão 50 pontos, máximo 500.

Regra anti-ruído: a primeira sincronização grava um ponto; depois, **um novo ponto só é criado
quando `price` ou `originalPrice` muda**. Sincronizar 100 vezes com preço estável continua
gerando um único registro. `PriceSnapshot` é imutável — nunca é atualizado, apenas inserido.

No admin, cada linha de `/products` tem um link **Histórico**.

### Mais vendidos (highlights)

```bash
curl "http://localhost:3333/marketplace/mercado-livre/highlights?categoryId=MLB1051"
```

Retorna até 20 itens ranqueados. **Nada é persistido**: a descoberta não enche o catálogo
sozinha — o operador escolhe o que importar. Entradas do tipo `PRODUCT` (catálogo) são resolvidas
pelo vencedor do buy box, para que o botão *Importar* tenha um item real.

No admin: `/products/discover`.

### Erros externos

Falha do provider vira status interno consistente, e **a resposta bruta do Mercado Livre nunca
chega ao cliente**:

| Causa                    | Resposta da nossa API |
| ------------------------ | --------------------- |
| item/categoria inválido  | `422`                 |
| não encontrado           | `404`                 |
| credencial inválida/ausente (`401`/`403` do ML) | `502` |
| rate limit               | `429`                 |
| timeout                  | `504`                 |
| Mercado Livre indisponível | `503`               |

Os logs trazem `provider`, `operation`, `failure`, `resourceId` e `upstreamStatus` — **nunca
token nem corpo da resposta**.

### Limites conhecidos

- Uma única retentativa, apenas para falhas transitórias (timeout, 5xx, 429) em `GET`.
- `highlights` retorna no máximo 20 itens por categoria — limite da API oficial.
- Multiget de itens é limitado a 20 ids por chamada.
- Nomes de categoria são reaproveitados **em memória** durante a mesma operação (single-flight),
  então um lote inteiro na mesma categoria custa uma chamada. Não há cache entre requisições.
- O access token vive só no processo: reiniciar a API pede um token novo.
- Não há scheduler. Sincronizar é sempre uma ação explícita do operador.

## Geração automática de link de afiliado

O Garimpo transforma um produto elegível em link de afiliado **sozinho**. Não há copiar/colar,
nem operador abrindo produto, nem montagem manual de URL.

> ### ⚠️ Esta parte NÃO é API oficial
>
> A API de Developers do Mercado Livre **não expõe** geração de link de afiliado. O que existe é
> a Central de Afiliados, um site. O `affiliate-bot` mantém uma sessão real dessa Central e usa
> os endpoints internos que ela própria consome:
>
> ```text
> GET  /affiliate-program/api/v2/stripe/user/tags
> POST /affiliate-program/api/v2/stripe/user/links   { url, tag }
> ```
>
> Isso é um **`UNOFFICIAL_WEB_ADAPTER`**, e está isolado em `apps/affiliate-bot` justamente por
> isso. Ver *Riscos* no fim desta seção — eles são reais e não estão mascarados.

### O que é oficial e o que não é

| Dado | Origem | Status |
| ---- | ------ | ------ |
| Catálogo, preço, categoria, vendedor, highlights | API de Developers | **Oficial** |
| Link de afiliado | Central de Afiliados (endpoints internos) | **Não oficial** |

**O browser existe exclusivamente para gerar o link.** Catálogo, preços, vendedor e highlights
continuam vindo da API oficial — nunca do browser.

### Fluxo

```text
Product (permalink)  ──►  affiliate-bot  ──►  Central de Afiliados
                                                     │
                          AffiliateLink  ◄───────────┘
                          source = MERCADO_LIVRE_AFFILIATE_WEB
```

O bot é um **processo separado**. Se cair, a API, o Opportunity Engine e as publicações de links
já existentes continuam funcionando — só deixam de surgir links novos.

### Sessão

O bot usa um **contexto persistente do Playwright**. A sessão é do operador, autenticada **uma
vez**:

```bash
npx playwright install chromium   # uma vez por máquina
npm run affiliate:login           # abre o browser; você entra no Mercado Livre
```

Funciona em Windows, macOS e Linux: o comando resolve o CLI do `tsx` pelo próprio pacote e o
executa com o Node atual, sem depender de `node_modules/.bin` (no Windows o npm cria ali um
`tsx` sem extensão, que só o Git Bash consegue executar).

> ⚠️ **Rode na máquina do operador, nunca dentro do container.** Abrir uma janela de browser
> exige sessão gráfica — o container não tem. Por isso o perfil é um **bind mount**
> (`AFFILIATE_BROWSER_PROFILE_PATH`, padrão `./.garimpo/affiliate-profile`): você autentica no
> host e o container lê exatamente a mesma sessão. Rodar o comando dentro do container responde
> com essa instrução em vez de falhar de forma obscura.

Não há tentativa de burlar MFA, captcha, challenge ou confirmação de dispositivo. Quando a sessão
cai, o bot responde `AUTH_REQUIRED` e o painel avisa.

> Autenticar a conta de tempos em tempos **não é operação manual por produto** — que é o que este
> PR elimina. Um login eventual cobre milhares de links.

O perfil do browser guarda cookies reais da conta:

| | |
| --- | --- |
| Caminho | `AFFILIATE_BROWSER_PROFILE_PATH` |
| Git | ignorado (`.gitignore`) |
| Imagem Docker | **não entra** — montado como volume privado |
| Logs | nunca |

### Tag

O bot descobre a tag ativa sozinho em `/tags`. Com várias candidatas e nenhuma marcada como em
uso, **falha explicitamente** (`AMBIGUOUS_TAG`) em vez de escolher ao acaso — uma tag errada
atribuiria a comissão a outro lugar. Para forçar, use `AFFILIATE_TAG`.

### Fail-closed

Se a geração falhar, o produto simplesmente fica sem link:

```text
sem AffiliateLink ativo  →  NOT_ELIGIBLE  →  não publica
```

**O `Product.permalink` NUNCA é usado como alternativa.** Publicar o permalink seria tráfego não
monetizado — exatamente o que o Garimpo existe para evitar.

Antes de persistir, o link é validado: HTTPS, host do Mercado Livre, tag igual à ativa,
`origin_url` do mesmo produto, e — o mais importante — **precisa carregar rastreio de afiliado**
(short link `/sec/…` ou parâmetros `matt_tool`/`matt_word`). Comparar com o permalink não
bastaria: `www.mercadolivre.com.br/MLB-123` e `produto.mercadolivre.com.br/MLB-123` são a mesma
página não monetizada com hosts diferentes. A URL nunca é reconstruída por nós.

### Idempotência

Um link ativo por produto. Regerar com o link já existente não chama o provider (`unchanged`); um
link novo desativa o anterior em vez de acumular. **Link cadastrado manualmente tem precedência**
e não é sobrescrito.

### Quando gera

Automaticamente, no ciclo do autopilot, **antes da avaliação**:

```text
sync → refresh popularity → ensure affiliate links → evaluate → publish
```

A ordem importa: sem link, a oportunidade seria `NOT_ELIGIBLE` e nunca chegaria à distribuição.

Manualmente:

```bash
curl -X POST http://localhost:3333/affiliate-links/generate            # todos os que faltam
curl -X POST http://localhost:3333/affiliate-links/generate/<productId>
curl http://localhost:3333/affiliate-links/generation/status
```

Concorrência 3 (`AFFILIATE_GENERATION_CONCURRENCY`, máx. 5) — a Central é um site, não uma API.
Uma falha não interrompe o lote; sessão caída interrompe cedo, porque insistir só gastaria tempo.

Retry: **uma** repetição, só em falha claramente transitória (5xx, rede). `AUTH_REQUIRED`,
sessão inválida e challenge **nunca** entram em loop.

No painel: **Automação de afiliados** mostra sessão, tag ativa, produtos sem link e o botão
*Gerar links que faltam*.

### Riscos — assumidos, não mascarados

1. **O endpoint interno pode mudar ou sumir sem aviso.** Não há contrato de API. Se mudar, só o
   adapter em `apps/affiliate-bot` precisa ser trocado.
2. **A sessão expira.** O bot passa a responder `AUTH_REQUIRED` e nenhum link novo é gerado até
   alguém reautenticar.
3. **MFA, captcha ou confirmação de dispositivo exigem o operador.** Não tentamos contornar.
4. **A integração pode quebrar silenciosamente.** Por isso o fail-closed: se algo sair do
   esperado, o Garimpo deixa de publicar aquele produto em vez de publicar link ruim.
5. **Automatizar endpoints internos pode conflitar com os termos de uso do Mercado Livre.** A
   conta é do operador e os links são dele, mas essa avaliação é dele também.

## OAuth do Mercado Livre

`client_credentials` **não basta**. Verificado contra a API real em 29/08/2026:

| Recurso | `client_credentials` |
| ------- | -------------------- |
| `/categories/*` | ✅ funciona |
| `/items/:id` | ❌ 403 `PA_UNAUTHORIZED_RESULT_FROM_POLICIES` |
| `/items/:id/prices` | ❌ 403 |
| `/highlights/...` | ❌ 403 |
| `/users/:id` | ❌ 403 |
| `/sites/MLB`, `/sites/MLB/search`, `/trends` | ❌ 403 |

Ou seja: **Authorization Code é obrigatório** para tudo que o Garimpo realmente usa.

### Autorizar (uma vez)

```bash
curl http://localhost:3333/auth/mercado-livre/authorize   # devolve a authorizationUrl
```

Abra a URL, autorize, e o Mercado Livre redireciona para
`https://api-garimpo.allblue-labs.com/auth/mercado-livre/callback`. O callback valida o `state`
(uso único, comparação em tempo constante), troca o `code` por tokens e guarda o **refresh
token**.

`GET /auth/mercado-livre/status` mostra se já está autorizado.

O refresh token é **rotativo**: cada renovação devolve um novo e invalida o anterior, então ele
não cabe numa environment variable. Fica em `marketplace_credentials`, **cifrado com AES-256-GCM**
(chave derivada por scrypt de `MELI_TOKEN_SECRET`). Nunca é logado nem devolvido pela API. Se a
chave mudar, a credencial é tratada como ausente e o sistema pede nova autorização — nunca usa um
token inválido.

> `MELI_TOKEN_SECRET` é obrigatório para autorizar. Sem ele, `/authorize` responde `422` em vez de
> guardar o segredo de forma insegura.

## Opportunity Engine

Transforma produto + preços + histórico + popularidade + link de afiliado em uma decisão
**determinística e explicável** sobre o que merece divulgação. Sem ML, sem LLM, sem
probabilidade: a mesma entrada produz sempre a mesma saída, e todo score vem acompanhado do
detalhamento que o justifica.

**Nenhuma chamada externa acontece durante a avaliação.** O engine lê apenas o que já está no
banco, o que o torna rápido, determinístico e testável.

### Fórmula

```text
score = discount + priceHistory + popularity + seller + freshness     (0..100)
```

| Componente     | Máximo | Sinal                                              |
| -------------- | -----: | -------------------------------------------------- |
| `discount`     |     35 | Desconto oficial (`currentPrice` vs `originalPrice`) |
| `priceHistory` |     25 | Preço atual vs nossos `PriceSnapshot` (30 dias)     |
| `popularity`   |     20 | Posição nos mais vendidos oficiais                  |
| `seller`       |     10 | Reputação do vendedor                               |
| `freshness`    |     10 | Quão recente é a mudança de preço                   |
| **Total**      | **100** |                                                    |

Os pesos são **constantes versionadas em código**
([weights.ts](apps/api/src/modules/opportunity/scoring/weights.ts)): são regra de negócio,
revisada em code review, não configuração de ambiente. Só os limiares e o cooldown vêm de env.

#### `discount` (0–35)

| Desconto | Pontos |
| -------- | -----: |
| ≥ 30%    |     35 |
| 20–29%   |     25 |
| 10–19%   |     16 |
| 1–9%     |      8 |
| ≤ 0% ou sem `originalPrice` | 0 |

`originalPrice` sozinho não prova boa oferta — um "preço de" inflado rende pontos aqui, mas não
sustenta o score sem o histórico que nós mesmos coletamos.

#### `priceHistory` (0–25)

Compara o preço atual com `min`, `max` e `average` dos `PriceSnapshot` dos últimos 30 dias
(`OPPORTUNITY_HISTORY_WINDOW_DAYS`).

| Situação                        | Pontos |
| ------------------------------- | -----: |
| ≤ menor preço da janela         |     25 |
| ≤ menor preço + 2%              |     22 |
| ≤ 90% da média                  |     18 |
| < média                         |     13 |
| ≤ média + 5%                    |      7 |
| > média + 5%                    |      2 |

**Sem histórico degrada de forma previsível:** 0 pontos quando não há nenhum snapshot na janela,
e no máximo 10 quando existe **um único** ponto — um preço não pode ser "o menor de todos" quando
ele é o único que conhecemos.

#### `popularity` (0–20)

Usa apenas o ranking oficial de mais vendidos, coletado por
`POST /products/refresh-popularity`.

| Posição | Pontos |
| ------- | -----: |
| 1–3     |     20 |
| 4–10    |     15 |
| 11–20   |     10 |
| fora do ranking, nunca verificado, ou verificado há mais de 7 dias | 0 |

Ausência de dado vale **0, sem penalização adicional**: o produto simplesmente não ganha estes
pontos.

#### `seller` (0–10)

Coletado na sincronização via `/users/:id` (uma chamada por vendedor distinto, por lote).

| Sinal                                       | Pontos |
| ------------------------------------------- | -----: |
| `power_seller_status` platinum / gold / silver | 10 / 9 / 8 |
| `level_id` 5_green / 4_light_green / 3_yellow / 2_orange / 1_red | 8 / 6 / 4 / 2 / 0 |
| **sem dado**                                | **5 (neutro)** |

Ausência de dado é neutra, não zero: não sabemos que o vendedor é ruim.

#### `freshness` (0–10)

Evita que uma oferta antiga siga parecendo excelente para sempre. Como só gravamos snapshot
quando o preço muda, o snapshot mais recente marca a última mudança de preço.

| Última mudança de preço | Pontos |
| ----------------------- | -----: |
| ≤ 1 dia                 |     10 |
| ≤ 3 dias                |      8 |
| ≤ 7 dias                |      6 |
| ≤ 14 dias               |      4 |
| ≤ 30 dias               |      2 |
| > 30 dias / sem mudança |      0 |

Dois tetos: se a última variação foi de **alta**, no máximo 3 (uma alta não é oportunidade); se
`lastSyncedAt` tem mais de 7 dias, no máximo 2 (dados velhos não sustentam urgência).

> `freshness` não é cooldown. Freshness mede se o movimento de preço ainda é novidade; cooldown
> evita repetir a mesma oportunidade.

### Status e limiares

| Score    | Status do engine |
| -------- | ---------------- |
| 85–100   | `APPROVED`       |
| 70–84    | `CANDIDATE`      |
| 0–69     | `IGNORE`         |

**Sem `AffiliateLink` ativo → `NOT_ELIGIBLE`, mesmo com score 100.** Publicar sem link é trabalho
sem retorno, então essa é a única regra que nem o operador sobrepõe. O score continua sendo
calculado e exibido — é justamente ele que justifica cadastrar o link.

Limiares em `OPPORTUNITY_APPROVED_THRESHOLD` e `OPPORTUNITY_CANDIDATE_THRESHOLD`, validados no
boot (0–100, e candidate ≤ approved).

> **Na prática:** alcançar 85 exige quase todos os sinais. Sem popularidade coletada o teto é
> 35+25+10+10 = **80**; se o vendedor também estiver no fallback neutro (5), o teto cai para
> **75**. Nos dois casos o máximo possível é `CANDIDATE`. Isso é intencional: rodar
> `refresh-popularity` antes de avaliar muda materialmente o resultado, e o operador sempre pode
> aprovar manualmente.

### Score ≠ decisão operacional

São dois conceitos separados, e ambos ficam visíveis:

- **`status`** — recomendação do engine, derivada só do score e da elegibilidade.
- **`operatorDecision`** — decisão humana explícita (`APPROVED` / `REJECTED`), preservada entre
  reavaliações. O engine **nunca** a apaga nem sobrescreve o score.
- **`effectiveStatus`** — o que vale na prática: a decisão humana quando existir, senão o engine.

```text
Engine: CANDIDATE  +  Operator: APPROVED  →  Offer APPROVED
Engine: APPROVED   +  Operator: REJECTED  →  Offer REJECTED
Engine: NOT_ELIGIBLE + Operator: APPROVED →  continua NOT_ELIGIBLE (regra do link é absoluta)
```

`DELETE /opportunities/:productId/decision` devolve a decisão ao engine.

### Offer: idempotência e cooldown

A identidade de uma oportunidade é **`(productId, price)`**, garantida por `UNIQUE` no banco.

| Situação                                  | Efeito                                    |
| ----------------------------------------- | ----------------------------------------- |
| `APPROVED` / `CANDIDATE`, sem Offer nesse preço | cria a Offer                        |
| Reavaliar sem mudança de preço            | reusa a Offer existente, não duplica      |
| Preço muda                                | nova oportunidade → nova Offer            |
| `IGNORE` / `NOT_ELIGIBLE`                 | não cria Offer nova                       |
| Offer já `APPROVED` há menos de 24h       | **suprimida pelo cooldown**, não é tocada |

Cooldown em `OPPORTUNITY_COOLDOWN_HOURS` (padrão 24h), aplicado a ofertas já aprovadas. Ele
influencia apenas a geração da oportunidade — nunca o score.

### Persistência da avaliação

`OpportunityEvaluation` guarda **uma linha por produto** (upsert), não um histórico:

```text
productId (UNIQUE) · score · status · breakdown JSON · reasons[] · evaluatedAt
operatorDecision · operatorDecidedAt · operatorNote
```

**Por que uma linha e não histórico:** o fluxo operacional só precisa do estado atual, e `Offer`
já registra as oportunidades efetivamente geradas. Guardar histórico de avaliação seria
complexidade sem caso de uso hoje. A tabela existe porque `IGNORE` e `NOT_ELIGIBLE` **não** geram
Offer — sem ela, um produto com score 94 e sem link ficaria invisível, quebrando o fluxo
`LINK REQUIRED`.

### Como executar

```bash
# 1. dados frescos e popularidade (chamadas externas)
curl -X POST http://localhost:3333/products/sync
curl -X POST http://localhost:3333/products/refresh-popularity

# 2. avaliação (sem chamadas externas)
curl -X POST http://localhost:3333/products/<uuid>/evaluate
curl -X POST http://localhost:3333/products/evaluate
# => {"total":42,"approved":3,"candidate":7,"ignored":28,"notEligible":4,"failed":0,"offersCreated":10}

# 3. estado operacional
curl "http://localhost:3333/opportunities?status=APPROVED&minScore=85"

# 4. decisão humana
curl -X POST http://localhost:3333/opportunities/<uuid>/decision \
  -H 'Content-Type: application/json' -d '{"decision":"REJECTED","note":"Margem baixa"}'
```

A falha de um produto no lote é registrada em `failures[]` e **não aborta os demais**.

### Exemplo completo

Echo Dot a R$ 700, de R$ 1000, menor preço dos últimos 30 dias, 1º nos mais vendidos, vendedor
platinum, preço caiu hoje:

```json
{
  "score": 100,
  "status": "APPROVED",
  "effectiveStatus": "APPROVED",
  "breakdown": {
    "discount":     { "earned": 35, "max": 35 },
    "priceHistory": { "earned": 25, "max": 25 },
    "popularity":   { "earned": 20, "max": 20 },
    "seller":       { "earned": 10, "max": 10 },
    "freshness":    { "earned": 10, "max": 10 }
  },
  "reasons": [
    "Desconto oficial de 30%",
    "Menor preco dos ultimos 30 dias",
    "Top 1 dos mais vendidos da categoria",
    "Vendedor platinum",
    "Queda de preco hoje"
  ],
  "offerCreated": true,
  "suppressedByCooldown": false
}
```

O mesmo produto **sem link de afiliado ativo** mantém score 100, mas vira `NOT_ELIGIBLE`, não
gera Offer, e a primeira razão passa a ser
`"Produto sem link de afiliado ativo - nao elegivel para publicacao"`.

## Publicação no Telegram

Transforma uma oportunidade **efetivamente `APPROVED`** em uma mensagem real num canal público,
usando a **Bot API oficial**. A publicação é sempre explícita — não há scheduler neste PR.

### 1. Criar o bot

1. Fale com [@BotFather](https://t.me/BotFather) no Telegram e envie `/newbot`.
2. Escolha nome e username; o BotFather devolve o **token** (`123456789:AA...`).
3. Coloque o token em `TELEGRAM_BOT_TOKEN` no `.env`. **Nunca versione esse valor.**

### 2. Dar permissão ao bot no canal

O bot **precisa ser administrador do canal** com permissão de postar:

1. Abra o canal → *Administrators* → *Add Administrator*.
2. Busque o username do bot e adicione.
3. Habilite **Post Messages** (as demais permissões não são necessárias).

Sem isso o Telegram responde `not enough rights`, que a API traduz para
*"O bot precisa ser administrador do canal para publicar"*.

### 3. Cadastrar o canal

Em `/channels`, crie um canal `TELEGRAM` e informe em `externalIdentifier` o destino aceito pela
Bot API — para canal público, o handle:

```text
@ofertas_brasil
```

Use **Testar canal** para validar: chama `getChat`, que confirma que o bot enxerga o canal
**sem enviar mensagem nenhuma**.

### O que pode ser publicado

Uma publicação só acontece quando **todas** estas condições valem:

| Condição | Se falhar |
| -------- | --------- |
| `Channel.type === TELEGRAM`, ativo e com `externalIdentifier` | `422`, sem chamar o Telegram |
| Produto com `AffiliateLink` **ativo** | `422`, sem chamar o Telegram |
| Produto avaliado pelo Opportunity Engine | `422`, sem chamar o Telegram |
| `effectiveStatus === APPROVED` | `422`, sem chamar o Telegram |

**A regra do link de afiliado é absoluta:** sem link ativo não há publicação, mesmo com `Offer`
`APPROVED`. O sistema existe para monetizar via afiliado — o `permalink` do produto **nunca** é
usado como fallback no CTA.

A elegibilidade vem do `effectiveStatus` do PR-03; `distribution` **não** reimplementa as regras
do engine. Ou seja: `engine APPROVED + operador REJECTED` não publica; `engine CANDIDATE +
operador APPROVED` publica.

### A mensagem

Renderer determinístico, sem IA e **sem `parse_mode`** — texto puro:

```text
🔥 OFERTA

Echo Dot 5a geracao

De: R$ 1.000,00
Por: R$ 700,00

📉 30% de desconto
📊 Proximo do menor preco que acompanhamos
⭐ Entre os mais vendidos da categoria

🛒 Ver no Mercado Livre
https://mercadolivre.com/sec/abc
```

**Por que texto puro:** não existe markup para um título vindo do marketplace quebrar, nem risco
de o Telegram recusar a mensagem com *"can't parse entities"*. O Telegram transforma a URL crua
em link automaticamente, então o CTA continua clicável. Trocar por HTML depois é uma mudança
contida no renderer. Ainda assim, o título é sanitizado (quebras de linha e caracteres de
controle viram espaço, e há limite de 180 caracteres) para que a mensagem seja sempre previsível.

Linhas condicionais, nunca inventadas:

- `De:` só aparece quando existe preço anterior oficialmente maior.
- `📉 X% de desconto` só a partir de 5% — abaixo disso não é oferta relevante.
- `📊 Próximo do menor preço` só quando o componente `priceHistory` do engine pontuou ≥ 22.
- `⭐ Entre os mais vendidos` só quando o componente `popularity` pontuou.

Nada de estoque, unidades restantes, urgência falsa ou vendas estimadas.

### Imagem

Com `imageUrl` disponível usamos `sendPhoto` com legenda; sem imagem, `sendMessage`.

Se o `sendPhoto` falhar **por causa exclusivamente da mídia** (`failed to get HTTP URL content`,
`wrong file identifier`, `photo_invalid_dimensions`, …), há **um único** fallback para
`sendMessage`. Qualquer outro erro sobe como está — não mascaramos problema de permissão ou de
canal fingindo que era a imagem.

### Publicar

```bash
# um canal
curl -X POST http://localhost:3333/offers/<offerId>/publish \
  -H 'Content-Type: application/json' -d '{"channelId":"<channelId>"}'

# todos os canais Telegram ativos (uma falha não aborta as demais)
curl -X POST http://localhost:3333/offers/<offerId>/publish-all
```

No admin: em `/opportunities`, oportunidades `APPROVED` mostram **Publicar** (com seletor quando
há mais de um canal). Depois de publicada, a linha passa a exibir *Publicado · canal · data* em
vez do botão.

### Idempotência

A identidade de uma publicação é **`(offerId, channelId)`**, garantida por `UNIQUE` no banco.

A reserva da `Publication` é um `INSERT` protegido por essa constraint — **não** um
`if exists` — então chamadas concorrentes disputam o insert e **apenas uma** chega ao Telegram.
As demais recebem `409`. Há teste que dispara 5 publicações simultâneas e verifica que houve
exatamente 1 chamada externa, e outro que insere direto no banco para provar que a constraint é
quem barra.

```text
PENDING  →  Telegram  →  PUBLISHED (externalMessageId, publishedAt)
                      ↘  FAILED (errorMessage sanitizado)
```

### Retry

Retry automático do client: **no máximo uma** repetição, e só para falhas em que o Telegram
respondeu — `429` (respeitando `retry_after`, com teto em
`TELEGRAM_MAX_RETRY_AFTER_SECONDS`) e `5xx`. Nada de retry infinito.

Reenvio manual de uma `FAILED`:

```bash
curl -X POST http://localhost:3333/publications/<id>/retry
```

Só aceita `FAILED`, e **reaproveita o mesmo registro** — o que mantém a constraint válida e
preserva o histórico da tentativa. Uma publicação já `PUBLISHED` responde `409`: não há como
duplicar por reenvio. No admin, `/publications` mostra **Tentar novamente** apenas nas `FAILED`.

### Duplicidade externa: a limitação honesta

O Telegram não oferece transação distribuída. Existe um cenário que **não** dá para eliminar:

```text
Telegram aceita a mensagem → a conexão cai antes da resposta chegar
→ nosso lado não sabe o que aconteceu
```

Nossa escolha: **preferimos uma publicação possivelmente ausente a um flood duplicado.**

Por isso um **timeout nunca é repetido automaticamente**. Ele é classificado como
`unknown_outcome`, a `Publication` fica `FAILED` com a mensagem *"a mensagem pode ter sido
publicada; confira o canal antes de reenviar"*, e o reenvio é uma decisão consciente do operador.
Erros em que o Telegram respondeu (429, 5xx) são inequívocos — a mensagem não saiu — e só esses
são repetidos.

### Erros conhecidos

| Situação | Resposta | O que fazer |
| -------- | -------: | ----------- |
| Bot não é admin / sem *Post Messages* | `422` | Ajustar permissões no canal |
| `chat not found` | `422` | Conferir o `externalIdentifier` |
| Canal inativo, não-Telegram, ou sem identificador | `422` | Corrigir o cadastro |
| Sem link de afiliado ativo | `422` | Cadastrar o link (dá para fazer inline em `/opportunities`) |
| Oportunidade não `APPROVED` | `422` | Avaliar ou aprovar manualmente |
| Token inválido/revogado | `502` | Revisar `TELEGRAM_BOT_TOKEN` |
| Rate limit | `429` | Aguardar; o client já respeita `retry_after` |
| Timeout (resultado ambíguo) | `502` | **Conferir o canal** antes de reenviar |
| Telegram fora do ar | `503` | Reenviar depois |

O corpo bruto da Bot API nunca é repassado, e **o token não aparece em log, erro ou resposta** —
há teste que verifica isso explicitamente.

## Publicação no Facebook

Segundo destino do mesmo pipeline. Não há Opportunity Engine, scheduler ou política própria —
Facebook é **distribuição, não inteligência**.

### API oficial utilizada

Confirmado na documentação da Meta antes da implementação:

| Endpoint | Uso |
| -------- | --- |
| `POST /{page-id}/feed` | Post de texto com link (`message`, `link`) |
| `POST /{page-id}/photos` | Post com imagem remota (`url`, `caption`) — retorna `id` e `post_id` |
| `GET /{page-id}?fields=id,name` | Valida a Page **sem criar post** |

Versão da Graph API em `META_API_VERSION` (padrão `v21.0`).

**Sem scraping, sem browser automation, sem perfil pessoal, sem endpoints privados.**

### 1. Criar a aplicação Meta

1. Em [developers.facebook.com](https://developers.facebook.com), crie uma app do tipo *Business*.
2. Copie **App ID** e **App Secret** para `META_APP_ID` / `META_APP_SECRET`.
3. Adicione o produto **Facebook Login** (necessário para gerar tokens de Page).

### 2. Permissões

O token precisa destas permissões, todas confirmadas na documentação dos endpoints usados:

| Permissão | Por quê |
| --------- | ------- |
| `pages_manage_posts` | Publicar em `/feed` e `/photos` |
| `pages_read_engagement` | Exigida em conjunto pelos endpoints de publicação |
| `pages_show_list` | Exigida por `/photos` |

Quem gera o token precisa ter a task **CREATE_CONTENT** na Page.

> Fora do modo de desenvolvimento, essas permissões passam por **App Review** da Meta. Enquanto a
> app estiver em desenvolvimento, só administradores/testadores da app conseguem publicar.

### 3. Page Access Token

**É preciso um Page Access Token, não um User Access Token.** No Graph API Explorer: selecione a
app, peça as permissões acima, gere o *User Token*, troque por *Page Token* na lista de Pages, e
coloque o resultado em `META_PAGE_ACCESS_TOKEN`.

```bash
META_APP_ID=seu-app-id
META_APP_SECRET=seu-app-secret
META_PAGE_ACCESS_TOKEN=EAA...     # SECRET: nunca versione
```

> **Renovação é operação manual.** Tokens de Page derivados de um user token de curta duração
> expiram. Para um token de longa duração, troque o user token por um *long-lived token* e derive
> o Page Token dele — Page Tokens derivados de user tokens de longa duração normalmente não
> expiram, mas são revogados se a senha mudar, se a permissão for removida ou se a app perder
> acesso. **Não há renovação automática aqui**: quando o token expira, a publicação falha com
> diagnóstico explícito (ver abaixo) e o operador gera um novo. Não construímos cofre de tokens.

### 4. Cadastrar a Page como Channel

Em `/channels`, crie um canal `FACEBOOK` e coloque o **Page ID** em `externalIdentifier`:

```text
1234567890
```

Use **Testar canal**: chama `GET /{page-id}`, que confirma que o token enxerga a Page **sem
publicar nada**. Nenhum post de teste é enviado silenciosamente.

### O que pode ser publicado

Exatamente as mesmas regras do Telegram — a elegibilidade vem do `effectiveStatus` do PR-03:

| Condição | Se falhar |
| -------- | --------- |
| Canal `FACEBOOK` ativo e com Page ID | `422`, sem chamar a Meta |
| Produto com `AffiliateLink` **ativo** | `422`, sem chamar a Meta |
| `effectiveStatus === APPROVED` | `422`, sem chamar a Meta |

**A regra do link de afiliado continua absoluta.** O `permalink` do produto nunca é usado como
fallback.

### O post

Renderer determinístico **próprio do Facebook** — a superfície não é a mesma do Telegram, então o
texto também não é:

```text
🔥 Oferta encontrada

Echo Dot 5a geracao

De R$ 1.000,00
por R$ 700,00

📉 30% de desconto
📊 Proximo do menor preco que acompanhamos
⭐ Entre os mais vendidos da categoria

Confira no Mercado Livre:
https://mercadolivre.com/sec/abc
```

Mesmas garantias: sem IA, sem urgência falsa, sem "últimas unidades", sem "menor preço da
história". As duas linhas de destaque só aparecem quando os componentes `popularity` e
`priceHistory` do engine realmente pontuaram.

Com `imageUrl` usamos `/photos` (imagem + legenda) e guardamos o `post_id`; sem imagem, `/feed`
(mensagem + link). O fallback para texto acontece **apenas** em falha atribuível à mídia — erro de
permissão, token ou Page sobe como está.

### Publicar

```bash
curl -X POST http://localhost:3333/offers/<offerId>/publish \
  -H 'Content-Type: application/json' -d '{"channelId":"<facebookChannelId>"}'
```

No admin, `/opportunities` lista todos os destinos ativos no seletor de **Publicar**:

```text
Publicar
  ├── TELEGRAM — Ofertas Tech
  └── FACEBOOK — Achados Tech
```

### Autopilot

Cada destino é **opt-in independente**:

| Variável | Padrão |
| -------- | -----: |
| `FACEBOOK_AUTO_PUBLISH_ENABLED` | **`false`** |
| `FACEBOOK_MAX_POSTS_PER_HOUR` | 1 |
| `FACEBOOK_MAX_POSTS_PER_DAY` | 6 |
| `FACEBOOK_MIN_SCORE` | 85 |

Limites menores que os do Telegram: o feed de uma Page tolera menos volume.

**Quotas são por canal e independentes** — publicar no Telegram não consome cota do Facebook, e
vice-versa. Ranking, janela de horário (`APP_TIMEZONE`) e idade máxima da oferta são os mesmos
para todos os destinos: não há calendário por canal.

**A falha de um provider não impede o outro.** Se a Meta recusar, o Telegram publica normalmente
no mesmo ciclo, e vice-versa — há teste para os dois sentidos.

### Erros conhecidos

| Situação (código da Meta) | Resposta | O que fazer |
| ------------------------- | -------: | ----------- |
| Token expirado/revogado (190, subcode 463/467) | `502` | **Gerar novo Page Access Token** |
| Token inválido (190) | `502` | Revisar `META_PAGE_ACCESS_TOKEN` |
| Permissão negada (10, 200–299) | `422` | Conceder `pages_manage_posts` na Page |
| Page inexistente (803) | `422` | Conferir o Page ID |
| Conteúdo/mídia inválidos (100) | `422` | Verificar imagem ou texto |
| Rate limit (4, 17, 32, 613) | `429` | Aguardar |
| Timeout (resultado ambíguo) | `502` | **Conferir a Page** antes de reenviar |
| Graph API fora do ar (5xx) | `503` | Reenviar depois |

Token expirado **não entra em loop de retry**: falha uma vez, com diagnóstico explícito. O payload
bruto da Meta (incluindo `fbtrace_id`) nunca é repassado, e **o token não aparece em log, erro ou
resposta** — ele vai no corpo do POST, nunca no caminho da URL, e há teste verificando isso.

### Duplicidade externa

Mesma política conservadora do Telegram: um **timeout nunca é repetido automaticamente**. Vira
`unknown_outcome`, a `Publication` fica `FAILED` com *"o post pode ter sido publicado; confira a
Page antes de reenviar"*, e o reenvio é decisão do operador. Preferimos um post ausente a um post
duplicado. Não tentamos exactly-once entre nosso banco e a Meta.

### Idempotência e retry

Reutiliza a `Publication` existente e a constraint `UNIQUE (offerId, channelId)` do PR-04 — sem
tabela nova e sem migration. `POST /publications/:id/retry` funciona para qualquer provider,
escolhido pelo `Channel` da própria publicação; só `FAILED` é elegível.

## Distribuição no WhatsApp (semiassistida)

### Verificação da API oficial — resultado

Antes de escrever qualquer código, consultamos a documentação atual da Meta para determinar se
existe API oficial para **publicar em Canais do WhatsApp**.

> **WhatsApp Channels official API: NOT FOUND**
> **Implementation mode: SEMI_ASSISTED**

A WhatsApp Business Platform oferece exatamente três APIs, e **nenhuma delas publica em Canais**:

| API oficial | Para que serve | Serve para Canais? |
| ----------- | -------------- | ------------------ |
| **Cloud API** (`POST /{phone-number-id}/messages`) | Mensagens *business-to-user*: confirmações, lembretes, atendimento | ❌ Não. É 1-para-1 / grupo, não broadcast em canal |
| **Business Management API** | Gerenciar a conta, números e templates | ❌ Não publica conteúdo |
| **Marketing Messages API** | Mensagens promocionais para usuários que optaram por recebê-las | ❌ Continua sendo B2U, não Canal |

**WhatsApp Channels é um recurso do aplicativo**, administrado de dentro do WhatsApp. A
documentação para desenvolvedores não expõe endpoint, permissão ou tipo de token para publicar
nele.

> ⚠️ **Cloud API não é equivalente a uma API de Canais.** Usá-la para simular publicação em canal
> seria enviar mensagem para contatos — outro produto, outro consentimento, outro risco.

Fontes consultadas:
[WhatsApp Business Platform — About the Platform](https://developers.facebook.com/docs/whatsapp/overview/) ·
[WhatsApp Business Platform — Documentation](https://developers.facebook.com/docs/whatsapp/) ·
[WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/) ·
[About WhatsApp Channels — Help Center](https://faq.whatsapp.com/549900560675125)

### O que NÃO fizemos, e por quê

**Nenhuma automação não oficial foi criada.** Sem browser automation, sem Puppeteer/Playwright/
Selenium, sem QR code scraping, sem biblioteca que emula o WhatsApp Web, sem cookies ou chaves de
sessão capturados, sem automação de conta pessoal.

Contornar a ausência de API custaria o bloqueio da conta e violaria os termos da plataforma. O
caminho semiassistido é a resposta correta enquanto a Meta não publicar uma API de Canais.

### Como funciona

```text
Opportunity APPROVED
        ↓
WhatsApp Renderer (determinístico)
        ↓
Preview no admin  ──►  operador copia  ──►  publica no Canal
        ↓
"Marcar como publicado"
        ↓
Publication = PUBLISHED
```

O sistema **prepara e registra**; quem publica é o operador. **Nada sai daqui para a Meta.**

Não criamos status novo nem tabela nova: enquanto a publicação não é confirmada simplesmente não
existe `Publication`. Confirmar cria a linha já como `PUBLISHED`. A máquina de estados continua
exatamente a mesma.

### Cadastrar o canal

Em `/channels`, crie um canal `WHATSAPP`. **Não pedimos credencial nenhuma** — não existe token
para isso. `externalIdentifier` é **opcional** e serve apenas para você identificar o canal.

### Preparar e registrar

```bash
# preview (somente leitura — não cria Publication)
curl "http://localhost:3333/offers/<offerId>/manual-preview?channelId=<channelId>"

# registrar que você publicou no canal
curl -X POST http://localhost:3333/offers/<offerId>/manual-publication \
  -H 'Content-Type: application/json' -d '{"channelId":"<channelId>"}'
```

No admin, em `/opportunities`, uma oportunidade `APPROVED` mostra **Preparar publicação manual
(WhatsApp)** com o texto pronto, **Copiar texto**, **Copiar link**, **Abrir imagem** e **Marcar
como publicado**.

### A mensagem

Renderer próprio, mais curto que os outros — precisa caber na tela de um celular e sobreviver a
um copiar/colar:

```text
🔥 Oferta encontrada

Echo Dot 5a geracao Smart Speaker com Alexa

De R$ 1.000,00
por R$ 700,00

📉 30% de desconto
📊 Proximo do menor preco que acompanhamos
⭐ Entre os mais vendidos da categoria

👉 Confira no Mercado Livre:
https://mercadolivre.com/sec/echo-garimpo
```

O WhatsApp interpreta `*`, `_` e `~` como formatação, então o corpo **não usa nenhum desses
caracteres** e o título é sanitizado. Mesmas garantias dos outros canais: sem urgência falsa, sem
estoque inventado, sem "menor preço da história" — as duas linhas de destaque só aparecem quando
os componentes do Opportunity Engine realmente pontuaram.

### Regras

Exatamente as mesmas dos canais automáticos — o preview reutiliza a validação do
`PublicationDispatcher`, então não há como divergirem:

| Condição | Se falhar |
| -------- | --------- |
| Canal `WHATSAPP` ativo | `422` |
| Produto com `AffiliateLink` **ativo** | `422` |
| `effectiveStatus === APPROVED` (engine + decisão humana) | `422` |

**A regra do link de afiliado continua absoluta**, e o `permalink` nunca é usado como fallback.

**Idempotência**: a mesma constraint `UNIQUE (offerId, channelId)`. Marcar duas vezes responde
`409` — inclusive sob confirmações concorrentes (há teste com 5 simultâneas, uma única linha
gravada). `externalMessageId` fica `NULL`: o WhatsApp não nos devolve um id de post.

Um canal com automação oficial (Telegram, Facebook) **não pode** ser marcado manualmente — isso
mascararia o resultado real da integração.

### Não é autopilot

O WhatsApp **não participa do ciclo automático**. O `AutomationOrchestrator` distribui apenas para
tipos com `ChannelPublisher` registrado (Telegram e Facebook), então canais WhatsApp são
estruturalmente ignorados — não há como uma publicação manual ser simulada pelo autopilot. Por
isso também não existem variáveis `WHATSAPP_AUTO_PUBLISH_*`: não haveria o que ligar.

## Autopilot (ciclo automático)

Executa o pipeline que já existia, em intervalos controlados, sem nenhuma infraestrutura nova.

```text
sync produtos ativos → refresh popularity → evaluate → selecionar APPROVED
       → aplicar política → publicar no Telegram
```

O orquestrador **reutiliza integralmente** os services dos PRs anteriores. Nenhuma regra de
negócio foi reimplementada: elegibilidade vem do `effectiveStatus` do PR-03 e a idempotência da
constraint `(offerId, channelId)` do PR-04.

> ### ⚠️ O autopilot nasce DESLIGADO
>
> `TELEGRAM_AUTO_PUBLISH_ENABLED=false` é o default, **mesmo com o Telegram totalmente
> configurado**. Subir a aplicação nunca publica nada. Com ele desligado o ciclo continua
> sincronizando e avaliando; apenas a publicação fica pausada, e as oportunidades aparecem como
> *adiadas*.

### Premissa: instância única

O scheduler é in-process (`setInterval`), e a trava contra ciclos simultâneos é **um flag em
memória**. Isso é suficiente porque a V1 roda em **uma única instância**.

**Múltiplas réplicas exigiriam coordenação distribuída** (lock compartilhado) — cada réplica teria
sua própria trava e poderia publicar em paralelo. Isso está fora do escopo por decisão; não use
mais de uma instância sem resolver isso antes.

### Jobs e intervalos

| Job | O que faz | Variável | Padrão |
| --- | --------- | -------- | -----: |
| `productRefresh` | `sync` dos ativos + `refresh popularity` | `PRODUCT_REFRESH_INTERVAL_MINUTES` | 60 |
| `evaluation` | avalia os produtos ativos | `OPPORTUNITY_EVALUATION_INTERVAL_MINUTES` | 30 |
| `distribution` | seleciona e publica no Telegram | `TELEGRAM_DISTRIBUTION_INTERVAL_MINUTES` | 15 |

`AUTOMATION_SCHEDULER_ENABLED=false` desliga os três; a execução manual continua funcionando.

**Overlap é impedido:** enquanto um ciclo roda, qualquer outro é ignorado (o job registra e segue;
a chamada manual recebe `409`). A trava é global — um ciclo por vez, qualquer que seja a fase.

### Política de distribuição

Uma oportunidade só é publicada automaticamente se **todas** as condições valerem:

| Regra | Variável | Padrão |
| ----- | -------- | -----: |
| `effectiveStatus === APPROVED` (engine + decisão humana) | — | — |
| `AffiliateLink` **ativo** — sem fallback para permalink | — | — |
| Score mínimo | `TELEGRAM_MIN_SCORE` | 85 |
| Oferta detectada há no máximo | `TELEGRAM_MAX_OFFER_AGE_HOURS` | 24h |
| Publicações no canal na última hora | `TELEGRAM_MAX_POSTS_PER_HOUR` | 2 |
| Publicações no canal nas últimas 24h | `TELEGRAM_MAX_POSTS_PER_DAY` | 12 |
| Dentro da janela de horário | `TELEGRAM_PUBLISH_START_HOUR` / `_END_HOUR` | 7h–22h |

Timezone da janela: `APP_TIMEZONE` (padrão `America/Sao_Paulo`). Start igual a end desliga a
restrição; janelas que cruzam a meia-noite (22h→6h) funcionam.

**Ranking:** `score DESC`, depois oferta mais recente primeiro. As melhores saem primeiro.

**Limites são por canal**, contando apenas publicações bem-sucedidas — uma tentativa que falhou
não consome cota. A mesma oferta pode ir para dois canais diferentes; a constraint continua sendo
`(offer, canal)`.

### Adiado, não falhado

Quando o limite é atingido, a janela está fechada ou o autopilot está desligado, a oportunidade é
contada como **adiada** e continua disponível para o próximo ciclo. Nenhuma `Publication` é
criada e nada vira `FAILED` — *deferred* é um estado do relatório, não do banco.

Uma `Publication` que realmente falhou (`FAILED`) **não** é reprocessada pelo autopilot: o
reenvio é uma decisão do operador em `/publications`. Isso evita insistir sozinho num erro de
configuração.

### Executar e acompanhar

```bash
# roda agora o mesmo pipeline do scheduler
curl -X POST http://localhost:3333/automation/run

# estado atual
curl http://localhost:3333/automation/status
```

O `POST /automation/run` chama exatamente o mesmo orquestrador do scheduler — não há segunda
implementação. Resumo devolvido:

```json
{
  "durationMs": 8123,
  "phases": ["productRefresh", "evaluation", "distribution"],
  "productRefresh": { "synced": 183, "syncFailed": 2, "popularityRanked": 11 },
  "evaluation": { "evaluated": 181, "approved": 9, "evaluationFailed": 0 },
  "distribution": { "eligible": 9, "published": 4, "publishFailed": 1, "deferred": 4 },
  "phaseFailures": []
}
```

No admin: `/automation` mostra ON/OFF, última execução, próxima execução, os contadores e um
botão **Executar agora**. A configuração **não** é editável pelo painel — continua vindo do
ambiente.

`GET /automation/status` mantém estado **em memória**: reiniciar a aplicação zera o painel. O
histórico persistido de publicações fica em `/publications`. Não criamos tabela de execuções
porque logging estruturado + `Publication` já cobrem a necessidade operacional.

### Comportamento em falha

Nada de falha parcial aborta o ciclo:

- produto que falha no sync → contado em `syncFailed`, os outros seguem;
- `refresh popularity` que falha → o sync já feito continua valendo;
- produto que falha na avaliação → contado, os outros seguem;
- publicação que falha → `Publication` fica `FAILED`, as demais continuam;
- **fase inteira** que falha (ex.: Mercado Livre fora do ar) → registrada em `phaseFailures`, e as
  fases seguintes ainda executam.

### Logs do ciclo

Eventos estruturados, sem token e sem URL de afiliado completa:

```text
automation_cycle_started · product_sync_completed · popularity_refresh_completed
evaluation_completed · telegram_distribution_completed · automation_cycle_finished
automation_job_skipped · automation_phase_failed
```

Cada um com `durationMs`, `counts` e `failures`. Sem Prometheus, sem Grafana.

## Admin

| Rota               | Conteúdo                                                        |
| ------------------ | --------------------------------------------------------------- |
| `/dashboard`       | Produtos ativos, links ativos, canais ativos, ofertas abertas, publicações |
| `/products`        | Importar por ID do ML, sincronizar, **avaliar** (individual e lote), atualizar popularidade, listagem, ativar/desativar, cadastro manual |
| `/opportunities`   | Score + breakdown por componente, razões, status do engine vs decisão do operador, aprovar/rejeitar, cadastro de link inline para itens `LINK REQUIRED`, **Publicar** (Telegram/Facebook) e **Preparar publicação manual** (WhatsApp) |
| `/products/discover` | Mais vendidos por categoria, com ação *Importar* por linha    |
| `/products/[id]/prices` | Preço atual, última sincronização e histórico de preços    |
| `/affiliate-links` | Cadastro (produto via select) + listagem + ativar/desativar      |
| `/channels`        | Cadastro + listagem + ativar/desativar + **Testar canal** (Telegram e Facebook); canais WhatsApp aparecem marcados como `manual` |
| `/offers`          | Cadastro + listagem + avanço de status (`DETECTED → CANDIDATE → APPROVED`) |
| `/publications`    | Produto, preço, destino (com marca `manual` no WhatsApp), status, data, ID externo, erro e **Tentar novamente** nas `FAILED` |
| `/affiliate-automation` | Sessão da Central, tag ativa, produtos sem link e **Gerar links que faltam** |
| `/automation`      | Autopilot ON/OFF **por destino**, estado, última e próxima execução, contadores do ciclo, política por provider e **Executar agora** |

UI deliberadamente mínima: sem gráficos, sem animações, sem biblioteca de componentes. O
histórico é uma lista de preço + data, sem chart. Todos os dados vêm da API interna — **não há
mock nem dado fake em nenhuma tela**.

## Testes

```bash
npm test
```

A suíte é de **integração**: sobe a aplicação Nest real (mesmos pipes, filtros e módulos do
servidor HTTP) contra o banco `TEST_DATABASE_URL`, truncando as tabelas entre os casos.
`npm test` aplica as migrations no banco de testes automaticamente (`pretest`), então basta ter
o PostgreSQL no ar.

**A suíte nunca fala com o Mercado Livre real.** Um servidor HTTP local (`test/meli-fake-server.ts`)
responde como a API oficial, então os testes são determinísticos e ainda assim exercitam o código
real de fetch, timeout, retry, autenticação e parsing.

Cobre, do PR-01: uniqueness de produto, CRUD de produto, link vinculado a produto (incluindo
cascade), CRUD de canal (incluindo rejeição de secrets na `configuration`), criação e transição de
status de oferta, integridade de `Publication`, validações, mass assignment, dashboard e health.

Do PR-09: validação do link (HTTPS, host, tag divergente, `origin_url` de outro produto,
`long_url` com rastreio aceito) e — o caso mais perigoso — **recusa de URL de produto sem
rastreio de afiliado**, incluindo a variante com outro host; descoberta de tag; geração e
persistência com `source=MERCADO_LIVRE_AFFILIATE_WEB`; idempotência sem chamar o provider de
novo; rotação sem acumular links ativos; link manual não sobrescrito; produto sem permalink;
`AUTH_REQUIRED` → 409 sem persistir; bot indisponível → 503 **sem fallback para o permalink**;
retry único em falha transitória e nenhum retry em falha de sessão; lote com falha parcial e
interrupção precoce quando a sessão cai; proteção por sessão administrativa; e um teste ponta a
ponta que gera o link, vê a oportunidade sair de `NOT_ELIGIBLE` para `APPROVED` e confirma que a
mensagem publicada carrega **exatamente** o link gerado, nunca o permalink.

Do PR-08: criação de admin, email duplicado, hash argon2id diferente da senha e com salt por
usuário, usuário inativo, login com mensagem genérica idêntica para email inexistente e senha
errada, cookie `HttpOnly`/`SameSite`/`Path` e `Secure` só em produção, rate limiting com
`Retry-After` e janela que expira, token bruto nunca persistido, sessão válida/inválida/expirada,
invalidação ao desativar o usuário, sessões independentes, logout idempotente, TTL, limpeza de
sessões vencidas, `/health` e `/auth/login` públicos, **401 anônimo em todos os endpoints
administrativos** (incluindo automação, publicação e retry), e as mesmas rotas funcionando com
sessão.

No painel: separação entre layout raiz e autenticado, logo na tela de login sem distorção,
ausência de cadastro e recuperação de senha, mensagem genérica, cookie sem `localStorage`, e um
teste que **falha se alguma Server Action exportada não chamar `requireAdmin()`**.

Do PR-07: renderer do WhatsApp (incluindo ausência de caracteres que o app interpreta como
formatação e diferença explícita dos outros dois), preview sem efeito colateral, canal sem
`externalIdentifier`, `AffiliateLink` obrigatório, oportunidade não aprovada, rejeição humana,
canal inativo, recusa de marcar manualmente um canal automatizado, confirmação registrando
`PUBLISHED` com `externalMessageId` nulo, idempotência, 5 confirmações concorrentes com uma única
linha, mesma oferta em canais WhatsApp distintos, e a listagem exibindo `WHATSAPP`.

O workspace do admin tem suíte própria (`apps/admin/test`) verificando o branding: a logo servida
é **byte a byte idêntica** ao asset original, `/assets/logo.png` é referenciada no layout e no
dashboard, a proporção é preservada (sem altura fixa), a metadata é `Garimpo` e o nome antigo não
aparece mais na interface.

Do PR-06: renderer próprio do Facebook (incluindo sanitização do título e diferença explícita
para o formato do Telegram), Page válida, canal inativo, Page ID ausente, `AffiliateLink`
obrigatório, publicação com e sem imagem, fallback `/photos` → `/feed` apenas em falha de mídia,
persistência do `post_id`, cada código de erro da Graph API (190 e subcodes, 10, 200, 803, 4, 5xx),
token expirado com diagnóstico próprio e sem loop, timeout ambíguo sem retry, ausência do token e
do payload bruto em respostas e em `Publication.errorMessage`, idempotência, 5 chamadas
concorrentes com uma única entrega, retry manual pelo provider do canal, quotas independentes
entre Telegram e Facebook, score mínimo por provider, autopilot de cada destino ligado
separadamente, e falha de um provider não impedindo o outro (nos dois sentidos).

Do PR-05: autopilot desligado por padrão, defaults conservadores, janela de horário (inclusive
cruzando a meia-noite e em outra timezone), ciclo manual, scheduler delegando ao mesmo
orquestrador, overlap bloqueado (e job agendado que apenas ignora), ranking por score, limite por
hora, limite por dia, idade máxima da oferta, score mínimo, `AffiliateLink` obrigatório, rejeição
humana respeitada, canal inativo ignorado, limites por canal com a mesma oferta em canais
distintos, idempotência herdada, falha de publicação não abortando as demais, falha de fase
inteira registrada sem derrubar o ciclo, endpoint de status, e um teste ponta a ponta que importa
um item do Mercado Livre, avalia de verdade e publica.

Do PR-04: render determinístico da mensagem, sanitização de título (quebras de linha e markup
chegam literais e inertes), produto com e sem imagem, com e sem `originalPrice`, desconto
irrelevante omitido, `AffiliateLink` obrigatório, oferta não `APPROVED` recusada, rejeição do
operador respeitada, canal inativo e não-Telegram, publicação com sucesso e persistência do
`externalMessageId`, falha do Telegram gerando `FAILED`, retry manual, idempotência
`(offer, canal)` — inclusive provando que a garantia é a constraint e não o pre-check —,
5 chamadas concorrentes resultando em **uma** chamada externa, `429` com `retry_after`, timeout
sem repetição, fallback imagem → texto apenas em falha de mídia, e verificação explícita de que
o token não aparece em log, erro ou resposta.

Do PR-03: pesos somando 100, cada faixa dos cinco componentes, score mínimo e máximo,
determinismo, degradação sem histórico e com um único ponto, produto dentro e fora do ranking,
popularidade obsoleta, vendedor ausente (neutro), tetos de freshness, ausência de `AffiliateLink`
e link inativo, limiares, idempotência de `Offer`, cooldown e sua expiração, mudança de preço
gerando nova oportunidade, override manual nos dois sentidos e sua preservação entre
reavaliações, impossibilidade de contornar a regra do link, avaliação em lote com falha parcial,
filtros de `/opportunities` e breakdown explicável.

Do PR-02: normalização de item e de preço, importação nova, importação idempotente, atualização de
produto existente, snapshot inicial, ausência de snapshot sem mudança de preço, novo snapshot
quando o preço muda, sync individual, sync em lote com falha parcial, preservação do estado
anterior em caso de falha, reaproveitamento de token e de categoria, consulta de histórico,
highlights (incluindo entradas de catálogo) e a tradução de cada erro externo — 404, 401/403,
timeout, rate limit e indisponibilidade.

## Comandos

Todos disponíveis na raiz do monorepo:

| Comando                    | Efeito                                    |
| -------------------------- | ----------------------------------------- |
| `npm install`              | Instala as dependências de todo o monorepo |
| `npm run dev:api`          | API em watch mode                          |
| `npm run dev:admin`        | Admin em watch mode                        |
| `npm test`                 | Suíte de integração da API                 |
| `npm run lint`             | ESLint na API e no admin                   |
| `npm run typecheck`        | `tsc --noEmit` na API e no admin           |
| `npm run build`            | Build de produção da API e do admin        |
| `npm run db:up` / `db:down`| Sobe/derruba apenas o PostgreSQL           |
| `npm run stack:up`         | Sobe a stack completa em Docker            |
| `npm run stack:down`       | Derruba a stack                            |
| `npm run stack:logs`       | Segue os logs da api e do admin            |
| `npm run stack:ps`         | Estado dos serviços                        |
| `npm run admin:create`     | Cria um administrador (prompt interativo)  |
| `npm run affiliate:login`  | Autentica a sessão da Central de Afiliados |
| `npm run dev:bot`          | affiliate-bot em watch mode                |
| `npm run db:migrate`       | Aplica migrations em desenvolvimento       |

## Segurança

O que existe neste PR:

- Validação de entrada em todos os endpoints (`class-validator`).
- `whitelist` + `forbidNonWhitelisted` — campos desconhecidos são **rejeitados**, o que bloqueia
  mass assignment (tentar enviar `id` ou `createdAt` resulta em 400).
- Campos de identidade (`marketplace`, `marketplaceItemId`, `productId`, `type`) não são
  aceitos em `PATCH`.
- Headers de segurança via `helmet`; CORS configurável por env.
- Stack trace nunca é retornada com `APP_ENV=production`.
- `Channel.configuration` rejeita ativamente chaves com cara de credencial (`token`, `secret`,
  `password`, `apiKey`, …) em qualquer profundidade — secrets vivem apenas em env vars.
- **Tokens do Mercado Livre vivem apenas em memória** — nunca no banco, nunca em log, nunca em
  resposta da API. `MercadoLivreConfig` redige os secrets ao ser serializada.
- A resposta bruta do Mercado Livre nunca é repassada ao cliente da API interna.
- **Os tokens (bot do Telegram e Page Access Token da Meta) vivem apenas em environment
  variables** — nunca em `Channel.configuration`, nunca no banco, em log, no frontend ou em
  mensagem de erro. `TelegramConfig` e `FacebookConfig` redigem os secrets ao serem serializadas,
  e há testes confirmando a ausência deles em respostas e em `Publication.errorMessage`.
- **O token do bot do Telegram vive apenas em environment variables** — nunca no banco, em log,
  no frontend ou em mensagem de erro. Ele compõe a URL da Bot API, então essa URL também nunca é
  logada. `TelegramConfig` redige o token ao ser serializada, e há teste que confirma a ausência
  dele em respostas e em `Publication.errorMessage`.
- Logs estruturados sem dados sensíveis.

## Dívidas conhecidas

**Autenticação existe desde o PR-08.** Painel e API exigem sessão; apenas `/health` e as rotas de
login/logout são públicas. Ver *Autenticação administrativa*.
Autenticação de admin precisa entrar em um PR próprio **antes** de o sistema sair da máquina
local. Não foi construído um IAM neste PR de propósito, para não antecipar complexidade.

Outras dívidas deliberadas:

- **A geração de link depende de um adapter não oficial.** Endpoint interno pode mudar sem aviso;
  a sessão expira e exige reautenticação humana. Fail-closed contém o estrago (deixa de publicar
  em vez de publicar link ruim), mas é a parte mais frágil do sistema. Ver *Riscos*.
- O contexto do browser vive num volume/perfil local. Múltiplas instâncias do bot competiriam
  pelo mesmo perfil — mesma limitação de instância única já documentada.
- A atribuição real do clique (comissão) não é verificada pelo Garimpo: a Central consolida com
  atraso. **ATTRIBUTION PENDING** — validar depois do primeiro clique real.

- **WhatsApp depende de ação humana.** Enquanto a Meta não publicar uma API de Canais, a
  publicação não pode ser automatizada — e não vamos contornar isso por fora. Se a API surgir,
  basta implementar `ChannelPublisher` e o resto do pipeline já funciona.
- A logo é servida como PNG de 642 KB. Suficiente para um painel interno; se um dia importar,
  gerar versões otimizadas é trivial — mas exigiria processar o asset, o que este PR não faz.

- **O Page Access Token da Meta não é renovado automaticamente.** Quando expira, a publicação
  falha com diagnóstico explícito e o operador gera um novo token manualmente. Construir um
  cofre/rotacionador de tokens ficou fora de escopo (ver *Publicação no Facebook → Page Access
  Token*).
- As permissões da Meta passam por App Review fora do modo de desenvolvimento; até lá só
  administradores e testadores da app conseguem publicar.

- **Instância única.** A trava contra ciclos simultâneos é um flag em memória. Rodar réplicas
  exigiria lock distribuído — cada uma teria a própria trava e poderiam publicar em paralelo.
- O estado do autopilot (`lastRunAt`, `lastResult`) vive em memória e some ao reiniciar. Não há
  tabela `JobExecution`: logging estruturado + `Publication` cobrem a necessidade operacional.
- A trava é global (um ciclo por vez, qualquer fase). Um sync longo pode fazer a distribuição ser
  pulada em alguns ciclos — registrado em log, e o próximo ciclo recupera.
- `Publication` `FAILED` não é reprocessada automaticamente; o reenvio é decisão do operador.
- `nextRunAt` é estimado a partir da última execução do job, não do agendamento interno.

- **Duplicidade externa não é eliminável.** Se a conexão cair depois de o Telegram aceitar a
  mensagem, não temos como saber o resultado. Optamos por não repetir timeouts, o que troca o
  risco de flood pelo risco de uma publicação ausente que o operador precisa conferir. Está
  documentado na seção *Duplicidade externa*.
- Publicar é sempre uma ação explícita: não há scheduler nem publicação em lote de todas as
  oportunidades aprovadas (PR-06).
- `publish-all` percorre os canais sequencialmente dentro da request. Com poucos canais é o
  suficiente; muitos canais pediriam trabalho fora do ciclo HTTP.
- Uma `Publication` `PUBLISHED` não pode ser desfeita pelo sistema — apagar a mensagem no canal é
  manual. Não há `deleteMessage`.

- `OpportunityEvaluation` guarda só a avaliação corrente. Não há histórico de score ao longo do
  tempo — decisão consciente (ver *Persistência da avaliação*); se um dia for preciso auditar a
  evolução do score, vira uma tabela append-only.
- Atingir `APPROVED` na prática depende de `refresh-popularity` ter rodado: sem popularidade o
  teto é 80 (e 75 se o vendedor também estiver no fallback neutro). Está documentado, mas é uma
  armadilha operacional até existir scheduler (PR futuro).
- Cada mudança de preço gera uma `Offer` nova. Repetições são impedidas, mas um produto muito
  volátil acumula linhas. Nenhuma rotina expira `Offer` antiga ainda.
- A avaliação em lote é sequencial e síncrona na request. É só trabalho de banco, sem chamada
  externa, mas com milhares de produtos precisaria sair do ciclo HTTP.
- O enriquecimento de vendedor acontece na sincronização: uma chamada por vendedor distinto por
  lote. Com muitos vendedores distintos, o custo do sync cresce proporcionalmente.

- O access token do Mercado Livre é mantido só em memória. Isso é simples e seguro, mas cada
  reinício da API custa uma renovação, e várias instâncias não compartilham token. Aceitável em
  instância única; revisitar se a aplicação for horizontalizada.
- Se `MELI_REFRESH_TOKEN` for usado, ele é lido de env e não é rotacionado automaticamente. O
  fluxo `authorization_code` é manual e documentado. Persistir tokens rotativos exigiria um
  cofre criptografado — fora do escopo enquanto `client_credentials` for suficiente.
- Uma única retentativa em falha transitória, sem backoff exponencial. Suficiente para o volume
  atual (centenas de produtos), não para milhares.
- O sync em lote é síncrono na request HTTP: com muitos produtos ativos, a chamada demora. Não há
  worker nem scheduler por decisão de escopo.

- Paginação por `take`/`skip` (offset). Suficiente para o volume atual; se as tabelas crescerem,
  migrar para cursor.
- `GET /products?search=` usa `ILIKE` sem índice de texto — adequado ao volume de hoje.
- Não há `DELETE`: registros são desativados (`active=false`). Nenhum caso de uso pediu exclusão.
- Publicações não têm endpoint de escrita — chega junto com os workers de distribuição.

## Fora do escopo do PR-09

Nada disto foi implementado, e a ausência é intencional:

Shopee · Amazon · AliExpress · novas redes sociais · extensão de navegador · IA/LLM ·
scraping de preços · geração de vídeos · **bypass de MFA** · **bypass de captcha** ·
distributed queue · **Redis** · **Kafka** · **múltiplas instâncias** · cadastro público ·
recuperação de senha · RBAC · multi-tenant · SSO.

E, do PR-07, segue valendo: **nenhuma automação não oficial do WhatsApp**.

**Nenhuma integração foi alterada** neste PR — Mercado Livre, Telegram, Facebook, WhatsApp,
Opportunity Engine e AutomationOrchestrator seguem idênticos, exceto por passarem a exigir sessão
nos endpoints HTTP. O `AutomationScheduler` continua chamando o orquestrador **diretamente**: ele
é execução interna e não cria sessão nem passa por HTTP — autenticação protege fronteiras
externas, não chamadas internas.

`AffiliateLink` continua **manual por decisão de produto**: descoberta de produto e link de
afiliado seguem propositalmente separados.

O objetivo deste PR é provar que o Garimpo descobre um produto real, gera sozinho o link de
afiliado e publica esse link — sem intervenção humana por produto:

```text
Mercado Livre API (oficial)
      ↓
Product ──► affiliate-bot (NÃO oficial) ──► AffiliateLink
      ↓                                          │
Opportunity Engine ◄───────────────────────────┘
      ↓                    sem link → NOT_ELIGIBLE → não publica
Telegram / Facebook / WhatsApp
```
