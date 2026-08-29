-- PR-09: geracao automatica de affiliate link + OAuth do Mercado Livre.
--
-- `marketplace_credentials` guarda o refresh token CIFRADO (AES-256-GCM):
-- o Mercado Livre exige Authorization Code para itens/precos/highlights, e o
-- refresh token e rotativo, entao precisa sobreviver a reinicios.

-- CreateEnum
CREATE TYPE "AffiliateLinkSource" AS ENUM ('MANUAL', 'MERCADO_LIVRE_AFFILIATE_WEB');

-- AlterTable
ALTER TABLE "affiliate_links" ADD COLUMN     "generatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "originUrl" VARCHAR(2048),
ADD COLUMN     "source" "AffiliateLinkSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "tag" VARCHAR(120),
ADD COLUMN     "verifiedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "marketplace_credentials" (
    "id" UUID NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "externalUserId" VARCHAR(64),
    "scope" VARCHAR(255),
    "authorizedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "marketplace_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_credentials_marketplace_key" ON "marketplace_credentials"("marketplace");

-- CreateIndex
CREATE INDEX "affiliate_links_source_active_idx" ON "affiliate_links"("source", "active");

