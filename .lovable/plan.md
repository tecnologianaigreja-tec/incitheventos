## Objetivo

Na aba **Inscritos**, expandir a geração de PDF para suportar dois tipos de relatório, sem quebrar o que já existe:

1. **Relatório Geral (Lista) — com colunas adicionais opcionais**
2. **Relatório Quantitativo (Agrupamento) — por campo, com sub-agrupamento opcional**

As colunas atuais (Nome, E-mail, CPF, Pagamento, Check-in) continuam padrão e não podem ser removidas.

---

## 1. Relatório Geral com colunas extras

### UX

- O botão **"Relatório PDF"** vira um `DropdownMenu` com duas opções:
  - **"Relatório Geral (lista)"** → abre diálogo para escolher colunas extras
  - **"Relatório Quantitativo (agrupado)"** → abre diálogo de agrupamento

- Diálogo "Relatório Geral":
  - Mostra as colunas fixas como checkboxes desativados/marcados (Nome, E-mail, CPF, Pagamento, Check-in).
  - Lista colunas extras disponíveis com checkbox:
    - Telefone, Data de nascimento, Congregação, Área, Cargo, Função, Código de inscrição, Tipo, Etiqueta, Material, Data da inscrição
    - Todos os **campos dinâmicos** do evento selecionado (`event_form_fields` → `field_label/field_key`), lendo de `custom_fields`.
  - Botão **Gerar PDF**.

### Backend de PDF (`src/lib/reportPdf.ts`)

- Adicionar parâmetro opcional `extraColumns: { key: string; label: string; getValue: (r) => string }[]` em `generateEventReportPdf`.
- Renderização da tabela passa a ser **dinâmica**:
  - Calcula larguras com base no nº de colunas (fixas + extras).
  - Se a soma exceder a largura útil A4 retrato, troca para **A4 paisagem** automaticamente.
  - Se ainda exceder com muitas colunas, reduz fonte para 7 e abrevia textos longos com `…`.
- Comportamento atual (sem `extraColumns`) é preservado — chamada antiga continua funcionando.

---

## 2. Relatório Quantitativo (agrupado)

### UX — Diálogo "Relatório Quantitativo"

- **Agrupar por** (select obrigatório): lista todos os campos categóricos disponíveis:
  - Área, Cargo, Função, Congregação, Status pagamento, Status inscrição, Tipo (individual/lote), Check-in (sim/não)
  - Campos dinâmicos do tipo `select`/`text` definidos em `event_form_fields`.
- **Sub-agrupar por** (select opcional): mesma lista, exclui o campo já escolhido.
- **Considerar somente** (radio): "Todos" / "Confirmados" / "Pagos".
- Botão **Gerar PDF**.

### Conteúdo do PDF

Cabeçalho igual ao geral (evento, período, filtros aplicados, data de geração).

Para cada **grupo principal** (ordenado por contagem desc):
- Linha de cabeçalho do grupo: `Área: Centro — 42 inscritos — R$ 4.200,00`
  - Quantidade = nº de inscritos do grupo
  - Valor = `count × event.unit_price_cents` (apenas dos `payment_status='approved'` se "Pagos"; caso geral, soma confirmados; explicito no rodapé "Valor estimado").
- Se houver **sub-agrupamento**, lista indentada:
  - `  Presbítero — 12 (R$ 1.200,00)`
  - `  Diácono — 8 (R$ 800,00)`

Ao final:
- **Totais gerais**: total de inscritos, total por status (confirmados/pendentes/cancelados), receita confirmada, receita pendente.
- Mini-tabela "Resumo do agrupamento" com totais por grupo.

Vazios são exibidos como `(não informado)`.

### Implementação

- Novo arquivo `src/lib/groupedReportPdf.ts` com função `generateGroupedReportPdf({ event, registrations, groupBy, subGroupBy, scope, filterDescription })`.
- Reaproveita helpers de cabeçalho/seções do `reportPdf.ts` (extrair para `src/lib/reportPdfShared.ts` se necessário, mantendo `reportPdf.ts` funcional).
- Funções utilitárias:
  - `getFieldValue(r, fieldKey)` — resolve campos fixos e custom (`r.custom_fields[key]`).
  - `groupBy(items, keyFn)` → `Map<string, RegistrationData[]>`.

---

## 3. Arquivos afetados

- `src/pages/admin/AdminRegistrations.tsx`
  - Substituir botão único por DropdownMenu.
  - Dois novos diálogos (colunas / agrupamento) usando `Dialog` + `Checkbox` + `Select` já existentes em `components/ui`.
  - Buscar `event_form_fields` do evento selecionado para popular as opções (ou reutilizar dados já carregados, se houver).
- `src/lib/reportPdf.ts`
  - Adicionar suporte a `extraColumns` + auto-paisagem + larguras dinâmicas.
  - **Não alterar assinatura existente** — parâmetro novo é opcional.
- `src/lib/groupedReportPdf.ts` *(novo)*
  - Geração do relatório quantitativo.
- (Opcional) `src/lib/reportPdfShared.ts` para helpers comuns.

---

## 4. Garantias de não-regressão

- Chamada atual `generateEventReportPdf({ event, registrations, filterDescription })` continua válida — `extraColumns` é opcional.
- Filtros existentes (busca, status, evento, dinâmicos) continuam aplicados antes de gerar qualquer um dos dois relatórios.
- Nada é alterado em check-in, certificados, dashboard, pedidos.
- Sem mudanças de schema, RLS ou Edge Functions.

---

## Detalhes técnicos resumidos

```ts
// reportPdf.ts (assinatura estendida)
generateEventReportPdf({
  event, registrations, filterDescription,
  extraColumns?: { key: string; label: string; getValue: (r: RegistrationData) => string }[]
})

// groupedReportPdf.ts (novo)
generateGroupedReportPdf({
  event, registrations, filterDescription,
  groupBy: { key: string; label: string },
  subGroupBy?: { key: string; label: string },
  scope: "all" | "confirmed" | "paid",
})
```
