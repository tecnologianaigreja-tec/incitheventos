import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, Save, X, Eye, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateCertificatePdf, type FrameStyle, type SignaturePosition, type SignatureItem } from "@/lib/certificatePdf";

interface Props {
  eventId: string;
}

const VARIABLES = [
  { key: "{nome}", label: "Nome" },
  { key: "{evento}", label: "Evento" },
  { key: "{data_inicio}", label: "Início" },
  { key: "{data_fim}", label: "Fim" },
  { key: "{carga_horaria}", label: "Carga horária" },
  { key: "{codigo}", label: "Código" },
];

const DEFAULT_TEXT = "Certificamos que {nome} participou do evento {evento}, realizado no período de {data_inicio} a {data_fim}, com carga horária de {carga_horaria} horas.";

const FRAME_OPTIONS: { value: FrameStyle; label: string; desc: string }[] = [
  { value: "classic", label: "Clássico", desc: "Bordas duplas em azul marinho" },
  { value: "elegant", label: "Elegante", desc: "Moldura dourada com ornamentos" },
  { value: "modern", label: "Moderno", desc: "Faixa lateral com acento azul" },
  { value: "minimal", label: "Minimalista", desc: "Borda fina e discreta" },
];

const emptySignature = (): SignatureItem => ({ image_url: null, name: "", title: "" });

