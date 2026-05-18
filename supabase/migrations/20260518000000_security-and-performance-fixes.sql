-- ============================================================
-- SECURITY & PERFORMANCE FIXES (2026-05-18)
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- FIX 1: audit_logs — políticas INSERT e DELETE ausentes
-- O código cliente fazia INSERT direto que falhava
-- silenciosamente porque não existia política RLS de INSERT.
-- ──────────────────────────────────────────────────────────

-- Admins e operadores de check-in podem inserir logs de auditoria
CREATE POLICY "Authenticated can insert audit_logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin((select auth.uid()))
    OR is_checkin_operator((select auth.uid()))
  );

-- Admins podem deletar logs (ex.: limpeza)
CREATE POLICY "Admins can delete audit_logs" ON public.audit_logs
  FOR DELETE TO authenticated
  USING (is_admin((select auth.uid())));


-- ──────────────────────────────────────────────────────────
-- FIX 2: RPC para contagem de certificados por evento
-- Substitui o padrão N+1 (loop de chunks no cliente) por
-- uma única query no banco.
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.count_certificates_for_event(_event_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)
  FROM public.certificates c
  JOIN public.registrations r ON r.id = c.registration_id
  WHERE r.event_id = _event_id;
$$;

REVOKE ALL ON FUNCTION public.count_certificates_for_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_certificates_for_event(uuid) TO authenticated;


-- ──────────────────────────────────────────────────────────
-- NOTA SOBRE EXPOSIÇÃO DE PII (registrations / orders)
-- ──────────────────────────────────────────────────────────
-- As políticas "Select registrations" e "Select orders" usam
-- USING (true), expondo CPF, e-mail e nome de todos os inscritos
-- a qualquer usuário anônimo via REST API.
--
-- A correção completa requer mover as consultas públicas
-- (CpfLookupDialog, OrderStatusPage, RegistrationPage) para
-- Edge Functions com rate-limiting. Deve ser implementada
-- em staging antes de aplicar em produção.
--
-- Risco de regressão: ALTO — não alterar sem testes.
-- ──────────────────────────────────────────────────────────
