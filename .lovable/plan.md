## Objetivo
Tornar o check-in por câmera prático e contínuo: ao ler o QR Code, **salvar a presença, emitir um beep, mostrar feedback visual rápido e manter a câmera ativa** para o próximo participante. Se o mesmo QR for lido de novo, avisar "já registrado" (com beep diferente) e continuar pronto para o próximo.

## Problemas atuais (em `src/pages/admin/AdminCheckin.tsx`)

1. **Preview da câmera não aparece no celular** — o container `#qr-reader` fica `hidden` até `scannerActive=true`, mas isso só acontece **depois** que `Html5Qrcode.start()` resolve. O elemento tem `0x0` quando a lib injeta o `<video>`, e em iOS/Android o vídeo fica invisível. Falta também `playsInline` no `<video>`.
2. **Sem feedback sonoro** — não há beep quando o check-in é registrado.
3. **Sem proteção contra leitura repetida** — o `processingRef` tem janela de 2s, mas não distingue "mesmo QR escaneado várias vezes" de "QRs diferentes". E não há cooldown por token.
4. **Câmera não continua ativa de forma fluida** — após ler, o `result` aparece e a câmera continua, mas o `processingRef` de 2s pode bloquear leituras válidas seguintes em filas movimentadas. Falta um auto-clear do `result` para limpar a tela e ficar pronto para o próximo.

## Mudanças (apenas em `src/pages/admin/AdminCheckin.tsx`)

### 1. Corrigir preview da câmera no mobile
- Novo estado `scannerStarting`. Renderizar o container `<div id="qr-reader">` sempre que `scannerActive || scannerStarting`, com classes `w-full max-w-sm aspect-square mx-auto rounded-lg overflow-hidden bg-muted relative` — assim ele já tem dimensões antes de `start`.
- Fluxo de `startScanner`:
  1. `setScannerStarting(true)`
  2. `await new Promise(r => requestAnimationFrame(() => r(null)))` (garante DOM pintado)
  3. instanciar `Html5Qrcode("qr-reader")`
  4. chamar `start({ facingMode: { ideal: "environment" } }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScan, () => {})`
  5. após resolver, localizar `<video>` filho de `#qr-reader` e setar `playsInline=true`, `muted=true`, estilos `width:100%; height:100%; object-fit:cover`
  6. `setScannerActive(true)`, `setScannerStarting(false)`
- Tratamento de erros específicos: `NotAllowedError`, `NotFoundError`, `NotReadableError`, `OverconstrainedError` (com fallback para `facingMode: "user"`).
- Overlay com spinner enquanto `scannerStarting`.

### 2. Beep sonoro
- Nova função `playBeep(kind: "success" | "warning" | "error")` usando **Web Audio API** (sem assets externos):
  - `success`: tom curto agudo (ex.: 880 Hz, 120 ms) — uma nota.
  - `warning`: dois tons médios curtos (ex.: 600 Hz, 80 ms × 2) — para "já registrado".
  - `error`: tom grave curto (ex.: 220 Hz, 200 ms) — para QR inválido / não pago.
- Usar `AudioContext` lazy criado no primeiro clique de "Abrir Câmera" (gesto do usuário desbloqueia áudio em iOS).

### 3. Anti-duplicata e fluxo contínuo
- Trocar `processingRef` por:
  - `lastScannedRef` (Map<string, number>): guarda `qr_token → timestamp` do último scan, com cooldown de **3 segundos** por token. Se o mesmo token vier de novo dentro de 3s, ignora silenciosamente (sem reprocessar nem mostrar feedback redundante).
  - `processingRef` (boolean): mantém para evitar duas chamadas em paralelo.
- Em `processCheckinByToken`:
  - Verifica cooldown por token; se dentro da janela, retorna sem fazer nada.
  - Busca a registration pelo token.
  - Se não encontrada → `playBeep("error")`, mostra `result`, agenda auto-clear.
  - Se já `checked_in` → `playBeep("warning")`, `result.status = "already"`, agenda auto-clear.
  - Se não pago → `playBeep("error")`, `result.status = "not_paid"`, agenda auto-clear.
  - Se sucesso → `playBeep("success")`, `result.status = "success"`, agenda auto-clear.
- **Câmera permanece ativa** durante todo o ciclo — não chamamos `stopScanner` após o scan.

### 4. Auto-clear do feedback (volta ao "pronto")
- `useEffect` que, quando `result` muda, agenda `setTimeout` de **2,5 s** para limpar `result` (ou 4 s para erro/not_found para dar tempo de ler).
- Isso libera visualmente a tela para o próximo scan, mantendo a câmera apontada.

### 5. Validações no banco (defesa em profundidade)
- Continuamos checando `payment_status = 'approved'` e `checkin_status !== 'checked_in'` antes do UPDATE. A RLS já permite ao `checkin_operator` fazer o UPDATE. Sem mudanças de schema.

### 6. Sem regressões
- Busca manual, lista de presentes, filtros, paginação, login do operador, rotas e RLS permanecem intactos.
- Cleanup no unmount continua chamando `stopScanner`.
- Botão "Parar Câmera" continua funcionando manualmente.

## Arquivo modificado
- `src/pages/admin/AdminCheckin.tsx` (estado novo, `startScanner`/`stopScanner`, `processCheckinByToken`, `confirmCheckin`, JSX da câmera e do feedback).

## Arquivos NÃO alterados
- Nenhuma migration.
- Nenhuma edge function.
- `DynamicFieldFilters.tsx`, `CheckinOperatorPage.tsx`, `CheckinLoginPage.tsx` permanecem como estão.
