## Objetivo

No relatório "Lista geral" (PDF), sempre que a coluna **Área** estiver entre as colunas selecionadas, os inscritos devem sair ordenados em ordem **crescente de área** (ex.: ÁREA 1, ÁREA 2, ÁREA 8, ÁREA 9, ÁREA 12, ÁREA 26 — comparação numérica natural, não alfabética).

## Mudança

### `src/pages/admin/AdminRegistrations.tsx` — `handleDownloadReport`

Antes de chamar `generateEventReportPdf`, detectar se alguma coluna selecionada representa "área":

- coluna fixa: `key === "area"`, **ou**
- coluna dinâmica (`cf:<field_key>`) cujo `field_key` normalizado contenha `"area"` (mesma regra de `isDuplicateOfFixed`).

Se sim, criar uma cópia ordenada de `allFiltered` usando a função `getValue` da própria coluna de área (assim respeita a prioridade `custom_fields` > coluna fixa que já está em `resolveFixed`).

Comparador: extrair o **primeiro número** do valor (`/(\d+)/`) e comparar numericamente; valores sem número vão para o fim, em ordem alfabética como desempate. Empates de número desempatam pelo nome (`full_name`) para estabilidade.

```ts
const areaCol = allExtras.find(c =>
  c.key === "area" ||
  (c.key.startsWith("cf:") && normKey(c.key.slice(3)).includes("area"))
);
const useAreaCol = areaCol && extraColsKeys?.has(areaCol.key) ? areaCol : null;

const ordered = useAreaCol
  ? [...allFiltered].sort((a, b) => {
      const va = useAreaCol.getValue(a) || "";
      const vb = useAreaCol.getValue(b) || "";
      const na = parseInt((va.match(/\d+/) || [""])[0], 10);
      const nb = parseInt((vb.match(/\d+/) || [""])[0], 10);
      const aHas = !isNaN(na), bHas = !isNaN(nb);
      if (aHas && bHas && na !== nb) return na - nb;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      const cmp = va.localeCompare(vb, "pt-BR");
      return cmp !== 0 ? cmp : a.full_name.localeCompare(b.full_name, "pt-BR");
    })
  : allFiltered;
```

Passar `ordered` (em vez de `allFiltered`) para `generateEventReportPdf`.

## Não-regressão

- Se "Área" não estiver selecionada, comportamento atual (ordem por `created_at desc` vinda do backend) é preservado.
- Relatório agrupado e quantitativo não são afetados (já agrupam por área internamente).
- Filtros aplicados continuam valendo: a ordenação acontece sobre o conjunto já filtrado.
