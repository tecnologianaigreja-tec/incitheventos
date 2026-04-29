## Diagnóstico

Investiguei o banco e o webhook. O código do webhook (`payment-webhook/index.ts`) está **correto** — quando ele é chamado pela InfinitePay, ele processa, atualiza o pedido para `approved` e confirma as inscrições (vide order `PED-9S4EAGQT` nos logs: tudo funcionou).

**O problema real:** existem **34 pedidos `pending`** no banco e **NENHUM deles tem registro em `payment_events`** — ou seja, a InfinitePay simplesmente **não chamou o webhook** para esses pagamentos. Isso pode ocorrer por:

1. Pagamentos confirmados antes de configurarmos o `webhook_url` no checkout (links antigos).
2. Falha esporádica de entrega da InfinitePay (sem retry automático configurado).
3. Pagamento concluído mas o webhook ficou bloqueado/perdido.

Hoje o sistema só confia no webhook. Não há nenhum mecanismo de **fallback/reconciliação** — por isso o cliente paga, volta ao site e o status continua "pendente" pedindo para pagar de novo.

## Solução (3 frentes)

### 1. Corrigir agora os 34 pedidos pendentes existentes

A InfinitePay possui endpoint público de consulta por `invoice_slug`, mas como não temos o slug salvo, faremos a reconciliação **uma a uma via interface admin** (botão "Verificar pagamento" em cada pedido pendente) — a função consulta o status real na InfinitePay usando o `order_nsu` e, se aprovado, dispara o mesmo fluxo do webhook. Também ofereço uma **ação manual "Marcar como pago"** para o admin resolver casos onde já temos comprovante externo.

### 2. Reconciliação automática (cron)

Criar uma edge function `reconcile-pending-payments` que roda periodicamente (chamada via cron Supabase a cada 10 min) e, para cada pedido `pending` com mais de 2 minutos:
- Consulta a InfinitePay (`GET https://api.infinitepay.io/invoices/public/checkout/{invoice_slug}` ou via `order_nsu`).
- Se aprovado → chama internamente a mesma rotina do webhook (extrair em helper compartilhado).
- Loga em `audit_logs` (`reconciliation_run`).

Para isso precisamos salvar o `invoice_slug` que a InfinitePay retorna na criação do checkout (ajustar `create-checkout` para extrair `slug`/`invoice_slug` da resposta e gravar em `orders.payment_provider_reference` ou nova coluna `invoice_slug`).

### 3. Reforçar o redirect (já existe, melhorar)

Quando o cliente volta de `/pedido/:order_code?status=redirect`, a `OrderStatusPage` deve **forçar uma reconciliação síncrona** (chamar `reconcile-pending-payments` para aquele order_code) antes de mostrar "pendente". Assim, mesmo se o webhook atrasar, o status já fica correto na hora.

## Mudanças técnicas

**Banco (migration):**
- Adicionar coluna `orders.invoice_slug TEXT NULL` para guardar o slug retornado pela InfinitePay.
- Backfill: tentar preencher para os pedidos existentes via consulta na InfinitePay (best-effort).

**Edge functions:**
- Nova: `supabase/functions/reconcile-pending-payments/index.ts`
  - Aceita `{ order_code?: string }` (reconciliar 1) ou nada (reconciliar todos pending > 2min, limite 50).
  - Para cada pedido: consulta InfinitePay, se `paid_amount > 0` → executa mesma lógica do webhook (atualiza order para `approved`, atualiza registrations para `confirmed`, gera `qr_token`, grava `audit_logs` + `payment_events` com `event_type='reconciliation'`).
- Atualizar `create-checkout/index.ts`: extrair `slug` / `invoice_slug` da resposta InfinitePay e salvar em `orders.invoice_slug`.
- Refatorar lógica de "aplicar pagamento aprovado" em helper compartilhado entre `payment-webhook` e `reconcile-pending-payments` (duplicar inline é ok também — ambas funções pequenas).

**Frontend:**
- `src/pages/admin/AdminOrders.tsx`: adicionar botões nos pedidos `pending`:
  - **"Verificar pagamento"** → chama `reconcile-pending-payments` com `order_code`. Se aprovado, recarrega a lista mostrando confirmado.
  - **"Marcar como pago manualmente"** (apenas superadmin) → confirmação dupla + chama nova rota interna que aplica `approved` e registra audit_log com motivo.
- `src/pages/OrderStatusPage.tsx`: ao montar com `?status=redirect`, chamar `reconcile-pending-payments` antes de exibir status final (com loading "Verificando pagamento…").
- `src/pages/admin/AdminRegistrations.tsx`: já tem ação de descredenciar; não precisa mudar — mas o filtro/lista refletirá automaticamente o novo status.

**Cron (opcional, recomendado):**
- Documentar como o admin pode agendar via Supabase `pg_cron` chamando a função a cada 10 min. Como alternativa simples, disparamos a reconciliação automaticamente toda vez que a página `AdminOrders` carrega (debounced).

## Plano de execução

1. Migration: adicionar `orders.invoice_slug`.
2. Atualizar `create-checkout` para salvar o slug.
3. Criar edge function `reconcile-pending-payments`.
4. UI admin: botões "Verificar pagamento" e "Marcar como pago manualmente" em `AdminOrders`.
5. `OrderStatusPage`: reconciliação automática no retorno do checkout.
6. **Reconciliar imediatamente os 34 pedidos pendentes atuais** rodando a função uma vez (ela tentará confirmar todos os realmente pagos; os não pagos permanecem `pending`).
7. Audit logs para toda mudança manual.

## Detalhes técnicos importantes

- **Idempotência:** a função de reconciliação verifica `order.payment_status` antes de aplicar — nunca rebaixa de `approved`.
- **Validação de valor:** se `paid_amount` ≠ `total_price_cents`, registra `payment_amount_mismatch` em `audit_logs` (igual ao webhook).
- **Sem custo de risco:** "Marcar como pago manualmente" exige confirmação textual e fica registrado com `actor_id` no audit_log para auditoria.
- O endpoint público da InfinitePay para consultar status via `invoice_slug` é `https://api.infinitepay.io/invoices/public/checkout/{slug}`. Se não funcionar para `order_nsu` direto, dependeremos do slug — por isso o passo 1 e 2 são pré-requisitos para reconciliação automática 100%.

## O que NÃO vou mudar

- Não vou mexer em RLS, schema de registrations, fluxo de criação ou lógica de duplicidade.
- Não vou alterar o webhook em si (ele está correto) — só compartilhar a lógica de "aplicar aprovado".
