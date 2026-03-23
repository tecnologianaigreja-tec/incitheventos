

## Correção: Select crashando em Android (mesmo problema do iOS)

### Problema

O fallback para `<select>` nativo foi aplicado apenas para iOS (`isIOSDevice`). O mesmo bug do Radix UI Select com portais e touch events também afeta navegadores Android. O ErrorBoundary captura o crash e exibe "Algo deu errado".

### Solução

Usar o `<select>` nativo em **todos os dispositivos móveis**, não apenas iOS. O hook `useIsMobile` já existe e detecta telas < 768px.

### Arquivos a editar

**1. `src/pages/RegistrationPage.tsx`**
- Substituir `isIOSDevice` por uma verificação de mobile (tela touch/pequena)
- Usar detecção estática similar: checar `navigator.maxTouchPoints > 0` ou `window.innerWidth < 768` no momento do carregamento
- Aplicar `<select>` nativo para todos os dispositivos móveis/touch

**2. `src/components/ParticipantFormFields.tsx`**
- Mesma mudança: trocar `isIOSDevice` por detecção de dispositivo móvel/touch
- Garantir que todos os selects do formulário usem fallback nativo em mobile

**3. `src/hooks/use-mobile.tsx`**
- Adicionar função `isMobileDevice()` estática (sem hook) que detecta touch devices: `navigator.maxTouchPoints > 0` ou tela pequena

### Escopo
- 3 arquivos editados
- Fallback nativo para todos os dispositivos touch/mobile, não apenas iPhone

