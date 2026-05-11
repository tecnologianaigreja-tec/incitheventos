## Objetivo

Aplicar duas refatorações estruturais sem mudar comportamento, visual, rotas, schema, tipos ou dependências.

---

## PARTE A — Módulo compartilhado nas Edge Functions

### A1. Criar `supabase/functions/_shared/approveOrder.ts`
Novo módulo com a função `approveOrder({ supabase, order, source, actorId, externalEventId, rawPayload, eventType })` exatamente como especificado no prompt. Centraliza:
1. update do `orders` (status, paid_at, webhook_status_last_seen, updated_at)
2. confirmação de `registrations` + geração condicional de `qr_token`
3. insert em `payment_events`
4. insert em `audit_logs`

Retorna `{ confirmedCount }`.

### A2. `manual-confirm-order/index.ts`
- Importar `approveOrder` do `../_shared/approveOrder.ts`.
- Substituir o bloco "Apply approval" (do update do order até o `audit_logs.insert`) por uma única chamada a `approveOrder` com `source: "manual_confirmation"`.
- Ajustar `return respond` para usar `confirmedCount`.
- Manter intactos: auth, validações, parsing do body.

### A3. `bulk-confirm-orders/index.ts`
- Importar `approveOrder`.
- Dentro do loop `for (const order of orders)`, substituir todo o bloco (update order + confirm regs + payment_events + audit_logs) por uma chamada a `approveOrder` com `source: "manual_bulk"` e `eventType: "manual_bulk_confirmation"`.
- Manter o `results.push({...ok: true, confirmed})` e o early-return de orders não-pending.

### A4. `review-payment-proof/index.ts`
- Importar `approveOrder` do shared.
- Remover a função local `approveOrder` (linhas 18–71).
- Substituir a chamada existente por `approveOrder({ supabase, order, source: "proof_approved", externalEventId: \`proof:${proofId}\`, ... })`, atribuindo `confirmedCount` da resposta.
- Manter intactos: fluxo de reject, update do `payment_proofs`, audit do reject.

### A5. `reconcile-payment/index.ts`
- Importar `approveOrder` do shared.
- Remover a função local `applyApproval` (linhas 97–158).
- Substituir cada chamada `applyApproval(...)` (há 1 chamada na linha 243) por `approveOrder({ supabase, order, source: "reconciliation:<source-original>", rawPayload: { paid_amount, raw }, eventType: "reconciliation:<source-original>" })`.
- Manter intacta a lógica de consulta à API InfinitePay e scan_all.

### A6. `payment-webhook/index.ts` (mudança PARCIAL)
- Importar `approveOrder` (mesmo que não usado por inteiro — para consistência futura, opcional; **não** usar a função compartilhada aqui porque o webhook tem update próprio com `payment_provider_reference`).
- Substituir APENAS o bloco de confirmação de registrations (linhas 242–268) pela versão que **preserva `qr_token` existente** (gera UUID só se vazio).
- Manter intactos: update do order, tratamento de canceled/refused, insert em `payment_events` e `audit_logs`.

---

## PARTE B — Decomposição de god components

### B1. `src/components/CpfLookupDialog.tsx` (novo)
Mover do `EventsListPage.tsx` (linhas ~466–803 + dialog de split ~898–961):
- States: `cpfInput`, `lookupLoading`, `registrations`, `selectedReg`, `certByRegId`, `downloadingCertId`, `splitDialogReg`, `splitOrder`, `splitPreview`, `splitPreviewLoading`, `splitLoading`.
- Funções: `handleCpfLookup`, `handleSplitPayment`, `handleDownloadCertificate`, `handleDownloadCredential`.
- JSX: Dialog principal (lista + card credencial) e Dialog de split.
- Props: `open: boolean`, `onOpenChange: (open: boolean) => void`.
- Em `EventsListPage.tsx`: remover imports/states/handlers que migraram; renderizar `<CpfLookupDialog open={lookupOpen} onOpenChange={setLookupOpen} />`.

### B2. `src/components/admin/ReportDialogs.tsx` (novo)
Mover do `AdminRegistrations.tsx` (linhas 978–1101) os dois Dialogs (geral + quantitativo).
- States internos: `selectedExtraCols`, `groupByKey`, `subGroupByKey`, `groupScope`.
- Props: `generalReportOpen`, `onGeneralReportOpenChange`, `groupedReportOpen`, `onGroupedReportOpenChange`, `extraFixedColumns`, `dynamicExtraColumns`, `groupFixedFields`, `dynamicGroupFields`, `generatingReport`, `onDownloadReport`, `onDownloadGroupedReport`.
- Manter a ordenação alfabética de "área" já existente no callback.

### B3. `src/components/admin/RegistrationDetailDialog.tsx` (novo)
Mover do `AdminRegistrations.tsx` (linhas 837–897) o Dialog "Ficha do Inscrito".
- Props: `registration`, `onClose`, `customFields`, `fixedDetails`, `onEdit`, `onPrint`, `onUnmarkPrinted`, `onToggleMaterial`, `onUncheckin`, `printing`.
- JSX idêntico ao original.

---

## Garantias

- HTML/JSX final IDÊNTICO ao atual.
- Zero mudança em tipos, rotas, schema, dependências, estilos.
- Build TypeScript verde após cada extração.
- Verificações manuais: lista de eventos, Consulta por CPF, painel admin, listagem de inscritos, ficha do inscrito, relatórios geral e quantitativo, ordenação por área no relatório geral, fluxos de aprovação manual/bulk/proof/reconcile/webhook.

Pronto para executar quando aprovado.