# Limpeza definitiva de duplicatas + correção do badge "Pendente" incorreto

## Diagnóstico

### 1. Banco de dados (verificado)
A Sara Costa tem **1 inscrição pendente + 4 canceladas** (não 4 pendentes como aparenta na tela). O banco está correto, mas:
- Existem **11 inscrições canceladas** no banco que são duplicatas redundantes (mesmo CPF + mesmo evento + outra inscrição ativa). Devem ser apagadas para limpar o histórico.
- Casos identificados:
  - **Sara Costa (85519758204):** 4 canceladas redundantes → apagar, manter o pending mais antigo.
  - **CPF 05219260251:** 2 canceladas redundantes → apagar, manter o confirmed.
  - **CPF 58972897272:** 1 cancelada redundante → apagar, manter o confirmed.
  - **CPFs 45266409304, 71092277234, 04218980209, 04954054265:** 1 cancelada cada → apagar, manter o pending mais antigo.
  - **CPF 73658146249:** 2 confirmados (caso especial já flagged em revisão manual) — **NÃO mexer**.

### 2. Bug visual (verificado em `AdminRegistrations.tsx:286-288`)
A coluna "Status pagamento" só verifica `payment_status === "approved"`. Como uma inscrição cancelada tem `payment_status = "canceled"` (não "approved"), cai no `else` e mostra "Pendente" — daí a impressão de "4 Saras pendentes" na tela. Precisa exibir "Cancelado" quando o `registration_status` for `canceled`.

### 3. Bloqueio na nova inscrição (já implementado, verificado)
O fluxo de bloqueio "você já tem cadastro, vá pagar" **já existe** desde a entrega anterior:
- `create-checkout` retorna **409** quando detecta CPF com inscrição `pending_payment` ou `confirmed` (`code: "duplicate_pending"` ou `"duplicate_confirmed"`).
- O `RegistrationPage` já abre um modal direcionando para "Consultar minha inscrição".
- O trigger `trg_prevent_duplicate_active_registration` no banco bloqueia mesmo se o frontend falhar.
- **Não há retrabalho aqui** — vou apenas confirmar o teste após a limpeza.

## O que será feito

### Migration: `cleanup_canceled_duplicates`
Apaga **definitivamente** (`DELETE`) as 11 inscrições canceladas que são duplicatas redundantes, com salvaguardas:

```sql
DO $$
DECLARE victim RECORD; affected_orders uuid[] := ARRAY[]::uuid[];
BEGIN
  FOR victim IN
    SELECT r.id, r.order_id, r.cpf, r.event_id, r.full_name
    FROM public.registrations r
    WHERE r.registration_status = 'canceled'
      AND EXISTS (
        SELECT 1 FROM public.registrations r2
        WHERE r2.cpf = r.cpf AND r2.event_id = r.event_id AND r2.id <> r.id
      )
      AND NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.registration_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM public.checkin_logs cl WHERE cl.registration_id = r.id)
  LOOP
    INSERT INTO public.audit_logs(action, entity_type, entity_id, details)
    VALUES('duplicate_canceled_registration_purged','registration',victim.id, ...);
    DELETE FROM public.registrations WHERE id = victim.id;
    -- track affected orders
  END LOOP;
  -- delete now-orphan canceled orders
END $$;
```

**Garantias de segurança:**
- ✅ NUNCA toca em `confirmed` (paga).
- ✅ NUNCA toca em inscrição única (só apaga se houver outra para o mesmo CPF+evento).
- ✅ NUNCA apaga registro com certificado emitido ou check-in (validado: 0 casos bloqueantes).
- ✅ Cada exclusão fica rastreada em `audit_logs`.
- ✅ Pedidos órfãos (sem nenhuma inscrição restante) e já cancelados também são removidos.

### Correção visual em `AdminRegistrations.tsx`
No badge da coluna "Status pagamento":
- Se `registration_status === 'canceled'` → mostrar **"Cancelado"** (variant destructive).
- Senão, comportamento atual (`Pago` / `Pendente`).

## Resultado esperado
- Sara Costa terá **apenas 1 linha** na tela (pendente), com botão "Pagar" funcional.
- 10 demais linhas duplicadas dos outros CPFs também desaparecem.
- Tela do admin passa a mostrar corretamente "Cancelado" para qualquer registro cancelado que ainda exista (ex.: alguém que pagou individualmente saindo de um lote — o registro do lote original fica como cancelado).
- Tentativa de re-cadastro por CPF já registrado continua bloqueada com mensagem clara (já implementado).

## Arquivos afetados
- **Nova migration** (apaga 11 linhas, registra em audit_logs).
- `src/pages/admin/AdminRegistrations.tsx` — ajuste do badge.

## Não será feito
- Não tocaremos no caso especial de 2 confirmados do CPF 73658146249 (precisa decisão humana — qual dos dois recibos é o correto).
- Não mudaremos o trigger nem a lógica de checkout (já estão certos).
