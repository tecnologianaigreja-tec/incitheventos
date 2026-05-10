## Objetivo

Tornar o webhook `payment-webhook` mais resiliente para evitar pedidos pagos ficarem "pendentes". Quatro ajustes pontuais, escopo restrito ao arquivo `supabase/functions/payment-webhook/index.ts`.

## Mudanças (apenas neste arquivo)

**1. `resolvePaymentStatus` — match parcial**
Substituir o mapa exato de `statusMap` por verificações `status.includes(...)` para tolerar variações ("approved_payment", "payment_paid", "captured_ok", etc.).

**2. Extração do `externalId` — usar ID do evento**
Trocar a ordem de fallback para priorizar identificadores de evento e evitar colisão de idempotência quando a mesma transação dispara vários eventos:
```
event_id → webhook_id → id
```
Remove `transaction_nsu` e `transaction_id` da prioridade.

**3. Idempotência por `(externalId, eventType)`**
Hoje qualquer evento já processado com o mesmo `externalId` é bloqueado. Passar a bloquear apenas quando `external_event_id` **e** `event_type` coincidem, e usar `.maybeSingle()` em vez de `.single()`.

**4. Busca de order com fallback por `invoice_slug`**
Se `orderNsu` estiver presente, busca como hoje. Se não, tenta `payload.invoice_slug` (ou `payload.metadata.invoice_slug`) na coluna `orders.invoice_slug`.

## Ponto de atenção (a confirmar antes de implementar)

A mudança 4 assume que existe a coluna `orders.invoice_slug`. Preciso confirmar:

- Se **existir**: aplico exatamente como solicitado.
- Se **não existir**: a edge function vai compilar, mas a query falhará em runtime quando cair nesse fallback. Nesse caso eu sugiro duas opções:
  - (a) criar a coluna `invoice_slug` em `orders` (migration separada), ou
  - (b) trocar o fallback por outro campo já existente (ex.: `payment_provider_reference`).

Posso checar o schema antes de aplicar para evitar quebra silenciosa. Nenhuma outra parte do arquivo será alterada (validação de amount, atualização de order/registrations, audit log, CORS — tudo permanece igual).

## Arquivos

- `supabase/functions/payment-webhook/index.ts` — único arquivo modificado.
