-- CreateEnum
CREATE TYPE "Marketplace" AS ENUM ('MERCADO_LIVRE');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('TELEGRAM', 'FACEBOOK', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DETECTED', 'CANDIDATE', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "marketplaceItemId" VARCHAR(64) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "category" VARCHAR(120),
    "imageUrl" VARCHAR(2048),
    "currentPrice" DECIMAL(12,2) NOT NULL,
    "originalPrice" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_links" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "label" VARCHAR(120),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliate_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" UUID NOT NULL,
    "type" "ChannelType" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "externalIdentifier" VARCHAR(255),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "originalPrice" DECIMAL(12,2),
    "discountPercentage" DECIMAL(5,2),
    "status" "OfferStatus" NOT NULL DEFAULT 'DETECTED',
    "detectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publications" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'PENDING',
    "externalMessageId" VARCHAR(255),
    "scheduledAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "errorMessage" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_active_createdAt_idx" ON "products"("active", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "products_marketplace_marketplaceItemId_key" ON "products"("marketplace", "marketplaceItemId");

-- CreateIndex
CREATE INDEX "affiliate_links_productId_active_idx" ON "affiliate_links"("productId", "active");

-- CreateIndex
CREATE INDEX "channels_active_idx" ON "channels"("active");

-- CreateIndex
CREATE UNIQUE INDEX "channels_type_name_key" ON "channels"("type", "name");

-- CreateIndex
CREATE INDEX "offers_status_detectedAt_idx" ON "offers"("status", "detectedAt" DESC);

-- CreateIndex
CREATE INDEX "offers_productId_idx" ON "offers"("productId");

-- CreateIndex
CREATE INDEX "publications_status_createdAt_idx" ON "publications"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "publications_offerId_idx" ON "publications"("offerId");

-- CreateIndex
CREATE INDEX "publications_channelId_idx" ON "publications"("channelId");

-- AddForeignKey
ALTER TABLE "affiliate_links" ADD CONSTRAINT "affiliate_links_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
