-- Integridade de valores monetarios garantida no banco, e nao apenas na
-- camada de validacao da API. Escrita a mao: o Prisma nao gera CHECK.

ALTER TABLE "products"
  ADD CONSTRAINT "products_current_price_non_negative" CHECK ("currentPrice" >= 0),
  ADD CONSTRAINT "products_original_price_non_negative" CHECK ("originalPrice" IS NULL OR "originalPrice" >= 0);

ALTER TABLE "offers"
  ADD CONSTRAINT "offers_price_non_negative" CHECK ("price" >= 0),
  ADD CONSTRAINT "offers_original_price_non_negative" CHECK ("originalPrice" IS NULL OR "originalPrice" >= 0),
  ADD CONSTRAINT "offers_discount_percentage_range" CHECK ("discountPercentage" IS NULL OR ("discountPercentage" >= 0 AND "discountPercentage" <= 100));
