## Objetivo
Permitir limpar o filtro de "Participantes presentes" de forma clara e completa, incluindo a seleção em andamento (campo escolhido e valor digitado/selecionado), além dos filtros já aplicados.

## Situação atual
No componente `DynamicFieldFilters` (usado em `AdminCheckin.tsx`):
- Já existe um botão "Limpar filtros" — mas ele **só aparece depois** que pelo menos um filtro foi aplicado (badge gerado).
- Quando o usuário escolhe um campo (ex.: "Área") e digita um valor, **não há como desfazer** essa seleção sem recarregar a página — a única opção é trocar para outro campo ou aplicar.
- Cada badge de filtro aplicado já tem um "X" individual (isso continua funcionando).

## Mudanças propostas (somente em `src/components/DynamicFieldFilters.tsx`)

1. **Botão "Limpar" ao lado do seletor de campo**
   - Quando houver um campo selecionado (`selectedField`) **ou** valor digitado/selecionado, exibir um pequeno botão ghost com ícone `X` que reseta `selectedField`, `filterValue` e `selectedValues`.
   - Não remove os filtros já aplicados — apenas a seleção em curso.

2. **Botão "Limpar tudo" sempre visível quando houver filtros ativos OU seleção em curso**
   - Mover/duplicar a lógica de `Limpar filtros` para um local mais visível: exibido junto à linha de seletores quando `activeFilters.length > 0` OU houver seleção em andamento.
   - Ao clicar: chama `onFiltersChange([])` **e** reseta os estados locais (`selectedField`, `filterValue`, `selectedValues`, `popoverOpen`).
   - Mantém o botão "Limpar filtros" abaixo dos badges (comportamento atual preservado) para não quebrar o fluxo já conhecido.

3. **Acessibilidade / UX**
   - Botões com `aria-label="Limpar seleção"` e `title` correspondente.
   - Tamanho `sm`, variante `ghost`, com ícone `X` da `lucide-react` (já importado).

## Garantias de não-regressão
- Nenhuma alteração em `AdminCheckin.tsx`, em `applyDynamicFiltersToQuery`, ou na assinatura do componente.
- Props `customFields`, `activeFilters`, `onFiltersChange` permanecem idênticas.
- O botão "X" individual de cada badge e o "Limpar filtros" original continuam existindo.
- Demais usos do `DynamicFieldFilters` em outras telas (ex.: registrations) não são afetados, pois apenas adicionamos UI, sem mudar comportamento.

## Arquivos modificados
- `src/components/DynamicFieldFilters.tsx` (único arquivo alterado)
