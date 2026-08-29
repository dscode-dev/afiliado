-- PR-03: Opportunity Engine.
--
-- O nome desta pasta define a ORDEM de aplicacao. Ela precisa vir depois das
-- migrations do PR-01/PR-02 (que criam `products`, `affiliate_links` e
-- `offers`) e antes da do PR-04.
--
-- `offers(productId, price)` UNIQUE define a identidade de uma oportunidade e
-- garante no banco a idempotencia da geracao automatica de ofertas.
-- `opportunity_evaluations` guarda uma linha por produto (estado atual da
-- avaliacao), nao um historico.

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('IGNORE', 'CANDIDATE', 'APPROVED', 'NOT_ELIGIBLE');

-- CreateEnum
CREATE TYPE "OperatorDecision" AS ENUM ('APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "affiliate_links" ADD COLUMN     "channelTag" VARCHAR(120),
ADD COLUMN     "sourceLabel" VARCHAR(120);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "highlightCheckedAt" TIMESTAMPTZ(3),
ADD COLUMN     "highlightPosition" INTEGER,
ADD COLUMN     "sellerReputationLevel" VARCHAR(32),
ADD COLUMN     "sellerStatus" VARCHAR(32);

-- CreateTable
CREATE TABLE "opportunity_evaluations" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "status" "OpportunityStatus" NOT NULL,
    "breakdown" JSONB NOT NULL,
    "reasons" TEXT[],
    "evaluatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operatorDecision" "OperatorDecision",
    "operatorDecidedAt" TIMESTAMPTZ(3),
    "operatorNote" VARCHAR(300),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "opportunity_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_evaluations_productId_key" ON "opportunity_evaluations"("productId");

-- CreateIndex
CREATE INDEX "opportunity_evaluations_status_score_idx" ON "opportunity_evaluations"("status", "score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "offers_productId_price_key" ON "offers"("productId", "price");

-- AddForeignKey
ALTER TABLE "opportunity_evaluations" ADD CONSTRAINT "opportunity_evaluations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

