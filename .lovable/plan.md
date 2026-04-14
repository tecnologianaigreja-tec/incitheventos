

## Correção: Inscrição em lote bloqueada por registros pendentes

### Problema identificado

A Edge Function `create-checkout` tem um bug no tratamento de inscrições pendentes para lotes. Na linha 161-163, **toda tentativa de inscrição em lote é bloqueada** se qualquer participante do lote já possui um registro com status `pending_payment` -- seja de uma tentativa anterior de lote ou de uma inscrição individual que não foi concluída.

Fluxo do bug:
1. Participante A tenta inscrição individual, mas não finaliza o pagamento → fica com status `pending_payment`
2. Participante B tenta inscrever um lote que inclui Participante A
3. Backend encontra registro pendente do Participante A e **bloqueia todo o lote** com a mensagem: "Já existe inscrição pendente neste evento para: [nome]"
4. Não existe lógica de retomada (resume) para lotes, diferente do fluxo individual que retoma o pedido existente

Atualmente no banco existem **8 registros pendentes** que podem estar bloqueando novas inscrições em lote que incluam essas pessoas.

### Solução

Modificar a Edge Function `create-checkout` para tratar registros pendentes de forma inteligente em vez de simplesmente bloquear:

**Arquivo: `supabase/functions/create-checkout/index.ts`**

1. **Cancelar registros pendentes antigos antes de criar novos**: quando existirem registros `pending_payment` para CPFs do lote, cancelar automaticamente esses registros antigos (e seus pedidos, se todos os registros do pedido forem cancelados) antes de prosseguir com a nova inscrição. Isso permite que o usuário "recomece" sem ficar travado.

2. **Lógica detalhada**:
   - Se todos os registros existentes são `pending_payment`: cancelar (`registration_status = 'canceled'`, `payment_status = 'canceled'`)
   - Se o pedido antigo associado não tem mais nenhum registro ativo: cancelar o pedido também
   - Após cancelar os antigos, prosseguir normalmente com a criação do novo pedido e registros
   - Registros `confirmed` continuam bloqueando (comportamento atual preservado)

3. **Log de auditoria**: registrar no `audit_logs` que registros pendentes foram cancelados para permitir nova inscrição

### O que NÃO muda
- Fluxo individual com resume (retomada de pedido pendente) permanece inalterado
- Validação de CPF confirmado permanece bloqueando
- Validação de dados, geração de link de pagamento, webhook -- tudo intacto
- Frontend não precisa de alteração

### Escopo
- 1 arquivo editado: `supabase/functions/create-checkout/index.ts`
- Alteração cirúrgica no bloco de tratamento de registros pendentes (linhas ~119-164)

