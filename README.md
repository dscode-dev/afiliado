# Afiliado

Sistema interno de automação de ofertas afiliadas do Mercado Livre.

O produto monitora produtos e ofertas, registra links de afiliado, avalia oportunidades e
distribui as melhores em canais públicos (Telegram, Facebook, WhatsApp). O cliente final é
sempre levado **diretamente ao Mercado Livre** — não existe checkout, pagamento, estoque,
logística nem atendimento transacional próprio.

> **Estado atual: PR-02 — Integração Mercado Livre + Catálogo Real + Histórico de Preços.**
> Produtos e preços agora vêm da API oficial do Mercado Livre, e cada mudança de preço vira um
> ponto de histórico. **Opportunity Engine, publicação e canais externos continuam fora.**

## Visão do fluxo

```text
Mercado Livre           [PR-02 — integrado]
      ↓
Product / PriceSnapshot [PR-02 — dados reais]
      ↓
Opportunity Engine      [PR futuro]
      ↓
Affiliate Link          [manual, por decisão]
      ↓
Distribution            [PR futuro]
      ↓
Telegram / Facebook / WhatsApp
```

Hoje o catálogo é alimentado pela API oficial do Mercado Livre e mantém histórico de preços.
`Offer`, `AffiliateLink`, `Channel` e `Publication` continuam sendo administrados manualmente —
as caixas marcadas como *PR futuro* ainda não têm código.

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
├── docker-compose.yml           # apenas PostgreSQL
├── docker/postgres/init/        # cria o banco de testes no primeiro boot
├── .env.example                 # todas as variáveis, documentadas
├── apps/
│   ├── api/                     # NestJS
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
│   │   │       ├── opportunity/   # Offer
│   │   │       ├── distribution/  # Channel + Publication
│   │   │       └── analytics/     # contadores do dashboard
│   │   └── test/                # testes de integração
│   └── admin/                   # Next.js
│       ├── app/                 # uma pasta por tela (page.tsx + actions.ts)
│       ├── components/          # formulário genérico, ações de linha, helpers de UI
│       └── lib/                 # cliente HTTP da API interna e tipos
```

### Módulos atuais

| Módulo         | Conteúdo                          | Status                        |
| -------------- | --------------------------------- | ----------------------------- |
| `catalog`      | `Product`, `PriceSnapshot`        | import/sync reais + histórico |
| `affiliate`    | `AffiliateLink`                   | implementado (cadastro manual)|
| `opportunity`  | `Offer`                           | implementado (cadastro manual)|
| `distribution` | `Channel`, `Publication`          | canais em CRUD; publicações somente leitura |
| `analytics`    | contadores do dashboard           | mínimo, só o que o painel usa |
| `marketplace`  | integração oficial Mercado Livre  | implementado (client, auth, highlights) |
| `content`      | geração de mensagem/copy          | **não existe** — PR futuro    |

`content` continua sem existir como pasta: módulos nascem junto com o código que os justificam.

## Como subir localmente

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

`APP_ENV`, `API_PORT` e `DATABASE_URL` são validados no boot: a aplicação falha rápido e com
mensagem clara se algo estiver ausente ou inválido. `MELI_CLIENT_ID` e `MELI_CLIENT_SECRET`
precisam ser definidos **juntos** — configurar pela metade é erro de configuração e falha no boot.

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

Migrations em `apps/api/prisma/migrations/`:

1. `init_foundation` — tabelas, enums, foreign keys, índices e uniqueness.
2. `money_integrity_constraints` — `CHECK` de valores monetários, escrita à mão (o Prisma não
   gera `CHECK`).
3. `marketplace_sync_and_price_history` — campos de sincronização em `products`
   (`permalink`, `sellerId`, `categoryId`, `currencyId`, `marketplaceStatus`, `lastSyncedAt`)
   e a tabela `price_snapshots`.
4. `price_snapshot_constraints` — `CHECK` de preços não negativos no histórico.

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

## Admin

| Rota               | Conteúdo                                                        |
| ------------------ | --------------------------------------------------------------- |
| `/dashboard`       | Produtos ativos, links ativos, canais ativos, ofertas abertas, publicações |
| `/products`        | Importar por ID do ML, sincronizar (individual e lote), listagem, ativar/desativar, cadastro manual |
| `/products/discover` | Mais vendidos por categoria, com ação *Importar* por linha    |
| `/products/[id]/prices` | Preço atual, última sincronização e histórico de preços    |
| `/affiliate-links` | Cadastro (produto via select) + listagem + ativar/desativar      |
| `/channels`        | Cadastro + listagem + ativar/desativar                           |
| `/offers`          | Cadastro + listagem + avanço de status (`DETECTED → CANDIDATE → APPROVED`) |
| `/publications`    | Listagem somente leitura                                         |

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
| `npm run db:up` / `db:down`| Sobe/derruba o PostgreSQL                  |
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
- Logs estruturados sem dados sensíveis.

## Dívidas conhecidas

**Não existe autenticação.** A API e o painel estão completamente abertos. Isso é aceitável
enquanto tudo roda em `localhost`, mas **é bloqueante para qualquer exposição em rede**.
Autenticação de admin precisa entrar em um PR próprio **antes** de o sistema sair da máquina
local. Não foi construído um IAM neste PR de propósito, para não antecipar complexidade.

Outras dívidas deliberadas:

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

## Fora do escopo do PR-02

Nada disto foi implementado, e a ausência é intencional:

scraping · automação de browser · geração automática de affiliate links · criação automática de
`Offer` · Opportunity Score · bot do Telegram · Meta APIs · WhatsApp APIs · scheduler ou cron ·
workers de publicação · IA/LLM · click tracking · commission tracking · analytics avançado ·
extensão de navegador · site público · checkout · usuários finais · pagamentos · estoque ·
notificações · outros marketplaces · Redis · message broker · microservices.

`AffiliateLink` continua **manual por decisão de produto**: descoberta de produto e link de
afiliado seguem propositalmente separados.

O objetivo deste PR é ter produtos e preços reais do Mercado Livre, mais a pequena base histórica
que o PR-03 usará no Opportunity Engine:

```text
Product + Price History + Popularity + AffiliateLink
        ↓
Opportunity Engine   [PR-03]
```
