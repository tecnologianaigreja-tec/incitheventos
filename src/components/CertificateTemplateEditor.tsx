import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, Save, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  eventId: string;
}

const VARIABLES = [
  { key: "{nome}", label: "Nome do participante" },
  { key: "{evento}", label: "Título do evento" },
  { key: "{data_inicio}", label: "Data de início" },
  { key: "{data_fim}", label: "Data de fim" },
  { key: "{carga_horaria}", label: "Carga horária" },
  { key: "{codigo}", label: "Código do certificado" },
];

const DEFAULT_TEXT = "Certificamos que {nome} participou do evento {evento}, realizado no período de {data_inicio} a {data_fim}, com carga horária de {carga_horaria} horas.";

export default function CertificateTemplateEditor({ eventId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bodyText, setBodyText] = useState(DEFAULT_TEXT);
  const [signatureImageUrl, setSignatureImageUrl] = useState<string | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [signatureTitle, setSignatureTitle] = useState("");

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
      setSignatureImageUrl(data.signature_image_url);
      setSignatureName(data.signature_name || "");
      setSignatureTitle(data.signature_title || "");
    }
    setLoading(false);
  }

  async function uploadFile(file: File, folder: string): Promise<string | null> {
    const ext = file.name.split(".").pop();
    const path = `${eventId}/${folder}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("certificate-assets").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Erro ao fazer upload");
      return null;
    }
    const { data } = supabase.storage.from("certificate-assets").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file, "logos");
    if (url) setLogoUrl(url);
  }

  async function handleSignatureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file, "signatures");
    if (url) setSignatureImageUrl(url);
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      event_id: eventId,
      logo_url: logoUrl,
      body_text: bodyText,
      signature_image_url: signatureImageUrl,
      signature_name: signatureName || null,
      signature_title: signatureTitle || null,
    };

    if (templateId) {
      const { error } = await supabase.from("certificate_templates").update(payload).eq("id", templateId);
      if (error) { toast.error("Erro ao salvar template"); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from("certificate_templates").insert(payload).select().single();
      if (error) { toast.error("Erro ao criar template"); setSaving(false); return; }
      setTemplateId(data.id);
    }

    toast.success("Template do certificado salvo!");
    setSaving(false);
  }

  function insertVariable(variable: string) {
    setBodyText((prev) => prev + " " + variable);
  }

  if (loading) {
    return <div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
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
        <p className="text-xs text-muted-foreground">Use as variáveis abaixo para inserir dados dinâmicos:</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {VARIABLES.map((v) => (
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
        <Textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          rows={5}
          placeholder="Texto do certificado..."
        />
      </div>

      {/* Signature */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Assinatura</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Imagem da Assinatura</Label>
            <div className="flex items-center gap-4">
              {signatureImageUrl ? (
                <div className="relative">
                  <img src={signatureImageUrl} alt="Assinatura" className="h-12 max-w-[160px] object-contain rounded border border-border p-1" />
                  <button onClick={() => setSignatureImageUrl(null)} className="absolute -top-2 -right-2 rounded-full bg-destructive p-0.5 text-destructive-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                  <Upload className="h-4 w-4" />
                  Enviar assinatura
                  <input type="file" accept="image/*" className="hidden" onChange={handleSignatureUpload} />
                </label>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome do Assinante</Label>
              <Input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="Ex: João Silva" />
            </div>
            <div className="space-y-1">
              <Label>Cargo / Título</Label>
              <Input value={signatureTitle} onChange={(e) => setSignatureTitle(e.target.value)} placeholder="Ex: Coordenador Geral" />
            </div>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        <Save className="h-4 w-4" />
        {saving ? "Salvando..." : "Salvar Template"}
      </Button>
    </div>
  );
}
