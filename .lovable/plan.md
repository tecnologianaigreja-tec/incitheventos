# Etiqueta impressa + Material entregue (aba Inscritos)

Duas melhorias na aba **Inscritos**, sem alterar nenhum comportamento existente (check-in, pagamento, paginação, filtros, edição, descredenciar, relatório PDF, impressão individual etc.).

## 1) Etiqueta impressa — automático

**Comportamento:**
1. Você filtra normalmente (área, status, busca…) e clica **"Imprimir etiquetas"**.
2. Abre um diálogo informando:
   - **Novos (não impressos):** X
   - **Já impressos antes:** Y
   - **Pulados (sem QR):** Z
3. Duas opções:
   - **"Imprimir só os novos (X)"** [padrão]
   - **"Reimprimir todos (X+Y)"**
4. Após disparar a impressão, todos os incluídos são marcados como impressos (data + usuário + contador).
5. Impressão individual (botão da linha ou do diálogo de detalhes) também marca.
6. Novo filtro **"Etiqueta: Todos / Não impressos / Impressos"** ao lado de Status.
7. Coluna "Etiqueta" na tabela com selo discreto + tooltip de data.
8. Ação **"Marcar como não impresso"** no diálogo de detalhes (caso saia borrada).

## 2) Material entregue — manual

**Comportamento:**
1. Coluna nova **"Material"** na tabela com um **checkbox**.
2. Clicar no checkbox alterna entre `pendente` ↔ `entregue`, gravando data + usuário.
3. Badge ao lado: **"Entregue"** (verde) ou **"—"** (cinza).
4. Filtro **"Material: Todos / Pendente / Entregue"** ao lado dos demais.
5. No diálogo de detalhes, mostra "Material: Entregue em DD/MM HH:mm por Fulano" + botão para reverter.
6. Não tem automação — é puramente manual, à escolha do operador.

## Detalhes técnicos

### Migration (nova)

Adicionar 5 colunas em `registrations` (todas opcionais, com defaults seguros — não quebra nada):

```text
label_printed_at    timestamptz null
label_printed_by    uuid        null
label_print_count   integer     not null default 0
material_delivered_at  timestamptz null
material_delivered_by  uuid        null
```

Índices parciais para os filtros novos não pesarem:
```text
create index registrations_label_unprinted_idx
  on registrations (event_id) where label_printed_at is null;
create index registrations_material_pending_idx
  on registrations (event_id) where material_delivered_at is null;
```

RPC `mark_labels_printed(_ids uuid[], _user uuid)` (SECURITY DEFINER, `search_path=public`, restrita a admin via `is_admin`):
- `UPDATE registrations SET label_printed_at = now(), label_printed_by = _user, label_print_count = label_print_count + 1 WHERE id = ANY(_ids)`
- Necessária por causa do incremento atômico do contador.

Para "material entregue" e "marcar etiqueta como não impressa", usar `update` direto (RLS de admin já cobre).

### Frontend — `src/pages/admin/AdminRegistrations.tsx`

- **Estado novo:** `labelFilter` (`all|unprinted|printed`), `materialFilter` (`all|pending|delivered`), `printDialogOpen`, `printSplit` (`{ novos, jaImpressos, semQr }`).
- **`buildRegistrationsQuery`:** aplicar `.is("label_printed_at", null)` / `.not("label_printed_at", "is", null)` e equivalentes para material.
- **Reset de página:** incluir os dois filtros novos no `useEffect` que zera `page`.
- **`handlePrintBatch`:**
  - Após `fetchAllPages` + `applyDynamicFilters` + filtro de QR, separar em `novos` e `jaImpressos`.
  - Substituir `window.confirm` por `AlertDialog` com as duas opções (padrão = só novos).
  - Após `printLabels(...)`, chamar RPC `mark_labels_printed` em lotes de 200 IDs.
  - Registrar `audit_logs` com `action='labels_printed'`, `details={count, scope}`.
- **`handlePrintSingle`:** chamar a mesma RPC com `[reg.id]` após imprimir.
- **Nova função `toggleMaterial(reg)`:** alterna `material_delivered_at` (now/null) e `material_delivered_by` (user/null); registra `audit_logs` `material_delivered`/`material_undelivered`.
- **Tabela:**
  - Nova coluna **"Material"** com `<Checkbox>` (parar propagação do clique para não abrir o diálogo).
  - Nova coluna **"Etiqueta"** com badge `Impressa` (tooltip data) ou `—`.
  - `colSpan` da linha vazia atualizado de 7 para 9.
- **Barra de filtros:** dois `Select` adicionais (Etiqueta, Material), abaixo dos atuais em telas estreitas (`flex-wrap`).
- **Diálogo de detalhes:**
  - Linhas extras em `fixedDetails`: "Etiqueta" e "Material" com data/usuário.
  - Botões: **"Marcar como não impresso"** e **"Reverter material"** (quando aplicável).
- **Tipos:** `RegistrationData` em `src/lib/types.ts` ganha os 5 campos novos.

### Garantias de não-regressão

- Todas as colunas novas são nullable / default 0 — registros antigos continuam válidos.
- RLS atual (`Admins can update registrations`) já permite o update de material direto pelo admin.
- A RPC só amplia capacidades; nada existente passa a depender dela.
- Filtros novos têm valor padrão `all` → comportamento de listagem inicial idêntico ao atual.
- Paginação server-side, debounce, busca, dynamic filters, relatório PDF, impressão individual, descredenciar e edição permanecem intactos.

## Arquivos afetados

1. **Migration nova** — 5 colunas, 2 índices parciais, RPC `mark_labels_printed`.
2. **`src/pages/admin/AdminRegistrations.tsx`** — diálogo de impressão, dois filtros, duas colunas, ações no detalhe.
3. **`src/lib/types.ts`** — adicionar campos em `RegistrationData`.
4. **`src/integrations/supabase/types.ts`** — regenerado automaticamente pela migration.
