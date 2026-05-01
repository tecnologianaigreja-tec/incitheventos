# Melhorias no Check-in + Acesso Restrito de Operador

Três melhorias, sem quebrar nada do que já funciona (câmera/QR, manual, lista de presentes, painel admin completo).

---

## 1) Busca por nome/e-mail/código deve LISTAR resultados (não fazer check-in direto)

**Hoje:** ao clicar em "Buscar", o sistema pega o primeiro resultado e já marca check-in. Isso causa check-ins equivocados quando há nomes parecidos.

**Novo comportamento em `src/pages/admin/AdminCheckin.tsx`:**

- "Buscar" passa a executar uma consulta `.ilike` em `full_name`, `email` e `registration_code`, retornando até ~20 resultados (ordenados por nome).
- Os resultados aparecem em uma **lista de cards** logo abaixo do campo de busca, mostrando para cada inscrição:
  - Nome, e-mail, CPF (mascarado), código de inscrição
  - Badge de status de pagamento (Pago / Não pago)
  - Badge de check-in (Presente / Não registrado) com horário, se já feito
  - Botão **"Confirmar check-in"** (desabilitado se não estiver pago ou se já estiver presente)
- Só ao clicar em "Confirmar check-in" do card escolhido o sistema executa a marcação (mesma lógica que já existe em `handleManualSearch`, extraída para uma função única `confirmCheckin(registration)`).
- A leitura por câmera (QR) e o campo "Inserir token do QR Code manualmente" continuam funcionando exatamente como hoje (check-in imediato, pois o QR já identifica unicamente).

---

## 2) Filtros encadeados (campo + valor) na lista de "Participantes presentes"

Já existe o componente `DynamicFieldFilters` (com Select de campo → Select/Popover de valores). Ele já é usado em `AdminCheckin`, mas hoje filtra apenas a página visível (50 registros).

**Mudanças:**

- Manter o componente atual (campo → valores), que já entrega exatamente o pedido: "filtrar cargos → aparece a lista de cargos", "filtrar área → aparece a lista de áreas", etc.
- Carregar os `event_form_fields` de **todos os eventos** (não só os da página atual) para que o seletor de campos sempre traga Cargo, Função, Área, Congregação e demais campos personalizados disponíveis.
- Aplicar os filtros **no servidor** (via `applyDynamicFiltersToQuery`, que já existe em `src/lib/dynamicFilterQuery.ts`) dentro de `loadCheckedIn`, para que:
  - O **contador "Total presentes"** reflita o filtro aplicado.
  - A paginação funcione corretamente sobre o conjunto filtrado.
- Adicionar campos fixos conhecidos (Cargo/Função/Área/Congregação) à lista do seletor mesmo quando o evento não os tiver como custom field, para garantir que esses filtros estejam sempre disponíveis.

---

## 3) Botão "Check-in" na home + login restrito do operador

**Na `src/pages/EventsListPage.tsx`:** adicionar, ao lado do link "Administrativo" do rodapé, um segundo link discreto **"Check-in"** apontando para `/checkin/login`.

**Nova rota pública `/checkin/login`** (`src/pages/CheckinLoginPage.tsx`):
- Página de login simples (mesmo padrão visual do admin login, mas com texto "Acesso da equipe de Check-in").
- Faz `supabase.auth.signInWithPassword({ email, password })`.
- Após autenticar, valida em `admin_users` que o `role` é `checkin_operator`, `admin` ou `superadmin`. Se não for, faz signOut e mostra erro.
- Em caso de sucesso, redireciona para `/checkin`.

**Nova rota protegida `/checkin`** (`src/pages/CheckinOperatorPage.tsx`):
- Layout enxuto (header com título "Check-in", nome do operador e botão Sair). **Sem sidebar do admin**, sem links para Pedidos/Inscritos/Financeiro/etc.
- Verifica sessão + role em `admin_users` (qualquer role autorizado acima). Se não autorizado, redireciona para `/checkin/login`.
- Renderiza o **mesmo componente `AdminCheckin`** (já com as melhorias 1 e 2), garantindo paridade total de funcionalidade e zero duplicação de lógica.

**Criação do usuário operador (`conferencia@gmail.com` / `conferencia33`):**
- Edge function única e idempotente `seed-checkin-operator` (chamada uma vez), que:
  1. Verifica se já existe usuário com esse e-mail em `auth.users` (via `admin.listUsers` / `getUserByEmail`).
  2. Se não existir, cria com `admin.createUser({ email, password, email_confirm: true })`.
  3. Faz `upsert` em `admin_users` com `role = 'checkin_operator'` e `name = 'Equipe Check-in'`.
- Usa `SUPABASE_SERVICE_ROLE_KEY` (já disponível no ambiente das edge functions).

**RLS / segurança:**
- O role `checkin_operator` já existe no enum `admin_role`.
- Revisar políticas atuais para garantir que esse role só consiga: ler `registrations` e `events`, e atualizar `checkin_status/checkin_at/checkin_by_user_id` em `registrations`, além de inserir em `checkin_logs`. **Sem acesso** a `orders`, dados financeiros, ou `site_settings`.
- Se alguma policy hoje exige `role IN ('admin','superadmin')`, ampliar para incluir `'checkin_operator'` apenas nas operações estritamente necessárias acima.

---

## Resumo dos arquivos

```text
Editar:
  src/pages/admin/AdminCheckin.tsx     # busca lista resultados; filtros server-side
  src/pages/EventsListPage.tsx          # link "Check-in" no rodapé
  src/App.tsx                            # rotas /checkin/login e /checkin

Criar:
  src/pages/CheckinLoginPage.tsx
  src/pages/CheckinOperatorPage.tsx
  supabase/functions/seed-checkin-operator/index.ts
  supabase/migrations/<timestamp>_checkin_operator_policies.sql  # se necessário ampliar RLS
```

Nada do fluxo atual (admin, pagamento InfinitePay, leitura por QR, lista de presentes, exportações) é alterado em comportamento — só evoluído.
