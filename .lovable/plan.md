# Pagamento em lote dinâmico + confirmação correta de status

## Problema
Quando alguém de um lote paga individualmente (via split), e depois outra pessoa do mesmo lote tenta pagar "o lote completo", precisamos garantir:
1. O valor cobrado seja **somente** o dos que ainda estão pendentes no lote.
2. Após o pagamento, **apenas as inscrições ainda pendentes daquele lote** mudem para "pago/confirmado" (sem afetar quem já pagou individualmente).
3. O link de pagamento do lote sempre seja regenerado quando o conjunto de pendentes mudar.

## Estado atual (verificado no código)
- `split-batch-payment` (modo `batch_remaining`) **já** recalcula `participants_count`, `total_price_cents` e gera novo `order_nsu` baseado em quem ainda está `pending_payment` no `order_id` original. ✅
- O webhook `payment-webhook`, ao confirmar, atualiza **todas** as registrations daquele `order_id`. Como quem foi splittado já foi movido para outro `order_id`, isso já está correto. ✅
- **Gaps reais a corrigir:**
  - **Bug do e-mail (visto nos logs):** `[split] InfinitePay error: customer.email is in invalid format`. Quando o `buyer_email` original do lote está vazio/inválido, o link não é gerado. Precisa fallback para o e-mail de um participante válido.
  - **Sem revalidação no webhook:** Se o usuário abrir um link antigo do lote (com valor desatualizado) e pagar, o webhook confirma mesmo assim. Precisa revalidar contra o `total_price_cents` atual da order.
  - **Sem trava de concorrência:** Se duas pessoas clicarem "Pagar lote" e "Pagar individual" ao mesmo tempo, pode dar inconsistência. Precisa sempre **regenerar o `order_nsu`** ao recalcular (já é feito), e garantir que o link antigo seja inutilizado.
  - **Recalcular ao consultar:** Quando o usuário abre o diálogo de "Pagar o lote completo" pela tela de consulta, o valor exibido deve já refletir os pendentes (não o total original).

## O que será feito

### 1. Corrigir geração do link no `split-batch-payment`
- Em `generatePaymentLink`, se `order.buyer_email` estiver vazio ou inválido, usar o e-mail do primeiro participante pendente como `customer.email`.
- Mesmo fallback aplicar para `buyer_name` se vazio.

### 2. Recalcular o lote SEMPRE que gerar/regenerar link de lote pendente
Adicionar uma função utilitária `recalculateBatchOrder(order_id)` no `split-batch-payment` que:
- Conta registrations com `registration_status = 'pending_payment'` ligadas ao `order_id`.
- Atualiza `participants_count`, `total_price_cents = count * unit_price_cents`, gera novo `order_nsu` e limpa `payment_link` antigo.
- Retorna a contagem e o novo total.
- Se contagem = 0, marca a order como `canceled`.

Já existe lógica parecida; vamos consolidar e garantir uso em ambos os modos (`individual` e `batch_remaining`) e também sempre que a UI consultar o lote para pagamento.

### 3. Endpoint de "preview" do lote
Adicionar um modo `preview` no `split-batch-payment` (ou um novo endpoint leve `get-batch-status`) que apenas:
- Recalcula e retorna `{ remaining_count, remaining_total_cents, remaining_participants: [{name, cpf_masked}] }`.
- Não regenera link ainda — apenas mostra ao usuário antes de ele confirmar.

A UI de consulta (`EventsListPage`) chamará esse preview ao abrir o diálogo de pagamento de lote, exibindo o valor atualizado e a lista de quem ainda falta pagar. Quando o usuário clicar "Pagar lote completo", aí sim chama `mode: batch_remaining` para gerar o link.

### 4. Validação de valor no `payment-webhook`
Antes de marcar como `approved`:
- Comparar `payload.paid_amount` com `order.total_price_cents` atual.
- Se `paid_amount < total_price_cents` (caso o usuário pagou um link antigo com valor menor), **logar warning** mas ainda confirmar (InfinitePay já recebeu o dinheiro). Registrar em `audit_logs` a discrepância.
- Se `paid_amount > total_price_cents` (link antigo com mais gente, mas alguns já pagaram individualmente nesse meio tempo), confirmar normalmente — quem pagou individual já está confirmado em outra order; os pendentes da batch atual recebem o status `approved` corretamente (o webhook só atualiza registrations daquele `order_id`).
- **Não rebaixar:** se a order já está `approved`, não fazer nada (já existe).

### 5. UI: atualizar diálogo de "Pagar lote completo"
Em `EventsListPage.tsx`, no diálogo de batch:
- Ao abrir, chamar o preview e exibir: "Faltam pagar X inscrições — Total atualizado: R$ Y,YY" e lista dos nomes pendentes.
- Botão "Pagar lote completo" usa o valor atualizado.

## Resumo técnico (para revisão)

```text
Fluxo garantido:
[Lote criado: 5 pessoas, R$500] 
   ↓ Pessoa A clica "Pagar só a minha"
[split → individual] → Order nova A (R$100), Order original recalc (4 pessoas, R$400, novo NSU)
   ↓ Pessoa A paga
[webhook] → atualiza apenas registrations da Order A → A=confirmed
   ↓ Pessoa B (do lote) abre consulta → escolhe "Pagar lote completo"
[preview] → mostra "4 pendentes, R$400" 
   ↓ B confirma
[batch_remaining] → recalc novamente (caso outro tenha splittado), regera link
   ↓ B paga R$400
[webhook] → atualiza as 4 registrations restantes → todas=confirmed
   ↓ Pessoa A já estava confirmada, intocada ✅
```

## Arquivos afetados
- `supabase/functions/split-batch-payment/index.ts` — fallback de e-mail/nome, função `recalculateBatchOrder` consolidada, modo `preview`.
- `supabase/functions/payment-webhook/index.ts` — log de discrepância de valor, audit.
- `src/pages/EventsListPage.tsx` — chamar preview ao abrir diálogo, exibir valor atualizado + lista de pendentes.

## Não será feito
- Não mudaremos schema do banco (não é necessário).
- Não tocaremos no fluxo de duplicidade já implementado.
- Não tocaremos no checkout individual normal.
