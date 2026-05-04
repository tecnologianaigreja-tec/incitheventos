## Contexto

Na aba **Certificados** (`AdminCertificates.tsx`):
- Hoje só há paginação (50 por página) — sem busca por nome, dificultando localizar um participante.
- Existem **605 inscritos elegíveis** (pagos + checked-in) no evento, mas apenas **336 certificados** foram criados. O dashboard está correto — quem está errado é o processo de emissão em lote.

### Causa do "Emitir Todos Elegíveis" parar em 336

O loop roda no navegador, fazendo um `INSERT` por participante de forma sequencial (~605 round-trips). Qualquer perda de foco da aba, refresh, navegação, ou falha intermitente de rede interrompe o processo silenciosamente — o toast final só conta o que deu certo até ali. Não há retomada nem retry. A query `existingCertIds` em chunks de 500 IDs também aumenta o tempo total antes de sequer começar a emitir.

## Mudanças

### 1. Busca por nome (`src/pages/admin/AdminCertificates.tsx`)

- Adicionar um `<Input>` de busca acima da tabela de certificados, com estado `searchTerm`.
- Quando `searchTerm` tiver ≥ 2 caracteres, alterar a query Supabase para incluir `.ilike('full_name', '%termo%')` (mantendo paginação e contagem).
- Resetar `page = 1` ao alterar o termo (debounce simples de 300 ms).
- Não muda nada no fluxo de emissão individual / download de PDF — apenas filtra a listagem.

### 2. Emissão em lote confiável via Edge Function

Criar nova função `supabase/functions/issue-all-certificates/index.ts`:

- Recebe `{ event_id }`.
- Valida JWT do chamador e confirma role `admin`/`superadmin` via `admin_users`.
- Valida que o evento está `closed` ou `concluded` e que existe template com `background_url`.
- Usando `service_role`:
  - Busca todas as `registrations` elegíveis (`payment_status='approved'` AND `checkin_status='checked_in'`) do evento.
  - Busca certificados já existentes para esses IDs.
  - Faz **um único `INSERT` em massa** dos certificados faltantes (`certificate_code` = `'CERT-' + crypto.randomUUID().slice(0,8).toUpperCase()`, `validation_hash` = `crypto.randomUUID()`).
  - Faz **um único `UPDATE`** em `registrations` para `certificate_status='issued'` e `certificate_issued_at=now()` para os IDs recém-criados.
  - Em caso de colisão de `certificate_code` (raro), faz retry só dos remanescentes (até 3 vezes).
- Retorna `{ created, skipped, total_eligible }`.
- Registrar no `supabase/config.toml` com `verify_jwt = true`.

No frontend (`AdminCertificates.tsx`):

- `issueAll()` passa a chamar `supabase.functions.invoke('issue-all-certificates', { body: { event_id } })`.
- Mostra o resumo (`X certificado(s) emitido(s), Y já existiam`) e chama `loadData()`.
- Manter o `issueCertificate(reg)` individual atual intocado (continua funcionando para casos pontuais).

### 3. Reprocessar os 269 faltantes

Após o deploy, basta o admin clicar em **Emitir Todos Elegíveis** novamente — agora server-side e atômico — para preencher os ~269 que faltam. O dashboard refletirá os 605.

## Garantias de não-regressão

- Emissão individual, download de PDF, editor de template, paginação e contagem permanecem inalterados.
- A busca é puramente aditiva (input + filtro `ilike`).
- A Edge Function só substitui o loop client-side de "emitir todos"; o resto da UI continua igual.

## Arquivos afetados

- `src/pages/admin/AdminCertificates.tsx` (busca + chamada à edge function)
- `supabase/functions/issue-all-certificates/index.ts` (nova)
- `supabase/config.toml` (registrar a função)
