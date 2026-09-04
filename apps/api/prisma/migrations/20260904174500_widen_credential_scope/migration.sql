-- O `scope` chega pronto do marketplace: quem decide o tamanho e o provedor,
-- nao nos. O Mercado Livre passou de 255 caracteres na resposta do token e a
-- autorizacao inteira falhava no upsert, DEPOIS de o `code` ja ter sido
-- trocado -- ou seja, com o code queimado e nada persistido.
ALTER TABLE "marketplace_credentials" ALTER COLUMN "scope" SET DATA TYPE TEXT;
