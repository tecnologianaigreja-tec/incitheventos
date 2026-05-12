## Trocar conta InfinitePay para `$rafaelsousaservo`

O handle da InfinitePay é lido pelas Edge Functions a partir do secret `INFINITEPAY_HANDLE` (já existe no projeto). Não há nada hard-coded no código — basta atualizar o valor do secret.

### Passo único
1. Atualizar o secret `INFINITEPAY_HANDLE` para `rafaelsousaservo` (sem o `$`, apenas o handle).
   - Usado em: `create-checkout`, `split-batch-payment`, `reconcile-payment`, `payment-webhook`.
   - A propagação é automática nas Edge Functions — sem deploy manual, sem alteração de código.

### Verificação após troca
- Criar uma inscrição de teste e confirmar que o link gerado aponta para `https://checkout.infinitepay.io/rafaelsousaservo/...`.
- Confirmar que o webhook de pagamento continua chegando normalmente (a URL do webhook é configurada no painel da InfinitePay da nova conta — verificar com o dono da conta se o webhook do projeto já está cadastrado lá).

### Atenção (importante, não envolve código)
- O **webhook da InfinitePay precisa estar configurado na nova conta** (`$rafaelsousaservo`) apontando para a URL da função `payment-webhook`. Se a conta nova não tiver o webhook configurado, pagamentos serão recebidos mas o sistema não confirmará automaticamente as inscrições (ficarão pendentes até a reconciliação manual).
- Pedidos antigos já criados com o handle anterior continuarão apontando para a conta antiga — apenas novos checkouts usarão a conta nova.
