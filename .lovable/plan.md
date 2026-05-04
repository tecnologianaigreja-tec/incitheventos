# Plano: Filtro por Evento + Cancelamento de Pedidos

## 1. Seletor de evento global (prioridade no publicado)

Criar uma função utilitária `getDefaultEventId(events)` em `src/lib/utils.ts` que retorna:
1. Primeiro evento com `status = 'published'` (ordenado por `start_date` desc)
2. Senão, o evento mais recente (`closed`/`concluded`/`draft`) por `created_at` desc

Aplicar essa lógica de "evento padrão" em todas as telas administrativas que listam dados:

- **`AdminDashboard.tsx`**: 
  - Adicionar estado `selectedEventId` + carregar lista de eventos.
  - Renderizar `<Select>` no topo (ao lado do título "Visão Geral").
  - Filtrar todas as queries (`registrations`, `orders`, `certificates`) por `event_id`.
  - Inicializar com `getDefaultEventId(events)`.

- **`AdminOrders.tsx`**:
  - Adicionar `selectedEventId` + `<Select>` de evento no topo da aba.
  - Adicionar `.eq("event_id", selectedEventId)` na query de orders.
  - Inicializar com `getDefaultEventId`.

- **`AdminRegistrations.tsx`** e **`AdminCheckin.tsx`** e **`AdminCertificates.tsx`**:
  - Já possuem seletor; apenas mudar a inicialização de "primeiro evento da lista" para `getDefaultEventId(events)` (priorizando publicado).

## 2. Cancelar pedido (admin) + bloqueio de retomada

### Backend

Nova Edge Function **`cancel-order`** (`supabase/functions/cancel-order/index.ts`):
- Recebe `{ order_id, reason }`. Requer auth admin (valida via `is_admin`).
- Atualiza `orders.payment_status = 'canceled'`, `canceled_at = now()`.
- Atualiza `registrations` vinculadas (`order_id = X`) para `registration_status = 'canceled'`, `payment_status = 'canceled'`.
- Registra entrada em `audit_logs` (`action = 'order_canceled'`, `details = { reason }`).

### Frontend — `AdminOrders.tsx`

- Adicionar botão **"Cancelar"** (ícone `XCircle`, variant destructive) na coluna Ações para pedidos com status `pending` ou `approved`.
- Abrir `AlertDialog` pedindo motivo (textarea, mín 5 chars).
- Chamar `cancel-order` e recarregar lista.

### Bloqueio de retomada — busca pública por CPF

Localizar a tela de "Consulta de inscrição" pública (provavelmente `EventsListPage` ou `RegistrationPage` com lookup por CPF). Verificar arquivo `src/features/.../publicLookup` ou similar via `rg "CPF" src/pages`.

Comportamento atual: inscrição com `pending_payment` permite retomar pagamento.
**Mudança**: se a inscrição mais recente do CPF naquele evento estiver com `registration_status = 'canceled'`, **não** mostrar opção de retomada. Mostrar mensagem: *"Sua inscrição anterior foi cancelada. Faça uma nova inscrição."* + botão para `/evento/:slug` (formulário novo).

Adicionalmente, a regra existente `prevent_duplicate_active_registration` já permite nova inscrição quando a anterior está `canceled` (não está em `pending_payment`/`confirmed`), então o re-cadastro funcionará sem migração de schema.

## 3. Garantias de não-regressão

- Não alterar schemas nem RLS (apenas inserts via Edge Function com service role).
- Seletores de evento já existentes em Registrations/Checkin/Certificates ficam intactos — só muda o valor inicial.
- Webhook InfinitePay continua sendo a fonte da verdade; cancelamento manual apenas marca `canceled` e não impede um eventual webhook posterior de re-aprovar (mas como pedido cancelado normalmente não tem pagamento aprovado, é seguro).

## Arquivos afetados

- `src/lib/utils.ts` — nova helper `getDefaultEventId`
- `src/pages/admin/AdminDashboard.tsx` — seletor + filtros por evento
- `src/pages/admin/AdminOrders.tsx` — seletor + botão Cancelar
- `src/pages/admin/AdminRegistrations.tsx` — init default
- `src/pages/admin/AdminCheckin.tsx` — init default
- `src/pages/admin/AdminCertificates.tsx` — init default
- `supabase/functions/cancel-order/index.ts` — nova função
- Tela de consulta pública por CPF — bloqueio de retomada quando cancelado