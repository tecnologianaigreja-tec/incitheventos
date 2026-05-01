## Diagnóstico dos dois erros do print

### 1. `'facingMode' should be string or object with exact as key` → "Não foi possível acessar a câmera"

A biblioteca `html5-qrcode` **não aceita** `{ ideal: "environment" }`. A API dela só permite:
- string: `"environment"` ou `"user"`
- objeto: `{ exact: "environment" }`

Hoje em `src/pages/admin/AdminCheckin.tsx` (linha 364) chamamos `tryStart(scanner, { facingMode: { ideal: "environment" } })`. A primeira tentativa falha com erro de validação (não é `OverconstrainedError`/`NotFoundError`), então o `catch` re-lança e cai no toast genérico "Não foi possível acessar a câmera". Isso é puramente um bug de configuração — a câmera nem chega a ser solicitada.

### 2. `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` (400 em `/auth/v1/token?grant_type=refresh_token`)

O `localStorage` tem uma sessão antiga do Supabase cujo refresh token foi invalidado (provavelmente por logout em outra aba, expiração no servidor, ou recriação do projeto). Como `autoRefreshToken: true`, o cliente tenta renovar no carregamento da página e recebe 400. Hoje **não tratamos esse evento**, então o erro fica visível no console e a sessão permanece "fantasma" no storage.

---

## Mudanças propostas

### A) `src/pages/admin/AdminCheckin.tsx` — corrigir startup da câmera

Trocar a estratégia de `facingMode` para algo que a `html5-qrcode` aceite e que funcione tanto no celular (traseira) quanto no desktop (qualquer câmera):

1. **1ª tentativa:** `tryStart(scanner, { facingMode: "environment" })` — string simples, válida pela lib, pede câmera traseira no celular.
2. **2ª tentativa (fallback se falhar com `OverconstrainedError` ou `NotFoundError`):** `tryStart(scanner, { facingMode: "user" })` — câmera frontal/única (cobre desktops/laptops sem câmera traseira).
3. **3ª tentativa (último recurso):** enumerar câmeras com `Html5Qrcode.getCameras()` e iniciar pela primeira disponível por `deviceId`. Cobre dispositivos onde nenhum `facingMode` resolve.

Resto do fluxo (polling do `#qr-reader`, `playsinline`/`muted`/`object-fit:cover` no `<video>`, beep, cooldown por token, auto-clear) **permanece exatamente como está**. Apenas a chamada do `facingMode` muda.

### B) `src/integrations/supabase/client.ts` + tratamento global — eliminar erro de refresh token

Adicionar um listener global `supabase.auth.onAuthStateChange` em um único ponto que rode no boot do app (criar `src/lib/authBootstrap.ts` e importá-lo em `src/main.tsx`). Comportamento:

- Quando o evento for `TOKEN_REFRESHED` com `session === null`, ou quando ocorrer `SIGNED_OUT`, chamar `supabase.auth.signOut({ scope: 'local' })` para **limpar o storage corrompido** silenciosamente.
- Não redirecionar nada — as páginas protegidas (`CheckinOperatorPage`, `AdminLayout`) já redirecionam pra tela de login quando `getUser()` retorna nulo, então o usuário simplesmente cai no login se estava autenticado.
- Adicionalmente, no `client.ts`, manter `persistSession: true` mas o listener garante que tokens inválidos sejam descartados no boot, parando o loop de tentativas de refresh.

Isso elimina os logs `Failed to load resource ... 400` e `AuthApiError: Invalid Refresh Token` do print sem deslogar nenhum usuário válido.

---

## O que NÃO muda (sem regressões)

- Lógica de check-in (cooldown 3s por token, idempotência no UPDATE, `checkin_logs`, beeps success/warning/error, auto-clear do feedback).
- Preview da câmera (container `#qr-reader` com `aspect-square`, overlay de "Iniciando câmera...", `playsinline`/`muted`).
- Busca manual, lista de presentes, filtros dinâmicos, paginação, botão "Limpar filtros".
- Rotas, RLS, Edge Functions, schema do banco — nada disso é tocado.
- Login do operador (`/checkin/login`) e fluxo do admin continuam idênticos.

## Arquivos modificados

- `src/pages/admin/AdminCheckin.tsx` — apenas as 2 chamadas `tryStart(...)` e a adição do fallback por `getCameras()`.
- `src/integrations/supabase/client.ts` — sem mudança estrutural; possível pequeno comentário.
- `src/lib/authBootstrap.ts` — **novo** arquivo, ~15 linhas, com o listener `onAuthStateChange`.
- `src/main.tsx` — uma linha de `import "./lib/authBootstrap"`.

## Arquivos NÃO alterados

- Migrations, Edge Functions, RLS.
- `DynamicFieldFilters.tsx`, `CheckinOperatorPage.tsx`, `CheckinLoginPage.tsx`, `AdminLayout.tsx`.
- Qualquer outra página ou componente.
