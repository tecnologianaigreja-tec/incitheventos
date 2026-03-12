

## Diagnóstico: Tela branca ao selecionar campo no formulário de inscrição

### Problema identificado

No componente `DynamicField` (linha 38 de `RegistrationPage.tsx`), o campo do tipo `select` faz `field.options.map(...)` sem verificar se `options` é `null` ou `undefined`. Embora o TypeScript declare `options: string[]`, o Supabase pode retornar `null` para colunas JSONB quando nenhum valor foi salvo. Isso causa um crash (`Cannot read properties of null (reading 'map')`), resultando na tela branca.

Além disso, não há **Error Boundary** no app -- qualquer erro de renderização derruba toda a aplicação e mostra tela branca.

### Plano de correção

**1. Proteger `field.options` contra null/undefined** (`src/pages/RegistrationPage.tsx`)

Na função `DynamicField`, trocar `field.options.map(...)` por `(field.options || []).map(...)` para evitar crash quando o campo select não tem opções definidas.

**2. Adicionar Error Boundary global** (`src/components/ErrorBoundary.tsx` + `src/App.tsx`)

Criar um componente `ErrorBoundary` simples que captura erros de renderização e exibe uma mensagem amigável com botão "Voltar ao início", em vez de tela branca. Envolver as rotas no `App.tsx` com esse boundary.

### Escopo
- 2 arquivos editados, 1 arquivo criado
- Correção defensiva + prevenção de telas brancas futuras

