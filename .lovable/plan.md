## Problema 1 — Pendentes pagam na conta antiga

Quando você troca o `INFINITEPAY_HANDLE`, os pedidos que já estavam pendentes guardaram um link de pagamento (`payment_link`) gerado com a conta **antiga**. Hoje, ao clicar em **Pagar**, o sistema reaproveita esse link salvo (`CpfLookupDialog.tsx`, "se já existe link, redireciona"), então o cliente cai na conta antiga e o webhook (que agora é da conta nova) nunca recebe a confirmação → fica pendente para sempre.

### Solução
Regerar o link com a conta **atual** sempre que o link salvo tiver sido criado com um handle diferente do configurado agora.

1. **Banco:** adicionar a coluna `payment_handle` na tabela `orders` para registrar com qual conta InfinitePay cada link foi gerado.
2. **Edge function `create-checkout`:** ao gerar/regerar um link, salvar o `payment_handle` atual no pedido. No caminho de regeneração (`regenerate_for_order_id`), passar a considerar o link "obsoleto" quando `payment_handle` salvo for diferente do `INFINITEPAY_HANDLE` atual (além do caso de link ausente), regerando e atualizando link + handle.
3. **Frontend `CpfLookupDialog.tsx` (botão Pagar, pedido individual):** em vez de redirecionar direto para o `payment_link` salvo, sempre chamar a função de regeneração no servidor, que decide: se o link ainda é da conta atual, devolve o mesmo; se for da conta antiga, gera um novo na conta atual e redireciona para ele.
4. **Pedidos em lote (`split-batch-payment`):** esse fluxo já gera um link novo na hora, então usará automaticamente a conta atual — apenas confirmaremos isso ao implementar.

Resultado: pendentes antigos, ao clicar em Pagar, são levados à conta atual e o webhook confirma normalmente. Pedidos já pagos na conta antiga continuam exigindo a confirmação manual (Problema 2).

## Problema 2 — "Falha de conexão" na confirmação manual

A mensagem vem do bloco de erro do `fetch` em `AdminOrders.tsx`. A causa não é o banco: é **CORS**. As funções administrativas `manual-confirm-order`, `bulk-confirm-orders`, `cancel-order` e `review-payment-proof` usam `Access-Control-Allow-Origin = APP_URL`, que aponta para o domínio `lovable.app`. Como você acessa o admin pelo domínio **`vercel.app`**, o navegador bloqueia a resposta e o `fetch` falha → "Falha de conexão". As funções que funcionam (verificar pendentes, etc.) usam `"*"`.

### Solução
Alinhar essas quatro funções com as demais, liberando o CORS (`Access-Control-Allow-Origin: "*"`). É seguro porque a autenticação dessas funções é feita por token Bearer no cabeçalho (não por cookies), e elas continuam validando admin via `is_admin`. Isso restaura a confirmação manual (e também a confirmação em lote, cancelamento e aprovação de comprovantes) a partir de qualquer domínio.

## Detalhes técnicos

- **Migração:** `ALTER TABLE public.orders ADD COLUMN payment_handle text;` (sem mexer em RLS/grants existentes).
- **`create-checkout/index.ts`:**
  - Em `generatePaymentLink`, gravar `payment_handle: infinitepayHandle` junto com o link.
  - No bloco `regenerate_for_order_id`: ler também `payment_handle`; tratar como obsoleto quando `!payment_link || payment_handle !== INFINITEPAY_HANDLE`; ao regerar, atualizar `payment_link` e `payment_handle`.
- **`CpfLookupDialog.tsx`:** no `onClick` do botão Pagar para `purchase_type` individual, trocar o atalho "se `order.payment_link` redireciona" por uma chamada ao `create-checkout` com `regenerate_for_order_id` (que devolve o link correto da conta atual) e então redirecionar.
- **CORS:** em `manual-confirm-order`, `bulk-confirm-orders`, `cancel-order` e `review-payment-proof`, trocar `Deno.env.get("APP_URL") || "*"` por `"*"` na linha do `Access-Control-Allow-Origin`.

Nenhuma alteração de preço ou de regra de pagamento; o cálculo continua no backend.
