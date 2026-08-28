-- AlterTable
ALTER TABLE "products" ADD COLUMN     "categoryId" VARCHAR(32),
ADD COLUMN     "currencyId" VARCHAR(8),
ADD COLUMN     "lastSyncedAt" TIMESTAMPTZ(3),
ADD COLUMN     "marketplaceStatus" VARCHAR(32),
ADD COLUMN     "permalink" VARCHAR(2048),
ADD COLUMN     "sellerId" VARCHAR(32);

-- CreateTable
CREATE TABLE "price_snapshots" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "originalPrice" DECIMAL(12,2),
    "currencyId" VARCHAR(8),
    "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_snapshots_productId_capturedAt_idx" ON "price_snapshots"("productId", "capturedAt" DESC);

-- CreateIndex
CREATE INDEX "products_active_lastSyncedAt_idx" ON "products"("active", "lastSyncedAt");

-- AddForeignKey
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
