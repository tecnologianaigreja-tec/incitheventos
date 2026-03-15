

## Diagnóstico: Selecionar "Área" no formulário redireciona ao início

### Problema

O bug original era um crash ao fazer `.map()` em `field.options` quando este era `null` (vindo do Supabase). Isso já foi corrigido com `(field.options || []).map(...)`.

Porém, agora existe o **ErrorBoundary global** que, ao capturar qualquer erro, exibe um botão "Voltar ao início" que redireciona para `/`. Se algum usuário ainda estiver com uma **versão cacheada** do app (sem a correção), o crash é capturado pelo ErrorBoundary e o botão leva de volta ao início -- exatamente o comportamento relatado.

Além disso, há um risco adicional: se `field.options` contiver strings vazias `""`, o Radix `SelectItem` com `value=""` causa erro porque o componente **não aceita valor vazio**.

### Análise do código atual

1. **`DynamicField` (linha 38)**: Já tem `(field.options || []).map(...)` -- proteção contra null OK
2. **Falta filtrar opções inválidas**: Se `options` contiver `""` ou valores duplicados, o Select pode crashar
3. **ErrorBoundary**: Redireciona para `/` ao capturar erro -- explica o "voltou pro início"
4. **Cache**: Usuários na Vercel podem estar vendo versão antiga sem o fix

### Plano de correção

**1. Filtrar opções inválidas no `DynamicField`** (`src/pages/RegistrationPage.tsx`)

Trocar `(field.options || []).map(...)` por `(field.options || []).filter(opt => opt && opt.trim() !== "").map(...)` para garantir que nenhuma opção vazia ou inválida gere um `SelectItem` com `value=""`.

**2. Melhorar o ErrorBoundary** (`src/components/ErrorBoundary.tsx`)

Em vez de redirecionar para `/` com `window.location.href`, oferecer um botão "Tentar novamente" que faz `window.location.reload()` para recarregar a página atual, mantendo o usuário no formulário.

**3. Forçar cache-busting na Vercel** (`vercel.json`)

Adicionar headers de cache-control para arquivos HTML, garantindo que o `index.html` nunca seja servido do cache do navegador, forçando sempre a versão mais recente do app.

### Escopo
- 3 arquivos editados
- Prevenção de crashes em selects + melhor experiência no ErrorBoundary + cache atualizado na Vercel

