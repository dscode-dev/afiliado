-- PR-04: idempotencia da publicacao.
--
-- Uma Offer e publicada no maximo uma vez por Channel. A constraint no banco e
-- o que impede duplicidade sob chamadas concorrentes: a reserva da Publication
-- passa a ser um INSERT que so um chamador consegue vencer.

CREATE UNIQUE INDEX "publications_offerId_channelId_key" ON "publications"("offerId", "channelId");
