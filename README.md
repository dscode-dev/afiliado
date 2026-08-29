# Garimpo

> Inteligência e distribuição automatizada de boas oportunidades de compra.

Sistema interno que garimpa ofertas do Mercado Livre e as distribui em canais públicos.

O produto monitora produtos e ofertas, registra links de afiliado, avalia oportunidades e
distribui as melhores em canais públicos (Telegram, Facebook, WhatsApp). O cliente final é
sempre levado **diretamente ao Mercado Livre** — não existe checkout, pagamento, estoque,
logística nem atendimento transacional próprio.

> **Estado atual: PR-07 — WhatsApp Distribution + Garimpo Branding.**
> Fecha a distribuição da V1: Telegram e Facebook publicam automaticamente, WhatsApp é
> semiassistido (a Meta não oferece API oficial para Canais). O painel passa a ser o **Garimpo**.

## Visão do fluxo

```text
Mercado Livre           [PR-02 — integrado]
      ↓
Product / PriceSnapshot [PR-02 — dados reais]
      ↓
Opportunity Engine      [PR-03 — score determinístico]
      ↓
Affiliate Link          [manual, por decisão — obrigatório para elegibilidade]
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
│   │   │       ├── automation/    # orquestrador, scheduler, política
│   │   │       └── analytics/     # contadores do dashboard
│   │   └── test/                # testes de integração
│   └── admin/                   # Next.js (painel Garimpo)
│       ├── Dockerfile           # build -> standalone
│       ├── public/assets/       # logo servida em /assets/logo.png
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

> **Todas as portas são publicadas apenas em `127.0.0.1`.** Não existe autenticação ainda — a
> stack não pode ficar acessível na rede. Ver *Dívidas conhecidas*.

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

## API

Base: `http://localhost:3333`. Todas as listagens aceitam `?take=` (máx. 100) e `?skip=`, e
respondem `{ data, total, take, skip }`.

| Método  | Rota                   | Descrição                                            |
| ------- | ---------------------- | ---------------------------------------------------- |
| `GET`   | `/health`              | Aplicação + PostgreSQL (503 se o banco cair)         |
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

**Não existe autenticação.** A API e o painel estão completamente abertos. Isso é aceitável
enquanto tudo roda em `localhost`, mas **é bloqueante para qualquer exposição em rede**.
Autenticação de admin precisa entrar em um PR próprio **antes** de o sistema sair da máquina
local. Não foi construído um IAM neste PR de propósito, para não antecipar complexidade.

Outras dívidas deliberadas:

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

## Fora do escopo do PR-07

Nada disto foi implementado, e a ausência é intencional:

Instagram · Threads · X · TikTok · site público · extensão de navegador · IA/LLM · geração
variável de copy · geração de vídeos · machine learning · click tracking · commission tracking ·
analytics novos · novos marketplaces · **Redis** · **fila** · message broker · Kubernetes ·
**múltiplas instâncias** · redesign completo · autenticação complexa.

E, explicitamente: **nenhuma automação não oficial do WhatsApp** — sem browser automation,
Puppeteer, Playwright, Selenium, QR code scraping, bibliotecas que emulam o WhatsApp Web, cookies
de sessão capturados ou automação de conta pessoal.

O **Opportunity Engine não foi alterado** neste PR — pesos, thresholds, componentes de score e
override do operador permanecem exatamente como no PR-03. Este PR é distribuição e identidade
visual, não inteligência.

`AffiliateLink` continua **manual por decisão de produto**: descoberta de produto e link de
afiliado seguem propositalmente separados.

O objetivo deste PR é fechar a distribuição da V1 pelo caminho oficial possível em cada
plataforma:

```text
Opportunity APPROVED
        ↓
  ┌─────────────── automático ───────────────┐   ┌── semiassistido ──┐
  │  Telegram [PR-04]    Facebook [PR-06]    │   │  WhatsApp [PR-07] │
  │  ChannelPublisher → API oficial          │   │  preview → operador│
  └──────────────────────────────────────────┘   └───────────────────┘
                        ↓
        Publication (idempotente por offer + canal)
```
