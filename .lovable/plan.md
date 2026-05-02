## Problema

As funções `public.is_admin()` e `public.is_checkin_operator()` perderam o `GRANT EXECUTE` para os roles `anon` e `authenticated`. Como praticamente todas as policies RLS do projeto usam essas funções (eventos, registrations, certificates, checkin_days, checkin_logs, admin_users, payment_events, payment_proofs, label_template, event_form_fields, certificate_templates, audit_logs), qualquer SELECT/INSERT/UPDATE/DELETE retorna:

```
code: 42501
message: permission denied for function is_admin
```

Isso explica todos os sintomas:
- Admin não consegue logar (falha ao consultar `admin_users` após o auth ok).
- Operador de check-in não acessa a área.
- Home pública (`/`) mostra "Nenhum evento publicado" — a query de events foi rejeitada com 401.

Confirmado por query no `pg_proc`: `has_function_privilege` = false para `anon` e `authenticated` em ambas as funções.

## Correção

Uma única migração que devolve o EXECUTE para `anon` e `authenticated` em ambas as funções. Como elas são `SECURITY DEFINER`, executam com os privilégios do owner mesmo chamadas pelo anon — não há vazamento de privilégio.

```sql
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_checkin_operator(uuid) TO anon, authenticated;
```

Sem mudança de schema, sem mudança em policy, sem alteração de código frontend. Após aprovar a migração, o admin, o check-in e a listagem pública voltam a funcionar imediatamente.

## Verificação pós-deploy

1. Recarregar `/` → o evento "2ª CONFERÊNCIA DE APOLOGÉTICA" deve aparecer.
2. Login em `/admin/login` com `incithx@gmail.com` → entra no dashboard.
3. Login em `/checkin/login` → entra na área do operador.
