## Objetivo

Aplicar 15 correções pontuais de segurança, qualidade e bugs, sem refatorar nada além do especificado. Confirmei previamente que `SITE_NAME`/`SITE_DESCRIPTION` não são importados em lugar nenhum (só definidos em `constants.ts`), então a Mudança 14 é segura.

## Escopo (exatamente o que foi pedido)

**Frontend**
1. `src/integrations/supabase/client.ts` — credenciais via `import.meta.env` + guard.
2. `src/pages/RegistrationPage.tsx` — adicionar `submittingRef.current = false;` antes dos 9 `return;` precoces (A–I) entre as linhas 377 e 435.
3. `src/pages/RegistrationPage.tsx` — mover `const isMobileTouch = isTouchDevice();` do escopo de módulo para dentro do componente.
4. `src/pages/OrderStatusPage.tsx` — `clearInterval` quando `payment_status !== "pending"` e bump do polling para 15000 ms.
5. `src/App.tsx` — só a config do `QueryClient` (retry condicional, staleTime 30s, refetchOnWindowFocus: false).
6. `src/lib/constants.ts` — remover `SITE_NAME` e `SITE_DESCRIPTION`.
7. `index.html` — remover comentários TODO; corrigir "instituo"→"Instituto", "Pagina"→"Página", "promovido"→"promovidos" nas 3 descriptions; trocar author/twitter:site para INCITH/@incith.
8. Limpeza de `console.log`/`console.warn` de debug (mantendo `console.error` e `console.warn` em catch de reconciliação) em:
   - `src/pages/admin/AdminOrders.tsx`
   - `src/pages/admin/AdminRegistrations.tsx`
   - `src/pages/admin/AdminCertificates.tsx`
   - `src/pages/admin/AdminCheckin.tsx`
   - `src/components/PaymentProofUpload.tsx`
   - `src/components/CertificateVisualEditor.tsx`

**Edge Functions**
9. `supabase/functions/seed-checkin-operator/index.ts` — bump SDK para 2.99.0 e ler `CHECKIN_OPERATOR_EMAIL/PASSWORD/NAME` do env (com fallback).
10. `supabase/functions/cancel-order/index.ts` — bump SDK para 2.99.0 + CORS `APP_URL`.
11. `supabase/functions/issue-all-certificates/index.ts` — bump SDK para 2.99.0.
12. `supabase/functions/manual-confirm-order/index.ts` — CORS `APP_URL`.
13. `supabase/functions/bulk-confirm-orders/index.ts` — CORS `APP_URL`.
14. `supabase/functions/review-payment-proof/index.ts` — CORS `APP_URL`.

**Tooling**
15. `vite.config.ts` + `package.json` — remover `lovable-tagger` (import, plugin e devDependency).

## Pontos de atenção (sem alterar o pedido)

- **Mudança 12/13 (lovable-tagger)**: o pacote é usado pelo editor da Lovable para destacar componentes no preview. Removê-lo não quebra build/runtime, mas reduz a integração visual no editor. Aplicarei conforme pedido.
- **Mudança 6 (CORS APP_URL)**: hoje `APP_URL` é `https://incitheventos.lovable.app`. Chamadas vindas do preview de desenvolvimento (`id-preview--…lovable.app`) passarão a ser bloqueadas pelas 4 funções admin. Aceitável dado o escopo (admin-only em produção), apenas registrando.
- **Mudança 1 (env guard)**: o `throw` no boot impede a app de subir se as variáveis sumirem. Como o `.env` é populado automaticamente pelo Lovable, é seguro.
- **Mudança 7**: vou localizar cada um dos 9 `return;` por correspondência exata do texto, sem renumerar nem reformatar linhas vizinhas.

## Validação final

- Confirmar build sem erros de tipo após todas as edições.
- Não tocar em rotas, schema, tipos, estilos, ordem de campos, lógica de pagamento/check-in/certificados.

Pronto para executar tudo numa única passada quando aprovado.
