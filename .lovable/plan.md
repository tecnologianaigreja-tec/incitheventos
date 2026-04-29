# Plano: Edição de inscritos + Editor de etiquetas DK-1201

## Parte 1 — Painel de Inscritos: Descredenciar e Editar

Em `src/pages/admin/AdminRegistrations.tsx`, dentro do `Dialog` de detalhes:

### 1.1 Descredenciar
- Botão visível apenas quando `checkin_status === "checked_in"`.
- Confirmação via `AlertDialog`.
- Ação:
  - `UPDATE registrations SET checkin_status='not_checked_in', checkin_at=null, checkin_by_user_id=null`
  - **DELETE** dos registros em `checkin_logs` referentes a essa inscrição (sem manter histórico, conforme solicitado).
  - Registra em `audit_logs` (`action='registration_uncheckin'`) — apenas auditoria administrativa, não no log de check-in.

### 1.2 Editar dados
- Botão "Editar" no Dialog → alterna para modo de formulário.
- **Bloqueados (read-only):** `email`, `cpf`.
- **Editáveis:** `full_name`, `phone`, `birth_date`, `area`, `congregation`, `church_role`, `church_function` + todos os campos dinâmicos (`custom_fields`).
- Validação: nome obrigatório, telefone formatado.
- `UPDATE registrations` + `audit_logs` (`action='registration_edited'`, com diff em `details`).

## Parte 2 — Editor visual de Etiquetas (DK-1201, único e global)

### 2.1 Especificações
- Brother DK-1201 — 29 mm × 90,3 mm (paisagem útil ~ 87 mm × 27 mm).
- Layout em mm absolutos; impressão via `@page { size: 90.3mm 29mm; margin: 0 }`.

### 2.2 Tabela `label_template` (singleton global)
Migration:
```sql
create table public.label_template (
  id uuid primary key default gen_random_uuid(),
  width_mm numeric not null default 90.3,
  height_mm numeric not null default 29,
  elements jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.label_template enable row level security;
create policy "Select label_template" on public.label_template for select using (true);
create policy "Admins manage label_template" on public.label_template for all to authenticated
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
-- seed: insert into public.label_template (elements) values ('[]'::jsonb);
```
Sempre lemos/escrevemos a única linha existente (singleton).

Estrutura de cada elemento em `elements`:
```json
{
  "id": "uuid",
  "type": "text" | "qrcode",
  "x_mm": 5, "y_mm": 4,
  "width_mm": 30, "height_mm": 8,
  "font_size_pt": 11,
  "font_weight": "bold" | "normal",
  "align": "left|center|right",
  "source": "full_name" | "registration_code" | "congregation" | "church_role" | "church_function" | "area" | "qr_token" | "custom:<field_key>" | "static",
  "static_text": null
}
```

### 2.3 Editor visual — `/admin/configuracoes/etiquetas`
- Item adicionado no `AdminLayout` (sub-rota das Configurações ou item dedicado "Etiquetas").
- Novo arquivo `src/pages/admin/AdminLabelEditor.tsx`:
  - Canvas escalonado (4 px = 1 mm) representando 90,3 × 29 mm com borda/régua.
  - Toolbar: "Adicionar texto", "Adicionar QR Code", "Salvar", "Pré-visualizar".
  - Cada elemento arrastável e redimensionável (lib `react-rnd`).
  - Painel lateral por elemento selecionado:
    - **Origem do dado**: dropdown unificando campos fixos + união de `event_form_fields` ativos de **todos os eventos** (já que template é global) + opção "Texto fixo".
    - Tamanho da fonte, peso, alinhamento (apenas texto).
    - Posição/dimensões em mm (inputs numéricos).
  - Botão "Pré-visualizar" mostra a etiqueta com dados de exemplo.

### 2.4 Renderização para impressão
Novo arquivo `src/lib/labelRenderer.tsx`:
- Função `printLabels(registrations, template, customFieldsMap)`:
  1. Abre `window.open('', '_blank')`.
  2. Escreve HTML com `@page { size: 90.3mm 29mm; margin: 0 }`, `body { margin:0 }`.
  3. Uma `<div>` por etiqueta com `width:90.3mm; height:29mm; page-break-after:always; position:relative`.
  4. Cada elemento posicionado em `mm` absoluto.
  5. QR Code: SVG inline gerado com lib `qrcode` (a partir de `registration.qr_token`).
  6. Resolve valores: campos fixos diretos; custom via `registration.custom_fields[field_key]`.
  7. Chama `window.print()` automaticamente; fecha no evento `afterprint`.
- Para Brother QL: o usuário define a impressora térmica como destino padrão na primeira impressão. Como o `@page` define o tamanho exato, a impressora corta corretamente cada etiqueta.

### 2.5 Botões em `AdminRegistrations.tsx`

**Individual** (na linha + Dialog):
- "Imprimir etiqueta" → `printLabels([reg], template)`.

**Lote**: botão "Imprimir etiquetas (N)" acima da tabela:
- Imprime **todos os filtrados** atualmente (`filtered`), respeitando todos os filtros já existentes (busca, evento, status, filtros dinâmicos).
- Confirmação com a contagem antes de abrir a janela.
- Aviso se algum inscrito do lote estiver sem `qr_token` (pendente de pagamento) — opção de prosseguir mesmo assim ou pular esses registros.

## Detalhes técnicos

- Novas dependências:
  - `react-rnd` — drag/resize no editor.
  - `qrcode` — geração de SVG do QR para a janela de impressão (sem React).
- `qr_token` só existe após pagamento aprovado. Para pendentes, etiqueta pode ser impressa sem QR (espaço em branco) ou com aviso — comportamento: **pular do lote por padrão e listar quais foram pulados**.
- `audit_logs` populado em descredenciamento e edição.

## Arquivos afetados

**Novos:**
- `supabase/migrations/<ts>_label_template.sql`
- `src/pages/admin/AdminLabelEditor.tsx`
- `src/lib/labelRenderer.tsx`
- `src/components/EditRegistrationDialog.tsx`

**Modificados:**
- `src/pages/admin/AdminRegistrations.tsx` — Descredenciar, Editar, Imprimir (individual + lote).
- `src/pages/admin/AdminLayout.tsx` — item "Etiquetas".
- `src/App.tsx` — rota `/admin/etiquetas`.
- `src/lib/types.ts` — `LabelTemplate`, `LabelElement`.
- `package.json` — `react-rnd`, `qrcode`.
