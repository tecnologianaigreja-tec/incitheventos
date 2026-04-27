## Correção: Consulta de inscrição com botão "Buscar" travado

### Problema identificado

Em `src/pages/EventsListPage.tsx`, função `handleCpfLookup` (linhas 94–109):

```ts
async function handleCpfLookup() {
  const digits = cpfInput.replace(/\D/g, "");
  if (!isValidCPF(digits)) return;   // ← retorna SILENCIOSAMENTE
  setLookupLoading(true);
  ...
  const { data } = await supabase.from("registrations")...  // ← ignora erro
  setRegistrations((data || []) as ...);
  setLookupLoading(false);
}
```

Três falhas que fazem o botão parecer "travado":

1. **CPF inválido sem feedback**: se o usuário digitar um CPF com dígito verificador errado (mesmo que com 11 dígitos), a função sai sem mostrar nada — o botão "não responde" do ponto de vista do usuário.
2. **Erro da query ignorado**: a desestruturação só pega `data`, não `error`. Se o PostgREST retornar erro (ex.: timeout, RLS, falha de embed `events(...)`), o usuário vê tela em branco sem aviso.
3. **Sem `try/catch/finally`**: se a Promise do Supabase rejeitar (rede caiu, CORS), `setLookupLoading(false)` nunca é chamado e o botão fica eternamente em "Buscando…".

Diagnóstico confirmado:
- Backend ok: query embutida `events(title, ...)` funciona via REST direto, FKs `registrations_event_id_fkey` existem, RLS permite SELECT público em `registrations`.
- 96 inscrições `confirmed` e 39 `pending_payment` no banco — dados disponíveis.
- O sintoma "botão travado" nos dois dispositivos é compatível com erro de rede/JS não tratado deixando o `loading=true`.

### Solução

Reescrever `handleCpfLookup` em `src/pages/EventsListPage.tsx` com tratamento robusto:

1. **Validar e dar feedback**:
   - Se CPF vazio → toast "Digite seu CPF".
   - Se CPF com menos de 11 dígitos → toast "CPF incompleto".
   - Se algoritmo `isValidCPF` falhar → toast "CPF inválido".

2. **Garantir reset do loading**: envolver em `try / catch / finally` para que `setLookupLoading(false)` execute mesmo em caso de exceção.

3. **Tratar erro do Supabase**: capturar `error` da resposta e mostrar toast "Erro ao consultar. Tente novamente." com `console.error` para diagnóstico.

4. **Fallback no embed `events`**: se o embed falhar (`r.events` undefined em algum item), filtrar esses itens e logar — evita crash no `r.events.title` ao renderizar os cards.

5. **Mesmo tratamento no botão "Pagar"** (linhas ~342–354): a chamada `supabase.from("orders").select(...).single()` também ignora erro e pode travar a navegação. Adicionar `try/catch` e fallback para a página de inscrição.

### O que NÃO muda
- Backend, RLS, Edge Functions, schema do banco — intactos.
- Layout/UX da modal — preservado.
- Lógica de credencial PDF — preservada.

### Escopo
- 1 arquivo editado: `src/pages/EventsListPage.tsx` (apenas as funções `handleCpfLookup` e o handler do botão "Pagar").
- Sem alteração de banco, sem mudança em outras páginas.
