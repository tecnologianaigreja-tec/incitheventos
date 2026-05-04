## Diagnóstico

O relatório saiu com tudo "(não informado)" porque o agrupamento "Função ministerial" e o subagrupamento "Área" estão lendo as colunas **fixas** `registrations.church_function` e `registrations.area` — que estão **nulas** neste evento. Os dados reais foram coletados pelos **campos dinâmicos** do formulário (`custom_fields`):

- `FUNÇÃO MINISTERIAL` → "AUXILIAR", "MEMBRO", etc.
- `ÁREA DE CONG. A QUE PERTENCE` → "ÁREA 13", "ÁREA 2", etc.
- `DEPARTAMENTO` → "HOMENS", "JOVENS", etc.
- `CONGREGAÇÃO` → texto livre

Confirmado via banco em 3 inscrições amostradas: `area=null`, `church_function=null`, mas `custom_fields` populado com as chaves acima.

Hoje os campos fixos do agrupamento (`GROUP_FIXED_FIELDS` em `AdminRegistrations.tsx`) usam acesso direto: `r.area`, `r.church_function`, `r.church_role`, `r.congregation`. Quando o evento usa só campos dinâmicos, vira tudo vazio → "(não informado)".

Já existe o helper `getFieldValue` (em `DynamicFieldFilters.tsx`) que faz exatamente o fallback necessário: tenta a coluna fixa, depois procura em `custom_fields` por chave normalizada (acento/espaço-insensível). Os filtros dinâmicos já usam isso. O relatório quantitativo não.

## Mudanças

### 1. `src/pages/admin/AdminRegistrations.tsx`

Trocar os `getValue` dos campos fixos para usar `getFieldValue`, garantindo que Área/Cargo/Função/Congregação resolvam tanto da coluna quanto do `custom_fields`:

- Em `GROUP_FIXED_FIELDS`: `area`, `church_role`, `church_function`, `congregation` passam a chamar `getFieldValue(r, "area")`, `getFieldValue(r, "church_role")`, `getFieldValue(r, "church_function")`, `getFieldValue(r, "congregation")`.
- Em `EXTRA_FIXED_COLUMNS` (relatório geral): mesma troca para `phone`, `birth_date`, `congregation`, `area`, `church_role`, `church_function`.

### 2. Deduplicação no diálogo de agrupamento

Para evitar mostrar "Função ministerial" (fixo) e "FUNÇÃO MINISTERIAL" (dinâmico) como opções separadas no select, ao montar a lista combinada (`[...GROUP_FIXED_FIELDS, ...getDynamicGroupFields()]`):

- Filtrar do dinâmico os campos cuja chave normalizada já bate com um campo fixo conhecido (`area`, `church_role`/cargo/departamento, `church_function`/função, `congregation`, `phone`, `birth_date`) — reaproveitando a lógica de `resolveKnownField` que já existe.
- Fazer o mesmo para a lista de colunas extras do relatório geral.

### 3. Garantia de não-regressão

- `getFieldValue` mantém a precedência: coluna fixa primeiro, fallback para `custom_fields`. Eventos antigos que populam `area`/`church_function` continuam funcionando idênticos.
- Filtros existentes, geração do PDF, dashboard, pedidos, check-in, certificados — nada é tocado.
- Sem mudança de schema, RLS ou edge functions.

## Resultado esperado

Selecionando "Agrupar por: Função ministerial" + "Subagrupar por: Área" + "Apenas confirmados", o PDF passará a listar os totais reais por AUXILIAR / MEMBRO / etc., com sub-detalhamento por ÁREA 1, ÁREA 2, ... e Resumo final coerente.
