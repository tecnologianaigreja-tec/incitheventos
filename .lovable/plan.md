

## Correção: Select crashando no iPhone (iOS Safari)

### Problema

Este é um **bug conhecido do Radix UI Select** no iOS (issues #2696, #3254 no GitHub). No iOS Safari, ao selecionar um item no `SelectContent` renderizado via `Portal`, o componente pode:
1. Disparar cliques em elementos abaixo do dropdown (click-through)
2. Causar crash de renderização no Safari

Quando isso acontece, o **ErrorBoundary** captura o erro e exibe "Algo deu errado" com o botão "Tentar novamente" -- exatamente o que o usuário relatou.

### Causa raiz

O `SelectContent` usa `SelectPrimitive.Portal` que renderiza o dropdown fora da árvore DOM do formulário. No iOS Safari, isso causa conflitos de touch/pointer events. A combinação de `position="popper"` + Portal + animações CSS é especialmente problemática no Safari móvel.

### Plano de correção

**1. Corrigir o componente Select base** (`src/components/ui/select.tsx`)

- Adicionar `onCloseAutoFocus` com `e.preventDefault()` no `SelectContent` para evitar o click-through no iOS
- Manter o Portal mas prevenir a propagação de eventos de toque ao fechar

**2. Criar fallback nativo para iOS** (`src/pages/RegistrationPage.tsx` e `src/components/ParticipantFormFields.tsx`)

- Detectar se é dispositivo iOS via user agent
- Para campos `select` em iOS, usar `<select>` HTML nativo em vez do Radix Select
- O `<select>` nativo no iOS abre o picker nativo do sistema, que é 100% estável e familiar para usuários de iPhone

**3. Hook de detecção** (`src/hooks/use-mobile.tsx`)

- Adicionar uma função `isIOS()` ao hook existente para reutilizar a detecção em ambos os arquivos

### Escopo
- 3-4 arquivos editados
- Solução definitiva: picker nativo do iOS para selects, sem depender do Radix em dispositivos problemáticos

