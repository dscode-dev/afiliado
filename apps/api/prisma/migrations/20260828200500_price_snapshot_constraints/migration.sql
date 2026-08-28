-- Mesma estrategia do PR-01: integridade monetaria garantida no banco.
-- Escrita a mao porque o Prisma nao gera CHECK.

ALTER TABLE "price_snapshots"
  ADD CONSTRAINT "price_snapshots_price_non_negative" CHECK ("price" >= 0),
  ADD CONSTRAINT "price_snapshots_original_price_non_negative" CHECK ("originalPrice" IS NULL OR "originalPrice" >= 0);
