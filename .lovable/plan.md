# Corrigir filtros dinâmicos na aba Inscritos

## Problema

Na aba **Inscritos**, ao aplicar um filtro dinâmico (ex.: "Área = Área 6"):

- O total mostrado no topo (**306 resultados**) e a paginação (**Página 1 de 7**) consideram **todos** os inscritos, ignorando o filtro.
- A tabela exibe apenas os da Área 6 **dentro da página atual** de 50 — então sobram poucas linhas em cada página, e o usuário precisa pular de página em página para encontrar os 12 da Área 6 espalhados em 306 registros.
- O botão **"Imprimir etiquetas (306)"** também ignora o filtro dinâmico ao calcular a contagem (embora a impressão em si até filtre, a UX está enganosa).

### Causa raiz

Em `src/pages/admin/AdminRegistrations.tsx`:

- A query ao Supabase aplica server-side apenas: evento, status, etiqueta, material e busca textual.
- Os filtros dinâmicos (`dynamicFilters` — campos como Área, Congregação, Função, etc.) são aplicados **somente no client**, sobre a página já carregada (linha 336: `applyDynamicFilters(registrations, dynamicFilters)`).
- Logo, `totalCount` (que vem do `count: "exact"` da query) reflete o total **sem** os filtros dinâmicos.

## Solução

Aplicar os filtros dinâmicos **também no servidor**, usando a sintaxe PostgREST para JSONB e colunas conhecidas. Assim:

- `totalCount` passa a refletir o total **realmente filtrado**.
- A paginação passa a navegar somente entre os registros que casam com o filtro.
- O badge "306 resultados" e "Imprimir etiquetas (306)" mostram o número correto (ex.: "12 resultados", "Imprimir etiquetas (12)").

### Mudanças

**1. Nova helper `applyDynamicFiltersToQuery(query, filters)`** em `src/components/DynamicFieldFilters.tsx` (ou novo arquivo `src/lib/dynamicFilterQuery.ts`):

- Para cada filtro ativo, decide se o campo é uma **coluna conhecida** (`area`, `congregation`, `church_role`, `church_function`, `phone`, `birth_date`, `email`, `cpf`, `full_name`) ou **custom_field JSONB**.
- Coluna conhecida + lista de valores (multi-select): `query.in(coluna, values)`.
- Coluna conhecida + texto livre: `query.ilike(coluna, '%valor%')`.
- Custom field + lista de valores: `query.in('custom_fields->>field_key', values)`.
- Custom field + texto livre: `query.ilike('custom_fields->>field_key', '%valor%')`.
- Reaproveita o mesmo mapa `KNOWN_FIELD_MAP` que já existe para manter consistência com `getFieldValue`.

**2. Em `AdminRegistrations.tsx`:**

- `buildRegistrationsQuery()` passa a chamar `applyDynamicFiltersToQuery(q, dynamicFilters)` antes do `return`.
- A função `fetchAllPages` usada em `handlePrintBatch` e `handleDownloadReport` passa a usar a mesma query (incluindo dynamicFilters server-side) — assim **removemos** a chamada redundante a `applyDynamicFilters(all, dynamicFilters)` no client (mas mantemos como camada de segurança caso algum filtro complexo no futuro só funcione no client).
- Adicionar `dynamicFilters` ao array de dependências do `useEffect` que dispara `load()` e ao `useEffect` que reseta `setPage(1)`.
- A linha 336 (`const filtered = applyDynamicFilters(...)`) pode ser removida ou virar `const filtered = registrations;` — o servidor já filtra. (Mantenho `applyDynamicFilters` no client como no-op defensivo, pois a função é idempotente quando os dados já vêm filtrados.)
- O badge "X resultados" e "Imprimir etiquetas (X)" continuam usando `totalCount`, que agora estará correto.

**3. Cuidados:**

- Multi-select: o componente já guarda `values: string[]`. Usar `.in()` server-side requer values exatos (case-sensitive). O `getFieldValue` atual faz `toLowerCase()` no client. Para manter o comportamento, usar `.in()` com os valores originais (as opções vêm do próprio cadastro do evento, então o casing bate). Para campos free-text, usar `.ilike()` que é case-insensitive.
- Não quebrar nenhum dos filtros já existentes (evento, status, etiqueta, material, busca, paginação, impressão em lote, materiais entregues, marcação automática de impressão).
- Não alterar o schema do banco — apenas mudanças no client.

## Detalhes técnicos

```ts
// src/lib/dynamicFilterQuery.ts (novo)
import { KNOWN_FIELD_MAP } from "@/components/DynamicFieldFilters";
import type { ActiveFilter } from "@/components/DynamicFieldFilters";

export function applyDynamicFiltersToQuery(query: any, filters: ActiveFilter[]) {
  for (const f of filters) {
    const column = KNOWN_FIELD_MAP[f.fieldKey]; // string | undefined
    const path = column ?? `custom_fields->>${f.fieldKey}`;
    if (f.values && f.values.length > 0) {
      query = query.in(path, f.values);
    } else if (f.value) {
      query = query.ilike(path, `%${f.value.replace(/[%,]/g, "")}%`);
    }
  }
  return query;
}
```

(Exportar `KNOWN_FIELD_MAP` de `DynamicFieldFilters.tsx`.)

## Arquivos afetados

- `src/components/DynamicFieldFilters.tsx` — exportar `KNOWN_FIELD_MAP`.
- `src/lib/dynamicFilterQuery.ts` — novo helper.
- `src/pages/admin/AdminRegistrations.tsx` — aplicar helper em `buildRegistrationsQuery`, no `fetchAllPages` da impressão em lote e do relatório PDF; adicionar `dynamicFilters` aos useEffect de reset/load.

## Resultado esperado

Filtrando por "Área = Área 6":

- Topo mostra **"12 resultados"** (apenas os da Área 6).
- Botão **"Imprimir etiquetas (12)"**.
- Paginação aparece só se passar de 50 (provavelmente fica em uma página só).
- Tabela lista exclusivamente os 12 inscritos da Área 6.
- Impressão em lote gera as 12 etiquetas exatamente.
