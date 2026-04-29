-- 1. Tabela de comprovantes de pagamento enviados pelos clientes
CREATE TABLE public.payment_proofs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL,
  buyer_cpf TEXT NOT NULL,
  image_url TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewer_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_proofs_order_id ON public.payment_proofs(order_id);
CREATE INDEX idx_payment_proofs_status ON public.payment_proofs(status);

ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

-- Qualquer um pode inserir um comprovante (validação real é feita na edge function)
CREATE POLICY "Anyone can submit payment proofs"
  ON public.payment_proofs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'pending');

-- Admins podem ver/atualizar/deletar
CREATE POLICY "Admins can view payment_proofs"
  ON public.payment_proofs
  FOR SELECT
  TO authenticated
  USING (is_admin((SELECT auth.uid())));

CREATE POLICY "Admins can update payment_proofs"
  ON public.payment_proofs
  FOR UPDATE
  TO authenticated
  USING (is_admin((SELECT auth.uid())))
  WITH CHECK (is_admin((SELECT auth.uid())));

CREATE POLICY "Admins can delete payment_proofs"
  ON public.payment_proofs
  FOR DELETE
  TO authenticated
  USING (is_admin((SELECT auth.uid())));

CREATE TRIGGER update_payment_proofs_updated_at
  BEFORE UPDATE ON public.payment_proofs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Bucket de storage para imagens dos comprovantes (privado)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Qualquer um pode subir (a edge function valida CPF + order)
CREATE POLICY "Anyone can upload payment proofs"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'payment-proofs');

-- Admins podem ver/baixar
CREATE POLICY "Admins can view payment proof files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'payment-proofs' AND is_admin((SELECT auth.uid())));

CREATE POLICY "Admins can delete payment proof files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'payment-proofs' AND is_admin((SELECT auth.uid())));