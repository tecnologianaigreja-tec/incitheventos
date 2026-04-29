## Objetivo

Evitar o limite de 1000 linhas do Supabase nas 4 telas administrativas, adicionando **paginação no servidor** com busca/filtros também aplicados no servidor (para que filtrar não esconda registros que estejam fora da página atual).

## Padrão único de paginação

Vou criar um componente reutilizável `AdminPagination` (controles "Anterior / Próxima / Página X de Y / Total: N") e aplicar consistentemente:

- **Tamanho de página:** 50 registros (configurável)
- **Consulta:** usar `.range(from, to)` + `{ count: "exact" }` no `.select()` para obter o total
- **Busca:** debounce de 300ms; ao mudar busca/filtro/evento, volta para página 1
- **Filtros:** aplicados no servidor via `.ilike()` / `.eq()` em vez de filtrar arrays no client

## Mudanças por tela

### 1) `AdminOrders.tsx` (Pedidos)
- Trocar `load()` para paginar `orders` com `.range()` + `count`
- Busca server-side por `order_code`, `buyer_name`, `buyer_email`, `buyer_document` (ilike)
- Filtro por status (tab) já aplicado no servidor
- `payment_proofs` (aba comprovantes) também paginado separadamente
- Seleção em massa: limitar a "selecionar todos da página atual" (claro na UI)

### 2) `AdminRegistrations.tsx` (Inscritos)
- Paginar `registrations` filtrando por evento selecionado
- Busca server-side por `full_name`, `email`, `cpf`, `registration_code`
- Filtros dinâmicos (`custom_fields`) que hoje rodam no client: manter no client **apenas dentro da página atual** com aviso, ou mover os mais comuns (status, congregação) para servidor. Proposta: status/payment_status/checkin_status no servidor; demais filtros dinâmicos seguem no client sobre a página atual (aceitável pois evento já reduz muito o conjunto).

### 3) `AdminCheckin.tsx` (Check-in — lista de já-checados)
- Paginar `checkedIn` (já existe `page` no client; trocar para server-side)
- Filtro por evento + busca server-side por nome/cpf
- Scanner e busca manual continuam funcionando como hoje (independentes da listagem)

### 4) `AdminCertificates.tsx` (Certificados)
- Paginar `registrations` elegíveis (já filtrado por evento + `payment_status=approved` + `checkin_status=checked_in`)
- Carregar `certificates` apenas dos IDs da página atual: `.in("registration_id", pageIds)` em vez de buscar todos
- "Emitir todos elegíveis" passa a iterar página por página no servidor (loop até esgotar) com indicador de progresso

## Detalhes técnicos

- Novo arquivo: `src/components/admin/AdminPagination.tsx` (Anterior/Próxima, contador, "Página X de Y", total).
- Hook utilitário opcional `usePagination(pageSize)` retornando `{ page, setPage, from, to, reset }`.
- Em todas as queries paginadas: `.select("*", { count: "exact" }).range(from, to)`.
- `useEffect` para resetar `page` para 1 quando mudar: evento selecionado, termo de busca (debounced), aba de status.
- Loading state por troca de página (skeleton ou spinner discreto).
- Sem migrations de banco — apenas frontend.

## Riscos / observações

- Filtros dinâmicos por `custom_fields` (jsonb) em `AdminRegistrations` são difíceis de paginar no servidor com a UI atual; mantenho-os atuando sobre a página visível e adiciono nota visual ("Filtros aplicados sobre a página atual").
- Exportações (se houver botão "Exportar tudo") devem continuar buscando o conjunto completo via paginação em loop no momento da exportação — verifico se existe esse botão nessas telas e ajusto se necessário.

## Entregáveis

1. `src/components/admin/AdminPagination.tsx` (novo)
2. Edições em: `AdminOrders.tsx`, `AdminRegistrations.tsx`, `AdminCheckin.tsx`, `AdminCertificates.tsx`
3. Comportamento idêntico ao atual em telas com poucos registros; suporte transparente a milhares de registros.
