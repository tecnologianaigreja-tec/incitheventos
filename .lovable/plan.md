## Problem

In "Consultar minhas inscrições" → click **Pagar** on an unpaid registration, the user is taken back to the registration form ("preencher os dados novamente") instead of the InfinitePay checkout link.

## Root cause (confirmed)

This is the same underlying bug as the previous report. The Edge Function logs for `create-checkout` show InfinitePay returning **HTTP 422**:

```
"customer":{"email":["must be filled"]}
```

with payload `"customer":{"name":"MARINHO ...","email":""}`.

Sequence:

1. The participant form has e-mail as **optional** (`RegistrationPage.tsx` ~line 218: `placeholder="seu@email.com (opcional)"`).
2. User submits without an e-mail → `create-checkout` calls InfinitePay with empty `customer.email` → InfinitePay rejects with 422 → `generatePaymentLink` returns `null` → the order row is created with `payment_link = NULL`.
3. Later, in `EventsListPage.tsx` (lines 540-545), the "Pagar" button does:
   ```ts
   if (order.payment_link) window.location.href = order.payment_link;
   else navigate(`/evento/${slug}/inscricao`);  // ← falls back to the form
   ```
   Since `payment_link` is `NULL`, it sends the user back to the form. That's the symptom the user is seeing.

So the visible bug ("leva para preencher os dados de novo") is caused by the *missing* payment link, not by the "Pagar" button being wrong.

## Fix (two layers — preventive + recovery)

### 1. Make buyer e-mail required (preventive) — same as previous fix

`src/pages/RegistrationPage.tsx`:

- **Individual flow**: require + validate `email` (treat the participant as the buyer).
- **Batch flow, buyer is participant**: require + validate `email` on the buyer.
- **Batch flow, buyer is NOT participant** (`BuyerOnlySection`): add an **E-mail** input and require + validate it.
- Keep `email` optional for non-buyer batch participants (current behavior).
- Update labels: drop "(opcional)" when the field belongs to the buyer.

`supabase/functions/create-checkout/index.ts`:

- After computing `buyer_email`, if it is empty or invalid, return **HTTP 400** with `"E-mail do responsável é obrigatório para o pagamento."` instead of letting the InfinitePay request fail silently with 422.

### 2. Regenerate the payment link on demand (recovery) — fixes existing broken orders

This is essential because there are already orders in the DB with `payment_link = NULL` from previous failed attempts. We must NOT send those users back to the form.

`supabase/functions/create-checkout/index.ts` — extend the existing **resume path** (currently only triggers when re-submitting the form for the same single CPF) so it can also be invoked by a "regenerate link" call. Concretely, accept an alternative payload shape:

```json
{ "regenerate_for_order_id": "<uuid>" }
```

When this is provided:
- Look up the order, its event, and its registrations.
- Reject if `payment_status !== "pending"`.
- If `payment_link` exists, return it.
- Otherwise call `generatePaymentLink(...)` exactly like the normal flow, persist `payment_link` on the order, and return `{ order_code, payment_link }`.
- If the buyer e-mail on the existing order is empty/invalid (legacy data), return 400 with a clear message asking the user to update via support — InfinitePay still won't accept an empty email even on retry.

`src/pages/EventsListPage.tsx` (the "Pagar" button, ~lines 483-545):

Replace the current "if no link → navigate to form" fallback with:

```text
if order.payment_link → redirect to it
else
  call create-checkout with { regenerate_for_order_id: r.order_id }
  if it returns a payment_link → redirect
  else → toast the returned error message (do NOT bounce to the form)
```

For the **batch** branch, behavior stays the same (the split-batch-payment flow already regenerates its own per-participant link). Only the **individual** branch (line 540-545) changes.

### 3. No DB / RLS / migration changes

Pure code-level fix. `payment_link` is already nullable on `orders`.

## What stays the same (no regressions)

- Order code, registration code, NSU, audit logs, webhook, reconcile poller, OrderStatusPage polling, batch split flow, CPF uniqueness, pending-resume on re-submit, "Aguardando pagamento" page, all admin tabs (Inscritos filter + material delivered toggle), label printing, dynamic filters — all untouched.

## Files to modify

- `src/pages/RegistrationPage.tsx` — make buyer e-mail required (individual + batch buyer + buyer-only section); add e-mail input to `BuyerOnlySection`.
- `supabase/functions/create-checkout/index.ts` — server-side guard for empty/invalid buyer e-mail; new `regenerate_for_order_id` branch that re-creates the InfinitePay link for an existing pending order.
- `src/pages/EventsListPage.tsx` — in the individual "Pagar" button, when `payment_link` is missing, call `create-checkout` with `regenerate_for_order_id` and redirect to the returned link (instead of sending the user back to the form).
