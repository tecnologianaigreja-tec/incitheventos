## Problema identificado

O filtro "ÁREA DE CONG. A QUE PERTENCE" (e qualquer outro campo customizado armazenado em `custom_fields` JSONB) não retorna resultados na tela **Check-in** ao selecionar um valor.

### Causa raiz

A tela `AdminCheckin.tsx` aplica os filtros **no servidor** via `applyDynamicFiltersToQuery`, que monta um path tipo:

```
custom_fields->>ÁREA DE CONG. A QUE PERTENCE 
```

Esse `field_key` real do banco contém **acentos, espaços e até espaço final**. O PostgREST (cliente Supabase JS) não consegue serializar corretamente esse caminho em `.in(path, values)` / `.ilike(path, ...)`, então a query devolve 0 linhas mesmo havendo participantes com aquela área.

A tela `AdminRegistrations` **não tem esse problema** porque aplica os filtros no **cliente** com `applyDynamicFilters`, que usa `getFieldValue` — função que já normaliza chaves (remove acentos, espaços, etc.) e procura corretamente no JSONB.

Confirmado no banco:
- `field_key` registrado: `"ÁREA DE CONG. A QUE PERTENCE "` (com espaço final)
- Valor armazenado em `registrations.custom_fields` sob a mesma chave exata
- Filtro server-side falha; filtro client-side funciona

## Solução

Alinhar a tela de Check-in à mesma estratégia (já validada e funcionando) usada em `AdminRegistrations`: **filtragem no cliente** sobre o conjunto de check-ins, mantendo paginação local.

### Mudanças em `src/pages/admin/AdminCheckin.tsx`

1. **Remover** o uso de `applyDynamicFiltersToQuery` no `loadCheckedIn`.
2. **Buscar todos os check-ins** com `fetchAllPages` (mesmo padrão de `AdminRegistrations`) — sem range na query base, apenas filtros simples (status + busca textual).
3. **Aplicar `applyDynamicFilters` no cliente** sobre o array completo, depois paginar localmente (slice por `PAGE_SIZE`).
4. **`totalCount`** passa a refletir o tamanho do array já filtrado (mantém o card "Presentes (filtro aplicado)" correto).
5. Remover a variável morta `filteredCheckedIn = applyDynamicFilters(checkedIn, [])` (passa a usar diretamente a lista paginada).

### O que NÃO muda (preservar funcionalidades existentes)

- Scanner de câmera, beep, idempotência de check-in: intactos.
- Busca textual por nome / e-mail / CPF: continua igual.
- Filtros dos campos fixos (Área, Congregação, Cargo, Função) — continuam funcionando, agora via mesmo caminho do client-side.
- Tela `AdminRegistrations` não é tocada.
- `applyDynamicFiltersToQuery` permanece no projeto (não removemos para não impactar outros possíveis usos), apenas deixa de ser chamado pelo Check-in.

## Detalhes técnicos

```ts
// Nova lógica de loadCheckedIn (resumo)
const all = await fetchAllPages<RegistrationData>(() => {
  let q = supabase.from("registrations")
    .select("*")
    .eq("checkin_status", "checked_in")
    .order("checkin_at", { ascending: false });
  if (debouncedSearch) {
    const escaped = debouncedSearch.replace(/[%,]/g, "");
    q = q.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,cpf.ilike.%${escaped}%`);
  }
  return q;
});

const filtered = applyDynamicFilters(all, dynamicFilters);
setTotalCount(filtered.length);

const from = (page - 1) * PAGE_SIZE;
setCheckedIn(filtered.slice(from, from + PAGE_SIZE));
```

## Validação pós-implementação

1. Selecionar "ÁREA DE CONG. A QUE PERTENCE" → "ÁREA 7" → lista deve mostrar somente os participantes da Área 7 e o contador refletir esse total.
2. Combinar com outros filtros (DEPARTAMENTO, FUNÇÃO MINISTERIAL) → devem se aplicar em conjunto (AND).
3. Busca textual + filtro dinâmico simultâneos → ambos atuam.
4. Paginação navega corretamente sobre o resultado filtrado.
5. Check-in via QR e manual seguem funcionando, atualizam a lista.
