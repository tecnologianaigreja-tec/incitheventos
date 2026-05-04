# Plano de ajustes

## 1. Operador de check-in não deve acessar área administrativa

**Causa**: `AdminLoginPage` e `AdminLayout` apenas verificam se o usuário existe em `admin_users`, sem checar o `role`. Como `conferencia@gmail.com` está em `admin_users` com role `checkin_operator`, ele entra no `/admin` normalmente.

**Correção**:
- `src/pages/admin/AdminLoginPage.tsx`: após buscar `admin_users`, validar que `role` ∈ `['superadmin','admin']`. Caso contrário, mostrar "Acesso restrito a administradores" e fazer signOut.
- `src/pages/admin/AdminLayout.tsx`: mesma validação no `useEffect` de check; se for `checkin_operator`, redirecionar para `/checkin` em vez de `/admin/login`.

## 2. Logout aleatório com mensagem "usuário não encontrado"

**Causa provável**: `src/lib/authBootstrap.ts` está sendo agressivo demais:
- O bloco IIFE chama `supabase.auth.signOut({scope:'local'})` sempre que `getSession()` retorna `error` OU (`!session && hasStaleAuthKeys()`). Em redes lentas/race com refresh, `getSession()` pode retornar transitoriamente sem sessão enquanto as chaves ainda estão no localStorage — derrubando sessões válidas.
- O listener limpa a sessão em `TOKEN_REFRESHED` com `session=null`, o que também ocorre em falhas transitórias de rede (não só refresh token revogado).

Ao recarregar a página o usuário aparece deslogado e, em uma segunda tentativa de login, ocasionalmente o `.single()` em `admin_users` falha com `PGRST116` ("Cannot coerce result to single object") quando há duplicidade ou latência → toast "usuário não encontrado".

**Correção**:
- Em `src/lib/authBootstrap.ts`:
  - Remover o IIFE de boot que chama `signOut` baseado em "stale keys" — não há critério confiável para detectar staleness sem o servidor.
  - No `onAuthStateChange`, só fazer `signOut` quando o evento for `SIGNED_OUT` real ou quando o erro do refresh for explicitamente `invalid_refresh_token` (ouvir via `auth.onAuthStateChange` e checar `error?.code` quando disponível). Caso contrário, apenas logar e deixar o SDK tentar de novo.
- Em `AdminLoginPage` e `CheckinLoginPage`: trocar `.single()` por `.maybeSingle()` para evitar exceções em race conditions; tratar `null` como "não autorizado".

## 3. Disponibilizar download do certificado na consulta por CPF

Hoje, em `src/pages/EventsListPage.tsx` (diálogo "Consultar minhas inscrições" → cartão de credencial), só mostra QR Code. Não há nenhuma referência ao certificado.

**Correção**:
- Em `handleCpfLookup`, após carregar `registrations`, buscar em paralelo `certificates` cuja `registration_id` esteja no resultado, e armazenar em estado `certByRegId: Record<string, {id, certificate_code, validation_hash}>`.
- No bloco do "Credential Card" (após o QR Code, antes dos botões finais), quando `certByRegId[selectedReg.id]` existir E o evento estiver `closed`/`concluded`, exibir botão **"Baixar Certificado (PDF)"** que:
  1. Busca `certificate_templates` do `event_id` (`background_url`, `field_positions`).
  2. Chama `generateCertificatePdf(...)` (já existe em `src/lib/certificatePdf.ts`, usado em `AdminCertificates`) com os dados do participante/evento/cert.
  3. Faz `doc.save(...)`.
- Caso o template não esteja configurado, mostrar toast informativo ("Certificado em preparação — tente novamente em breve").
- Para isso, o `select` da consulta precisa também trazer `event_id`, `events.workload_hours`, `events.status` (já não traz status — adicionar).

### Observações técnicas
- A tabela `certificates` já tem RLS pública para SELECT (`USING (true)`), então a consulta funciona sem autenticação.
- `certificate_templates` também tem SELECT público.
- Nenhuma migração de banco é necessária neste plano.

## Arquivos alterados
- `src/pages/admin/AdminLoginPage.tsx`
- `src/pages/admin/AdminLayout.tsx`
- `src/pages/CheckinLoginPage.tsx`
- `src/lib/authBootstrap.ts`
- `src/pages/EventsListPage.tsx`
