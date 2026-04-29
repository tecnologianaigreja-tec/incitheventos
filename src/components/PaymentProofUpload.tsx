import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Upload, ReceiptText } from "lucide-react";
import { toast } from "sonner";

interface Props {
  orderId: string;
  cpf: string;
  orderCode?: string;
  onSubmitted?: () => void;
}

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

export default function PaymentProofUpload({ orderId, cpf, orderCode, onSubmitted }: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.error("Arquivo muito grande. Máx. 5 MB.");
      return;
    }
    setFile(f);
  }

  async function handleSubmit() {
    if (!file) { toast.error("Selecione o comprovante (imagem ou PDF)."); return; }
    setSubmitting(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${orderId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("payment-proofs")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        console.error(upErr);
        toast.error("Falha ao enviar a imagem. Tente novamente.");
        return;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/submit-payment-proof`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ order_id: orderId, cpf, image_path: path, message }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Não foi possível registrar o comprovante.");
        return;
      }
      toast.success(data.message || "Comprovante enviado! A organização irá analisar em breve.");
      setOpen(false);
      setFile(null);
      setMessage("");
      onSubmitted?.();
    } catch (err) {
      console.error(err);
      toast.error("Falha de conexão.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setFile(null); setMessage(""); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1 text-xs">
          <ReceiptText className="h-3 w-3" /> Já paguei
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar comprovante de pagamento</DialogTitle>
          <DialogDescription>
            Use somente se você já efetuou o PIX. {orderCode && <span className="font-medium text-foreground">Pedido {orderCode}.</span>}
            {" "}Após o envio, a organização confirmará a sua inscrição manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proof-file">Comprovante (imagem ou PDF, até 5 MB) *</Label>
            <Input
              ref={inputRef}
              id="proof-file"
              type="file"
              accept={ACCEPT}
              onChange={handlePick}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                Arquivo: <span className="font-medium text-foreground">{file.name}</span> ({(file.size / 1024).toFixed(0)} KB)
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="proof-message">Observação (opcional)</Label>
            <Textarea
              id="proof-message"
              placeholder="Ex: PIX feito em 29/04 às 14h, valor R$ 50,00"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Enviar comprovante
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
