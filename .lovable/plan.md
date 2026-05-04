## Diagnóstico

Confirmei no banco que as inscrições têm os dados em `custom_fields` com estas chaves:

- `ÁREA DE CONG. A QUE PERTENCE` → "ÁREA 13"
- `FUNÇÃO MINISTERIAL` → "AUXILIAR" / "MEMBRO" / "DIÁCONO" / "PRESBÍTERO"
- `DEPARTAMENTO` → "HOMENS" / "JOVENS" / etc.
- `CONGREGAÇÃO` → texto livre
- `telefone` → "(91) ..."

O agrupamento por **Área** funciona porque `getFieldValue(r, "area")` normaliza para `"area"` e a chave dinâmica `"ÁREA DE CONG. A QUE PERTENCE"` normaliza para `"areadecongaquepertence"`, que **contém** `"area"` — match feito por `findInCustomFields`.

O subagrupamento por **Função ministerial** falha porque:

1. `getFieldValue(r, "church_function")` é chamado.
2. `resolveKnownField("church_function")` normaliza para `"churchfunction"`, que **não** contém `"funcao"`, então retorna `undefined` (a função só mapeia rótulos PT-BR como "funcao_eclesiastica", não a própria coluna canônica).
3. Sem fallback semântico, `findInCustomFields` tenta casar `"churchfunction"` contra `"funcaoministerial"` — não bate.
4. Resultado: `(não informado)` para todos.

O mesmo bug afeta:

- `church_role` (chave dinâmica usual: `DEPARTAMENTO` / `CARGO`).
- `congregation` (chave dinâmica: `CONGREGAÇÃO`, normaliza `"congregacao"` ≠ `"congregation"`).

`area` funciona por coincidência de substring; os demais não.

## Mudança

### `src/pages/admin/AdminRegistrations.tsx`

Introduzir um resolver semântico local que, dado um nome de coluna fixa, procura em `custom_fields` por qualquer chave cujo normalizado **contenha** algum dos tokens semânticos correspondentes (além de checar a coluna fixa primeiro):

```ts
const SEMANTIC_TOKENS: Record<string, string[]> = {
  area:            ["area"],
  church_function: ["funcaoministerial", "funcao"],
  church_role:     ["departamento", "cargo", "ministerio"],
  congregation:    ["congregacao", "congregation", "igreja"],
  phone:           ["telefone", "celular", "whatsapp", "phone"],
  birth_date:      ["datanascimento", "nascimento", "birthdate"],
};

function resolveFixed(r: RegistrationData, col: keyof RegistrationData): string {
  const direct = (r[col] as string) || "";
  if (direct) return direct;
  const cf = (r.custom_fields && typeof r.custom_fields === "object") ? r.custom_fields as Record<string, any> : {};
  const tokens = SEMANTIC_TOKENS[col as string] || [String(col)];
  for (const [k, v] of Object.entries(cf)) {
    if (v == null || v === "") continue;
    const nk = normalizeKey(k);
    if (tokens.some(t => nk.includes(t))) return String(v);
  }
  return "";
}
```

Substituir os `getValue: r => getFieldValue(r, "...")` em **`EXTRA_FIXED_COLUMNS`** e **`GROUP_FIXED_FIELDS`** por `resolveFixed(r, "...")` para os campos: `phone`, `birth_date`, `congregation`, `area`, `church_role`, `church_function`.

A função `normalizeKey` é definida internamente (ou importada como helper já existente em `DynamicFieldFilters`).

### Não-regressão

- `getFieldValue` em si **não muda**, mantendo filtros dinâmicos atuais intactos.
- Eventos onde a coluna fixa está populada continuam priorizando-a (resolver checa direct primeiro).
- O agrupamento por **Área** continua funcionando (token `"area"` ainda casa).
- Nenhuma alteração de schema, RLS, edge functions, ou outros telas (Dashboard, Pedidos, Check-in, Certificados).

## Resultado esperado

Refazendo o relatório quantitativo agrupado por **Área** + subagrupado por **Função ministerial**, cada Área passa a listar a quebra real: AUXILIAR, MEMBRO, DIÁCONO, PRESBÍTERO, etc., com contagens e receita corretas.
