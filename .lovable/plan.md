

## Plano: Enviar dados do comprador para o checkout da InfinitePay

### Problema
Atualmente, o payload enviado à API da InfinitePay (`/invoices/public/checkout/links`) não inclui os dados do cliente (`customer`). Isso obriga o comprador a preencher nome, e-mail e telefone novamente no formulário de pagamento.

### O que será feito
Adicionar o objeto `customer` ao payload do checkout, conforme a documentação da InfinitePay (screenshot enviado), usando os dados já coletados no formulário de inscrição.

### Alteração técnica

**Arquivo:** `supabase/functions/create-checkout/index.ts`

Na função `generatePaymentLink`, adicionar o campo `customer` ao `checkoutPayload`:

```js
customer: {
  name: order.buyer_name,
  email: order.buyer_email,
  phone_number: order.buyer_phone  // formato: +5500000000000
}
```

O telefone será formatado para o padrão internacional (`+55` + apenas dígitos), pois a InfinitePay espera o formato `+5511999887766`.

Também será necessário garantir que o `buyer.phone` seja passado corretamente do frontend. Atualmente o campo `buyer.phone` já é coletado no formulário (campo WhatsApp), então os dados já existem -- apenas precisam ser incluídos no payload e formatados.

### Escopo
- Uma única alteração no arquivo `create-checkout/index.ts`
- Nenhuma mudança no frontend necessária
- Deploy da edge function necessário após a alteração

