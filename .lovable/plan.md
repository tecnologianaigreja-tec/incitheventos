## Diagnóstico

Caso do Gustavo (CPF 06067364255) no banco:

- Coluna fixa `area` = **"Ministério"** (gravado pelo select fixo do dialog, cuja lista é hard-coded em `constants.ts`)
- `custom_fields["ÁREA DE CONG. A QUE PERTENCE "]` = **"ÁREA 9"** (valor real do formulário)

Quando você filtra por **"ÁREA DE CONG. A QUE PERTENCE = ÁREA 9"**, o `getFieldValue` faz:
1. Normaliza a chave → contém `"area"` → mapeia para coluna fixa `area`.
2. Lê `reg.area` = `"Ministério"` e retorna **sem checar `custom_fields`**.
3. `"Ministério"` ≠ `"ÁREA 9"` → Gustavo sai do resultado.

Causa raiz: o dialog **Editar inscrito** mostra selects fixos (Área, Congregação, Cargo, Função) com listas hard-coded que **não correspondem** aos campos dinâmicos do evento. Isso suja a coluna fixa e gera conflito com os campos personalizados.

## Mudança

### 1. `src/components/EditRegistrationDialog.tsx` — remover bloco de campos fixos

Remover do dialog os 4 selects fixos: **Área**, **Congregação**, **Cargo**, **Função**. Manter apenas:

- Nome completo (editável)
- CPF (read-only)
- E-mail (read-only)
- Telefone (editável)
- Data de nascimento (editável)
- **Campos personalizados** (já listados pelo bloco existente, lendo de `event_form_fields`)

No `handleSave`, parar de enviar `area`, `congregation`, `church_role`, `church_function` no UPDATE — só atualizar `full_name`, `phone`, `birth_date` e `custom_fields`. As colunas fixas existentes não são tocadas (preserva históricos), mas deixam de ser editadas/sobrescritas.

Remover também os imports não usados (`AREAS`, `CHURCH_ROLES`, `CHURCH_FUNCTIONS`, `Select*`).

### 2. `src/components/DynamicFieldFilters.tsx` — priorizar `custom_fields` em `getFieldValue`

Inverter a ordem de leitura: **primeiro** `custom_fields` (com normalização que tolera espaços/acentos no nome da chave, ex.: `"ÁREA DE CONG. A QUE PERTENCE "` com espaço final), e **só como fallback** a coluna fixa via `resolveKnownField`.

```ts
export function getFieldValue(reg: RegistrationData, fieldKey: string): string {
  const cf = ((reg as any).custom_fields && typeof (reg as any).custom_fields === "object")
    ? (reg as any).custom_fields : {};

  // 1. custom_fields PRIMEIRO (match literal + normalizado)
  const fromCustom = findInCustomFields(cf, fieldKey);
  if (fromCustom) return fromCustom;

  // 2. Fallback: coluna fixa
  const knownField = resolveKnownField(fieldKey);
  if (knownField) {
    const v = (reg[knownField] as string) || "";
    if (v) return v;
  }
  if ((reg as any)[fieldKey]) return (reg as any)[fieldKey];
  return "";
}
```

Em `findInCustomFields`, aplicar `key.trim()` antes de normalizar para tolerar o espaço final em chaves como `"ÁREA DE CONG. A QUE PERTENCE "`.

Isso faz o filtro client-side da aba Inscritos casar Gustavo corretamente em "ÁREA 9" e corrige todos os outros casos onde a coluna fixa diverge do dinâmico.

### 3. `src/pages/admin/AdminRegistrations.tsx` — relatórios já se beneficiam

`resolveFixed` (usado em `EXTRA_FIXED_COLUMNS` e `GROUP_FIXED_FIELDS`) já tem fallback para `custom_fields`. Ajustar para também priorizar `custom_fields` quando existir match semântico — alinha relatório quantitativo, agrupado e geral com o novo comportamento do filtro.

## Não-regressão

- Inscrições sem campos dinâmicos (eventos antigos com só colunas fixas) continuam funcionando: `findInCustomFields` retorna vazio → cai no fallback fixo.
- Auditoria (`audit_logs`) continua registrando o `before/after` do edit com as chaves remanescentes.
- Server-side `applyDynamicFiltersToQuery` (usado em outras telas) não muda; a aba Inscritos é client-side.
- Check-in, certificados, dashboard, pedidos: intocados.

## Resultado esperado

- Dialog **Editar inscrito** passa a mostrar somente nome, CPF, e-mail, telefone, data de nascimento e o bloco "Campos personalizados" (Área, Congregação, Departamento, Função ministerial, WhatsApp — exatamente o que o admin definiu no formulário).
- Filtrar por **"ÁREA DE CONG. A QUE PERTENCE = ÁREA 9"** lista Gustavo (e demais).
- Relatórios agrupados/quantitativos refletem corretamente os valores dos campos dinâmicos.
