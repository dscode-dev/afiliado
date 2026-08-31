# Manual do Operador — Garimpo

Este guia explica como usar o Garimpo pelo painel, passo a passo.
Não é preciso saber programar. Se em algum momento algo não funcionar como
descrito aqui, procure a seção **[Quando algo dá errado](#quando-algo-dá-errado)**.

---

## O que o Garimpo faz

O Garimpo procura boas ofertas no Mercado Livre e as divulga nos seus canais.

Em quatro passos:

1. **Acompanha produtos** — busca preço, categoria e vendedor no Mercado Livre.
2. **Cria o link de afiliado sozinho** — é o link que faz você ganhar comissão.
3. **Dá uma nota de 0 a 100** para cada oferta, dizendo se vale a pena divulgar.
4. **Publica** as melhores no Telegram, no Facebook e prepara o texto do WhatsApp.

> **A regra mais importante:** o Garimpo **nunca** publica um produto sem link de
> afiliado. Divulgar sem link seria trabalho de graça — então ele prefere não publicar.

---

## Entrando no painel

1. Abra o endereço do Garimpo no navegador.
2. Digite seu **e-mail** e sua **senha**.
3. Clique em **Entrar**.

Se errar a senha, a mensagem será sempre "Credenciais inválidas" — ela não diz se o
erro foi no e-mail ou na senha, de propósito, por segurança.

Depois de **5 tentativas erradas**, o sistema espera 15 minutos antes de deixar tentar de
novo. Sua conta **não** fica bloqueada; é só esperar.

Para sair, use o botão **Sair**, no canto de baixo do menu lateral. Sua sessão também
expira sozinha depois de 12 horas.

> Não existe "criar conta" nem "esqueci minha senha". Contas são criadas por quem
> administra o servidor.

---

## As telas do painel

O menu da esquerda tem estas opções:

| Tela | Para que serve |
| ---- | -------------- |
| **Dashboard** | Resumo: quantos produtos, links, canais e ofertas você tem |
| **Produtos** | Adicionar e acompanhar produtos do Mercado Livre |
| **Mais vendidos** | Descobrir produtos que já vendem bem |
| **Oportunidades** | Ver a nota de cada oferta e decidir o que publicar |
| **Links de afiliado** | Ver os links (quase sempre criados sozinhos) |
| **Automação de afiliados** | Ver se o Garimpo consegue criar links agora |
| **Canais** | Cadastrar seu canal do Telegram, página do Facebook, etc. |
| **Ofertas** | Lista das oportunidades que viraram oferta |
| **Publicações** | O que já foi publicado e onde |
| **Automação** | Ligar/desligar o piloto automático e ver o último ciclo |

---

## Primeira configuração

Faça isto **uma vez**, na ordem.

### 1. Cadastre onde você quer publicar

Vá em **Canais** → preencha o formulário → **Cadastrar canal**.

**Telegram**
- Tipo: `TELEGRAM`
- Nome: o que você quiser (ex.: `Garimpo — Telegram`)
- Identificador externo: o nome do canal com `@` (ex.: `@garimpoofertas_promo`)

**Facebook**
- Tipo: `FACEBOOK`
- Identificador externo: o **ID da página**

**WhatsApp**
- Tipo: `WHATSAPP`
- Identificador externo: pode deixar **vazio** — serve só para você identificar

Depois de cadastrar, clique em **Testar canal** (Telegram e Facebook). Ele confirma que o
Garimpo consegue enxergar o canal, **sem publicar nada**. Se aparecer erro, veja
[Quando algo dá errado](#quando-algo-dá-errado).

### 2. Deixe o Garimpo criar links de afiliado

Vá em **Automação de afiliados** e olhe o quadro **Sessão da Central**:

- 🟢 **Sessão ativa** → está tudo certo, pode seguir.
- 🟡 **Autenticação necessária** → alguém precisa entrar na sua conta do Mercado Livre
  uma vez. Isso é feito no servidor, com o comando que aparece na própria tela. Peça a
  quem cuida da instalação.

> Essa autenticação é feita **uma vez** e vale para milhares de links. Você **nunca**
> precisa criar link produto por produto.

---

## O dia a dia

### Passo 1 — Adicionar produtos

Você tem dois caminhos.

**Caminho A: descobrir o que já vende bem** (recomendado)

1. Vá em **Mais vendidos**.
2. Escolha uma categoria (há atalhos prontos: Celulares, Eletrônicos, Informática…).
3. Clique em **Consultar**.
4. Aparece a lista dos mais vendidos. Nos que te interessarem, clique em **Importar**.

**Caminho B: você já sabe qual produto quer**

1. Vá em **Produtos**.
2. No campo **Mercado Livre Item ID**, cole o código do produto (começa com `MLB`,
   ex.: `MLB1234567890`).
3. Clique em **Importar**.

> **Onde acho esse código?** Abra o produto no Mercado Livre e olhe o endereço no
> navegador: o `MLB` seguido de números é o código.

Importar o mesmo produto duas vezes não cria duplicado — apenas atualiza.

### Passo 2 — Deixar o Garimpo trabalhar

Em **Produtos**, use os botões, nesta ordem:

1. **Sincronizar ativos** — busca o preço mais recente de todos os produtos.
2. **Atualizar popularidade** — vê quais estão entre os mais vendidos.
3. **Avaliar ativos** — dá a nota de 0 a 100 para cada um.

Em **Automação de afiliados**, clique em **Gerar links que faltam**.

> Não quer clicar em nada disso? Veja [Piloto automático](#piloto-automático). Ele faz
> tudo sozinho, de tempos em tempos.

### Passo 3 — Escolher o que publicar

Vá em **Oportunidades**. Cada linha mostra:

- **A nota** (0 a 100) — quanto maior, melhor a oferta.
- **O status:**
  - `APPROVED` — boa oferta, pronta para publicar
  - `CANDIDATE` — razoável; você decide
  - `IGNORE` — não vale a pena agora
  - `NOT_ELIGIBLE` — **falta o link de afiliado**
- **`LINK REQUIRED`** em vermelho quando falta o link.

Clique na linha para abrir e ver **por que** aquela nota:

```
Desconto        31/35
Histórico       24/25
Popularidade    18/20
Vendedor         9/10
Freshness        9/10
──────────────────────
Total           91/100
```

E, em texto: "Menor preço dos últimos 30 dias", "Top 1 dos mais vendidos"…

Você pode:
- **Aprovar manualmente** — publica mesmo que a nota seja média.
- **Rejeitar** — nunca publica, mesmo com nota alta.
- **Voltar ao engine** — desfaz sua decisão.

> Sua decisão sempre vence a do sistema — **menos** a regra do link de afiliado. Sem
> link, não publica de jeito nenhum.

### Passo 4 — Publicar

Ainda em **Oportunidades**, numa oportunidade `APPROVED`:

**Telegram e Facebook** — clique em **Publicar** e escolha o canal. Pronto.

**WhatsApp** — aparece a caixa **Preparar publicação manual**:
1. Clique em **Copiar texto**.
2. Abra o WhatsApp e cole no seu canal.
3. Volte e clique em **Marcar como publicado**.

> **Por que o WhatsApp é diferente?** Porque o WhatsApp não oferece uma forma oficial de
> publicar em canais automaticamente. O Garimpo prepara tudo; você só cola.

Depois de publicada, a linha mostra **Publicado**, o canal e a data — e o botão some,
para você não publicar duas vezes sem querer.

---

## Piloto automático

Em **Automação**, o Garimpo faz sozinho, de tempos em tempos:

```
sincroniza → atualiza popularidade → cria links → avalia → publica
```

A tela mostra:
- **Autopilot telegram / facebook**: `ON` ou `OFF`
- **Última execução** e o que aconteceu
- **Política**: nota mínima, quantas publicações por hora e por dia

O botão **Executar agora** roda o ciclo na hora, sem esperar.

> ⚠️ O piloto automático vem **desligado** de propósito, para não publicar nada sem você
> querer. Ligar é feito na configuração do servidor, não pelo painel.

Limites que existem para proteger seus canais:

| Regra | Padrão |
| ----- | ------ |
| Nota mínima para publicar sozinho | 85 |
| Máximo no Telegram | 2 por hora, 12 por dia |
| Máximo no Facebook | 1 por hora, 6 por dia |
| Horário de publicação | 7h às 22h |
| Idade máxima da oferta | 24 horas |

Se o limite for atingido, a oferta **não é perdida** — ela entra no próximo ciclo.

---

## Quando algo dá errado

### "LINK REQUIRED" numa oportunidade

**O que é:** falta o link de afiliado. Sem ele, o Garimpo não publica.

**O que fazer:**
1. Vá em **Automação de afiliados** e veja se a sessão está ativa.
2. Se estiver, clique em **Gerar links que faltam**.
3. Volte em **Oportunidades** e clique em **Avaliar** naquela linha.

Se preferir, dá para colar um link manualmente na própria oportunidade, no campo que
aparece embaixo.

### "Autenticação necessária" na Automação de afiliados

**O que é:** o Garimpo perdeu o acesso à sua conta do Mercado Livre. Acontece de tempos
em tempos — é normal.

**O que fazer:** peça a quem cuida do servidor para rodar o comando que aparece na tela
(`npm run affiliate:login`). Leva menos de um minuto e vale por muito tempo.

Enquanto isso, tudo o mais continua funcionando — só não surgem links novos.

### Uma publicação apareceu como `FAILED`

Vá em **Publicações** e clique em **Tentar novamente**.

Se der erro de novo, a coluna **Erro** explica. Os mais comuns:

| Mensagem | O que fazer |
| -------- | ----------- |
| "o bot precisa ser administrador do canal" | Adicione o bot como administrador do canal, com permissão de publicar |
| "Canal não encontrado" | Confira o identificador do canal em **Canais** |
| "Token do bot inválido" | Peça para revisarem a configuração do servidor |
| "pode ter sido publicada" | **Olhe o canal antes de reenviar** — pode ter dado certo mesmo assim |

### Não publicou nada, e não deu erro

Olhe a tela **Automação**, no **Motivo do adiamento**:

- **Autopilot desligado** — o piloto automático está `OFF`.
- **Fora da janela de horário** — está fora do intervalo de 7h às 22h.
- **Limite do canal atingido** — já publicou o máximo por hora/dia. Aguarde.

### O produto tem nota alta mas não publica

Confira, nesta ordem:
1. Tem link de afiliado? (status `NOT_ELIGIBLE` = não)
2. Você marcou como **Rejeitar** sem querer? Use **Voltar ao engine**.
3. A oferta já foi publicada nesse canal? Cada oferta só vai uma vez por canal.
4. A oferta é de mais de 24 horas atrás? O piloto automático não publica ofertas velhas.

---

## Palavras que aparecem no painel

| Palavra | O que significa, em português simples |
| ------- | ------------------------------------- |
| **Produto** | Um item do Mercado Livre que você acompanha |
| **Oferta** | Aquele produto num preço específico |
| **Oportunidade** | A oferta com a nota e a decisão |
| **Nota / Score** | De 0 a 100: o quanto vale a pena divulgar |
| **Canal** | Onde você publica (Telegram, Facebook, WhatsApp) |
| **Publicação** | O registro de que algo foi publicado |
| **Link de afiliado** | O link que faz você ganhar comissão |
| **Tag** | Seu código de afiliado no Mercado Livre |
| **Piloto automático** | O Garimpo trabalhando sozinho |
| **APPROVED** | Boa oferta, pode publicar |
| **CANDIDATE** | Razoável; você decide |
| **IGNORE** | Não vale a pena agora |
| **NOT_ELIGIBLE** | Falta link de afiliado |

---

## Perguntas frequentes

**Preciso criar link de afiliado para cada produto?**
Não. O Garimpo cria sozinho. Você só autentica a conta de vez em quando.

**Posso publicar a mesma oferta duas vezes no mesmo canal?**
Não — o sistema impede, mesmo se você clicar várias vezes.

**Posso publicar a mesma oferta no Telegram e no Facebook?**
Sim. Os limites de cada canal são contados separadamente.

**O que acontece se eu rejeitar e depois mudar de ideia?**
Clique em **Voltar ao engine**. Sua decisão anterior é apagada.

**Por que uma oferta de nota 100 não publicou?**
Quase sempre falta o link de afiliado. Veja `LINK REQUIRED` acima.

**O Garimpo inventa desconto ou "última unidade"?**
Não. Ele só escreve o que os dados sustentam. Nada de urgência falsa.

**Apaguei um produto sem querer. E as publicações?**
Publicações já feitas nos canais **não são apagadas** — o Garimpo não remove mensagens
já publicadas. Apague manualmente no canal, se precisar.
