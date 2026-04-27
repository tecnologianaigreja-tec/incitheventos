## Pagamento parcial de lote + bloqueio de duplicatas (com proteção total a inscrições pagas)

### GARANTIA CRÍTICA — inscrições confirmadas/pagas NUNCA serão apagadas

Antes de qualquer coisa: a Parte 1 (limpeza) **jamais** deleta nem cancela qualquer registration com `payment_status='approved'` OU `registration_status='confirmed'`. As regras abaixo são desenhadas para que, mesmo no caso raro de "2 confirmadas para o mesmo CPF" (José Gilmar), as duas sejam **mantidas** e apenas marcadas para revisão manual do admin — não é tarefa do script decidir qual confirmada apagar quando dinheiro real foi cobrado.

---

### PARTE 1 — Limpeza de duplicatas (super conservadora)

Para cada par `(cpf, event_id)` com mais de uma registration:

**Regra A — existe pelo menos 1 confirmada/paga:**
- **Mantém intactas TODAS as confirmadas/pagas** (não toca em nenhuma).
- Cancela apenas as registrations com status `pending_payment` desse CPF (porque já existe uma paga, a pendente é redundante).
- Se houver 2+ confirmadas para o mesmo CPF (caso José Gilmar), **NÃO mexe em nenhuma**. Apenas registra no `audit_logs` com `action='duplicate_confirmed_needs_review'` para o admin revisar manualmente. O script não decide.

**Regra B — só pendentes (nenhuma confirmada):**
- Mantém a pendente **mais antiga** (preserva o `order_id` original e o link de pagamento já gerado).
- Cancela as demais pendentes (mais recentes).

**Salvaguardas técnicas obrigatórias na migration:**
- A query de UPDATE terá cláusula explícita `WHERE registration_status = 'pending_payment' AND payment_status != 'approved'` — duplo filtro, defesa em profundidade.
- Antes do UPDATE, um `SELECT` de verificação contando quantas confirmadas seriam afetadas. Se o número for > 0, a migration **aborta com erro** (transaction rollback) sem aplicar nada.
- Toda a operação dentro de uma única transação BEGIN/COMMIT.
- Audit log de cada cancelamento com motivo `duplicate_cleanup_pending_only` e o ID da registration mantida.
- Para orders cujas registrations ficaram 100% canceladas, marcar order como `canceled` — mas **só** se nenhuma registration daquele order estiver confirmada (verificação extra).

**Resumo dos 8 casos do banco (após auditoria):**
| CPF | Antes | Depois |
|---|---|---|
| SARA COSTA (5 pend) | 5 pendentes | 1 mantida, 4 canceladas |
| Matheus Gomes (1 conf + 2 pend) | 1 confirmada + 2 pendentes | **1 confirmada intacta** + 2 canceladas |
| Claudiane (1 conf + 1 pend) | 1 confirmada + 1 pendente | **1 confirmada intacta** + 1 cancelada |
| José Gilmar (2 conf) | 2 confirmadas | **2 confirmadas intactas** + log para revisão manual |
| 5 lotes (2 pend cada) | 2 pendentes | 1 mantida, 1 cancelada |

Zero registration paga será cancelada. Zero.

---

### PARTE 2 — Bloqueio definitivo de novas duplicatas

**Migration:**
- Índice único parcial: `UNIQUE (cpf, event_id) WHERE registration_status IN ('pending_payment', 'confirmed')`. Barreira atômica no banco.
- Coluna `parent_order_id uuid` em `orders` (nullable) com índice — usado pelo split (Parte 3).

**Edge Function `create-checkout`:**
- Confirmada existente para qualquer CPF do request → erro `409` listando os nomes, instruindo consultar pelo CPF.
- Pendente existente:
  - Individual com 1 pendente do mesmo CPF do mesmo tipo individual → resume comportamento atual (retorna link existente).
  - Qualquer outro caso (lote com pendente, individual sobre pendente de lote, etc.) → erro `409` instruindo consulta por CPF para pagar a pendente. Hoje auto-cancela; passa a bloquear.
- Resposta 409 estruturada: `{ duplicates: [{ name, cpf_masked, status }] }`.
- Captura erro `23505` (violação de índice único) como fallback retornando 409.

**Frontend `RegistrationPage.tsx`:**
- Trata 409 com modal claro listando os nomes e botão "Consultar minha inscrição" levando para `/` com diálogo de consulta aberto.
- `useRef` de flag de submissão + `disabled` no botão durante request — defesa em camadas contra cliques duplos (causa raiz dos 5 cadastros simultâneos da SARA).

---

### PARTE 3 — Split de pagamento de lote

**Edge Function nova `split-batch-payment`:**
- Input: `registration_id`, `mode: "individual" | "batch_remaining"`.
- Modo `individual`: cria novo order (purchase_type=individual, parent_order_id=lote), move a registration, recalcula lote remanescente (count + total), regenera `order_nsu` e `payment_link` do lote, gera link novo do individual. Idempotente.
- Modo `batch_remaining`: regenera/retorna o link do lote já recalculado.
- Validações: registration `pending_payment`, order original `batch` e `pending`, evento publicado.
- Audit log de cada split.

**Webhook `payment-webhook`:** sem mudança de lógica (já confirma só registrations do `order_id` recebido). Log adicional quando `parent_order_id` está presente.

**Frontend `EventsListPage.tsx`:**
- Botão "Pagar" em pendente de **lote** → sub-diálogo com 2 opções:
  - "Pagar só a minha inscrição" (valor unitário) → `split-batch-payment` modo `individual`.
  - "Pagar o lote completo" (valor recalculado) → modo `batch_remaining`.
- Pendente individual → comportamento atual.

---

### O que NÃO muda

- Inscrições confirmadas/pagas: **intocadas** em qualquer cenário.
- RLS, auth, schema das outras tabelas, admin, certificados, check-in, PDF.
- Preços, capacidade, validação de CPF.
- Webhook como única fonte da verdade de pagamento.
- Resume de pendente individual continua funcionando.

### Escopo de arquivos

- **2 migrações**: limpeza conservadora de duplicatas; índice único + `parent_order_id`.
- **1 Edge Function nova**: `split-batch-payment`.
- **1 Edge Function ajustada**: `create-checkout` (409 estruturado, sem auto-cancelar).
- **1 Edge Function com log**: `payment-webhook` (mínimo).
- **2 frontends**: `EventsListPage.tsx` (sub-diálogo de split), `RegistrationPage.tsx` (tratamento 409 + anti-duplo-submit).