export default function CertificateTemplateEditor({ eventId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bodyText, setBodyText] = useState(DEFAULT_TEXT);
  const [frameStyle, setFrameStyle] = useState<FrameStyle>("classic");
  const [signatures, setSignatures] = useState<SignatureItem[]>([emptySignature()]);
  const [signaturePosition, setSignaturePosition] = useState<SignaturePosition>("center");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    loadTemplate();
  }, [eventId]);

  async function loadTemplate() {
    setLoading(true);
    const { data } = await supabase
      .from("certificate_templates")
      .select("*")
      .eq("event_id", eventId)
      .maybeSingle();

    if (data) {
      setTemplateId(data.id);
      setLogoUrl(data.logo_url);
      setBodyText(data.body_text);
      setFrameStyle((data.frame_style as FrameStyle) || "classic");
      setSignaturePosition((data.signature_position as SignaturePosition) || "center");
      const sigs = data.signatures as unknown as SignatureItem[];
      if (Array.isArray(sigs) && sigs.length > 0) {
        setSignatures(sigs);
      }
    }
    setLoading(false);
  }

  async function uploadFile(file: File, folder: string): Promise<string | null> {
    const ext = file.name.split(".").pop();
    const path = `${eventId}/${folder}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("certificate-assets").upload(path, file, { upsert: true });
    if (error) { toast.error("Erro ao fazer upload"); return null; }
    const { data } = supabase.storage.from("certificate-assets").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file, "logos");
    if (url) setLogoUrl(url);
  }

  async function handleSignatureUpload(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file, "signatures");
    if (url) {
      setSignatures(prev => prev.map((s, i) => i === index ? { ...s, image_url: url } : s));
    }
  }

  function updateSignature(index: number, field: keyof SignatureItem, value: string | null) {
    setSignatures(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }

  function addSignature() {
    if (signatures.length >= 3) { toast.info("Máximo de 3 assinaturas"); return; }
    setSignatures(prev => [...prev, emptySignature()]);
  }

  function removeSignature(index: number) {
    if (signatures.length <= 1) return;
    setSignatures(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      event_id: eventId,
      logo_url: logoUrl,
      body_text: bodyText,
      frame_style: frameStyle,
      signature_count: signatures.length,
      signature_position: signaturePosition,
      signatures: signatures as unknown as any,
      // Keep legacy fields in sync
      signature_image_url: signatures[0]?.image_url || null,
      signature_name: signatures[0]?.name || null,
      signature_title: signatures[0]?.title || null,
    };

    if (templateId) {
      const { error } = await supabase.from("certificate_templates").update(payload).eq("id", templateId);
      if (error) { toast.error("Erro ao salvar"); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from("certificate_templates").insert(payload).select().single();
      if (error) { toast.error("Erro ao criar"); setSaving(false); return; }
      setTemplateId(data.id);
    }
    toast.success("Template salvo!");
    setSaving(false);
  }

  const handlePreview = useCallback(async () => {
    setPreviewing(true);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    try {
      const doc = await generateCertificatePdf({
        logoUrl,
        bodyText,
        frameStyle,
        signatures,
        signaturePosition,
        participantName: "NOME DO PARTICIPANTE",
        eventTitle: "Nome do Evento Exemplo",
        startDate: "01/01/2026",
        endDate: "03/01/2026",
        workloadHours: 20,
        certificateCode: "CERT-EXEMPLO",
        validationHash: "preview-hash",
      });
      const blob = doc.output("blob");
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar pré-visualização");
    }
    setPreviewing(false);
  }, [logoUrl, bodyText, frameStyle, signatures, signaturePosition]);

  function insertVariable(variable: string) {
    setBodyText(prev => prev + " " + variable);
  }

  if (loading) {
    return <div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Frame selection */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Modelo de Moldura</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {FRAME_OPTIONS.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFrameStyle(f.value)}
              className={`rounded-lg border-2 p-3 text-left transition-all ${
                frameStyle === f.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-muted-foreground/40"
              }`}
            >
              <FramePreviewMini style={f.value} />
              <p className="mt-2 text-sm font-medium text-foreground">{f.label}</p>
              <p className="text-[11px] text-muted-foreground">{f.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Logo */}
      <div className="space-y-2">
        <Label>Logo do Certificado</Label>
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <div className="relative">
              <img src={logoUrl} alt="Logo" className="h-16 max-w-[200px] object-contain rounded border border-border p-1" />
              <button onClick={() => setLogoUrl(null)} className="absolute -top-2 -right-2 rounded-full bg-destructive p-0.5 text-destructive-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors">
              <Upload className="h-4 w-4" />
              Enviar logo
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </label>
          )}
        </div>
      </div>

      {/* Body text */}
      <div className="space-y-2">
        <Label>Texto do Certificado</Label>
        <p className="text-xs text-muted-foreground">Clique nas variáveis para inserir:</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {VARIABLES.map(v => (
            <Badge
              key={v.key}
              variant="secondary"
              className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
              onClick={() => insertVariable(v.key)}
            >
              {v.key} <span className="ml-1 opacity-60 text-[10px]">{v.label}</span>
            </Badge>
          ))}
        </div>
        <Textarea value={bodyText} onChange={e => setBodyText(e.target.value)} rows={4} />
      </div>

      {/* Signatures */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Assinaturas ({signatures.length})</Label>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Posição:</Label>
              <Select value={signaturePosition} onValueChange={v => setSignaturePosition(v as SignaturePosition)}>
                <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Esquerda</SelectItem>
                  <SelectItem value="center">Centro</SelectItem>
                  <SelectItem value="right">Direita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addSignature} disabled={signatures.length >= 3} className="gap-1">
              <Plus className="h-3 w-3" /> Adicionar
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {signatures.map((sig, idx) => (
            <div key={idx} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Assinatura {idx + 1}</span>
                {signatures.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeSignature(idx)} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Imagem</Label>
                  {sig.image_url ? (
                    <div className="relative inline-block">
                      <img src={sig.image_url} alt="Assinatura" className="h-10 max-w-[120px] object-contain rounded border border-border p-1" />
                      <button onClick={() => updateSignature(idx, "image_url", null)} className="absolute -top-1 -right-1 rounded-full bg-destructive p-0.5 text-destructive-foreground">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                      <Upload className="h-3 w-3" />
                      Enviar
                      <input type="file" accept="image/*" className="hidden" onChange={e => handleSignatureUpload(idx, e)} />
                    </label>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nome</Label>
                  <Input className="h-8 text-sm" value={sig.name} onChange={e => updateSignature(idx, "name", e.target.value)} placeholder="Nome do assinante" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cargo</Label>
                  <Input className="h-8 text-sm" value={sig.title} onChange={e => updateSignature(idx, "title", e.target.value)} placeholder="Cargo / título" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar Template"}
        </Button>
        <Button variant="outline" onClick={handlePreview} disabled={previewing} className="gap-2">
          <Eye className="h-4 w-4" />
          {previewing ? "Gerando..." : "Pré-visualizar"}
        </Button>
      </div>

      {/* Preview */}
      {previewUrl && (
        <div className="space-y-2">
          <Label className="text-base font-semibold">Pré-visualização</Label>
          <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
            <iframe src={previewUrl} className="w-full h-[400px] sm:h-[500px]" title="Preview do certificado" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Mini frame preview thumbnails */
function FramePreviewMini({ style }: { style: FrameStyle }) {
  const w = 80;
  const h = 56;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" aria-hidden>
      <rect x={0} y={0} width={w} height={h} fill="white" />
      {style === "classic" && (
        <>
          <rect x={3} y={3} width={w - 6} height={h - 6} fill="none" stroke="#1e3a5f" strokeWidth={1.2} />
          <rect x={5} y={5} width={w - 10} height={h - 10} fill="none" stroke="#1e3a5f" strokeWidth={0.4} />
        </>
      )}
      {style === "elegant" && (
        <>
          <rect x={3} y={3} width={w - 6} height={h - 6} fill="none" stroke="#b4963c" strokeWidth={1.5} />
          <rect x={5} y={5} width={w - 10} height={h - 10} fill="none" stroke="#b4963c" strokeWidth={0.4} />
          <line x1={5} y1={5} x2={15} y2={5} stroke="#b4963c" strokeWidth={1} />
          <line x1={5} y1={5} x2={5} y2={15} stroke="#b4963c" strokeWidth={1} />
          <line x1={w - 5} y1={5} x2={w - 15} y2={5} stroke="#b4963c" strokeWidth={1} />
          <line x1={w - 5} y1={5} x2={w - 5} y2={15} stroke="#b4963c" strokeWidth={1} />
        </>
      )}
      {style === "modern" && (
        <>
          <rect x={3} y={3} width={3} height={h - 6} fill="#2d64a0" />
          <rect x={3} y={3} width={w - 6} height={h - 6} fill="none" stroke="#ccc" strokeWidth={0.4} />
          <line x1={6} y1={3} x2={w - 3} y2={3} stroke="#2d64a0" strokeWidth={1.2} />
        </>
      )}
      {style === "minimal" && (
        <rect x={6} y={6} width={w - 12} height={h - 12} fill="none" stroke="#aaa" strokeWidth={0.3} />
      )}
      {/* Text placeholders */}
      <rect x={w / 2 - 12} y={h / 2 - 3} width={24} height={2} rx={1} fill="#ccc" />
      <rect x={w / 2 - 18} y={h / 2 + 2} width={36} height={1.5} rx={0.75} fill="#e0e0e0" />
      <rect x={w / 2 - 15} y={h / 2 + 5} width={30} height={1.5} rx={0.75} fill="#e0e0e0" />
    </svg>
  );
}
