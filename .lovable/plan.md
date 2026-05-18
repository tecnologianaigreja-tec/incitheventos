## Correção: Remover presenças fantasmas ao descredenciar

**Problema:** O botão "Descredenciar" em `AdminRegistrations.tsx` limpa o `checkin_logs`, mas esquece de limpar a tabela `checkin_days`, deixando check-ins fantasmas e impedindo novo credenciamento devido à constraint UNIQUE.

**Alteração:** Substituir a função `uncheckinRegistration` (linha ~198) no arquivo `src/pages/admin/AdminRegistrations.tsx` pela versão corrigida, que inclui a exclusão dos registros correspondentes em `checkin_days`.

**Detalhes técnicos:**
- Arquivo: `src/pages/admin/AdminRegistrations.tsx`
- Linhas afetadas: 198–220 (função `uncheckinRegistration`)
- A única diferença é a adição de:
  ```ts
  await supabase.from("checkin_days").delete().eq("registration_id", reg.id);
  ```
  entre a limpeza de `checkin_logs` e o registro em `audit_logs`.

Nenhum outro arquivo será alterado.