import { useEffect, useRef, useState, useCallback } from "react";
import { Rnd } from "react-rnd";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, Save, Eye, Plus, Trash2, ImageIcon, Type, AlignLeft, AlignCenter, AlignRight, Bold, Italic } from "lucide-react";
import { generateCertificatePdf, type FieldPosition } from "@/lib/certificatePdf";

interface Props {
  eventId: string;
}

const VARIABLES: { key: string; label: string; defaultContent: string }[] = [
  { key: "nome", label: "Nome do participante", defaultContent: "{nome}" },
  { key: "evento", label: "Nome do evento", defaultContent: "{evento}" },
  { key: "data_inicio", label: "Data de início", defaultContent: "{data_inicio}" },
  { key: "data_fim", label: "Data de término", defaultContent: "{data_fim}" },
  { key: "carga_horaria", label: "Carga horária", defaultContent: "{carga_horaria}h" },
  { key: "codigo", label: "Código do certificado", defaultContent: "Código: {codigo}" },
  { key: "validacao", label: "Hash de validação", defaultContent: "Validação: {validacao}" },
];

const FONT_OPTIONS = [
  { value: "helvetica", label: "Helvetica (sans)" },
  { value: "times", label: "Times (serif)" },
  { value: "courier", label: "Courier (mono)" },
] as const;

// A4 landscape ratio
const PAGE_RATIO = 297 / 210;

function uid() { return Math.random().toString(36).slice(2, 10); }

function defaultField(key: string, content: string): FieldPosition {
  return {
    id: uid(),
    key,
    content,
    x: 30, y: 45, w: 40, h: 10,
    fontFamily: "helvetica",
    fontSize: 18,
    fontWeight: "normal",
    fontStyle: "normal",
    align: "center",
    color: "#1e3a5f",
  };
}

export default function CertificateVisualEditor({ eventId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldPosition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 800 / PAGE_RATIO });

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Load template
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("certificate_templates")
        .select("*")
        .eq("event_id", eventId)
        .maybeSingle();
      if (data) {
        setTemplateId(data.id);
        setBackgroundUrl((data as any).background_url || null);
        const fp = (data as any).field_positions;
        setFields(Array.isArray(fp) ? (fp as FieldPosition[]) : []);
      } else {
        setTemplateId(null);
        setBackgroundUrl(null);
        setFields([]);
      }
      setLoading(false);
    })();
  }, [eventId]);

  // Responsive canvas sizing (keeps A4 landscape ratio)
  useEffect(() => {
    function recalc() {
      const el = containerRef.current;
      if (!el) return;
      const w = Math.min(el.clientWidth, 1100);
      setCanvasSize({ w, h: w / PAGE_RATIO });
    }
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, []);

  const selected = fields.find(f => f.id === selectedId) || null;

  function updateField(id: string, patch: Partial<FieldPosition>) {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }

  function addField(key: string, content: string) {
    if (!backgroundUrl) {
      toast.error("Envie a imagem de fundo primeiro");
      return;
    }
    const f = defaultField(key, content);
    setFields(prev => [...prev, f]);
    setSelectedId(f.id);
  }

  function addTextField() {
    if (!backgroundUrl) {
      toast.error("Envie a imagem de fundo primeiro");
      return;
    }
    const f = defaultField("text", "Texto livre");
    f.fontSize = 14;
    setFields(prev => [...prev, f]);
    setSelectedId(f.id);
  }

  function removeField(id: string) {
    setFields(prev => prev.filter(f => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  async function handleBackgroundUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${eventId}/background/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("certificate-assets").upload(path, file, { upsert: true });
    if (error) { toast.error("Erro ao enviar imagem"); return; }
    const { data } = supabase.storage.from("certificate-assets").getPublicUrl(path);
    setBackgroundUrl(data.publicUrl);
    toast.success("Imagem de fundo enviada!");
  }

  async function handleSave() {
    setSaving(true);
    const payload: any = {
      event_id: eventId,
      background_url: backgroundUrl,
      field_positions: fields,
      // keep legacy required cols populated
      body_text: "—",
      frame_style: "classic",
      signature_count: 1,
      signature_position: "center",
      signatures: [],
    };
    if (templateId) {
      const { error } = await supabase.from("certificate_templates").update(payload).eq("id", templateId);
      if (error) { toast.error("Erro ao salvar"); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from("certificate_templates").insert(payload).select().single();
      if (error) { toast.error("Erro ao criar template"); setSaving(false); return; }
      setTemplateId(data.id);
    }
    toast.success("Template salvo!");
    setSaving(false);
  }

  const handlePreview = useCallback(async () => {
    if (!backgroundUrl) { toast.error("Envie a imagem de fundo primeiro"); return; }
    setPreviewing(true);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    try {
      const doc = await generateCertificatePdf({
        backgroundUrl,
        fieldPositions: fields,
        participantName: "NOME DO PARTICIPANTE",
        eventTitle: "Nome do Evento Exemplo",
        startDate: "01/01/2026",
        endDate: "03/01/2026",
        workloadHours: 20,
        certificateCode: "CERT-EXEMPLO",
        validationHash: "preview-hash-1234",
      });
      const blob = doc.output("blob");
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar pré-visualização");
    }
    setPreviewing(false);
  }, [backgroundUrl, fields, previewUrl]);

  // Cleanup blob URL on unmount or when event changes
  useEffect(() => {
    return () => {
      if (previewUrl) {
        try { URL.revokeObjectURL(previewUrl); } catch {}
      }
    };
  }, [previewUrl]);

  if (loading) {
    return <div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  // Empty state
  if (!backgroundUrl) {
    return (
      <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-10 text-center space-y-4">
        <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
        <div>
          <h3 className="font-serif text-xl font-bold text-foreground">Editor visual do certificado</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Envie a imagem de fundo do seu certificado (PNG/JPG, A4 paisagem) para começar a posicionar as informações.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Upload className="h-4 w-4" /> Enviar imagem de fundo
          <input type="file" accept="image/*" className="hidden" onChange={handleBackgroundUpload} />
        </label>
      </div>
    );
  }

  // Convert px ↔ %
  const toPxX = (pct: number) => (pct / 100) * canvasSize.w;
  const toPxY = (pct: number) => (pct / 100) * canvasSize.h;
  const toPctX = (px: number) => (px / canvasSize.w) * 100;
  const toPctY = (px: number) => (px / canvasSize.h) * 100;

  // Scale factor for visual font preview (canvas px per page mm)
  const pxPerMmX = canvasSize.w / 297;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
        </Button>
        <Button variant="outline" onClick={handlePreview} disabled={previewing} className="gap-2">
          <Eye className="h-4 w-4" /> {previewing ? "Gerando..." : "Pré-visualizar PDF"}
        </Button>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
          <Upload className="h-3.5 w-3.5" /> Trocar imagem
          <input type="file" accept="image/*" className="hidden" onChange={handleBackgroundUpload} />
        </label>
        <Badge variant="secondary">{fields.length} campo{fields.length !== 1 ? "s" : ""}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Canvas */}
        <div ref={containerRef} className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Arraste e redimensione cada caixa diretamente sobre o certificado. Clique para editar propriedades.
          </p>
          <div
            ref={canvasRef}
            className="relative rounded-lg shadow-lg border border-border overflow-hidden bg-white mx-auto"
            style={{
              width: canvasSize.w,
              height: canvasSize.h,
              backgroundImage: `url(${backgroundUrl})`,
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
          >
            {fields.map(f => {
              const isSelected = f.id === selectedId;
              return (
                <Rnd
                  key={f.id}
                  bounds="parent"
                  size={{ width: toPxX(f.w), height: toPxY(f.h) }}
                  position={{ x: toPxX(f.x), y: toPxY(f.y) }}
                  onDragStop={(_, d) => {
                    updateField(f.id, { x: toPctX(d.x), y: toPctY(d.y) });
                  }}
                  onResizeStop={(_, __, ref, ___, pos) => {
                    updateField(f.id, {
                      w: toPctX(ref.offsetWidth),
                      h: toPctY(ref.offsetHeight),
                      x: toPctX(pos.x),
                      y: toPctY(pos.y),
                    });
                  }}
                  onClick={() => setSelectedId(f.id)}
                  className={`flex items-start ${isSelected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/40"}`}
                  style={{
                    background: isSelected ? "rgba(59,130,246,0.06)" : "transparent",
                    border: isSelected ? "1px dashed hsl(var(--primary))" : "1px dashed rgba(0,0,0,0.15)",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      fontFamily: f.fontFamily === "times" ? "Times, serif" : f.fontFamily === "courier" ? "Courier, monospace" : "Helvetica, Arial, sans-serif",
                      fontSize: Math.max(8, f.fontSize * pxPerMmX * 0.353),
                      fontWeight: f.fontWeight,
                      fontStyle: f.fontStyle,
                      textAlign: f.align,
                      color: f.color,
                      lineHeight: 1.15,
                      overflow: "hidden",
                      padding: 2,
                      cursor: "move",
                      userSelect: "none",
                    }}
                  >
                    {f.content}
                  </div>
                </Rnd>
              );
            })}
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3 space-y-2">
            <Label className="text-sm font-semibold">Adicionar variáveis</Label>
            <div className="grid grid-cols-1 gap-1.5">
              {VARIABLES.map(v => (
                <Button
                  key={v.key}
                  variant="outline"
                  size="sm"
                  className="justify-start gap-2 text-xs"
                  onClick={() => addField(v.key, v.defaultContent)}
                >
                  <Plus className="h-3 w-3" />
                  {v.label}
                </Button>
              ))}
              <Button variant="outline" size="sm" className="justify-start gap-2 text-xs" onClick={addTextField}>
                <Type className="h-3 w-3" />
                Texto livre
              </Button>
            </div>
          </div>

          {selected ? (
            <div className="rounded-lg border-2 border-primary bg-primary/5 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Propriedades</Label>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeField(selected.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Conteúdo</Label>
                <Textarea
                  rows={2}
                  value={selected.content}
                  onChange={e => updateField(selected.id, { content: e.target.value })}
                  className="text-xs"
                />
                <div className="flex flex-wrap gap-1">
                  {VARIABLES.map(v => (
                    <Badge
                      key={v.key}
                      variant="outline"
                      className="cursor-pointer text-[10px] px-1.5 py-0 h-5 hover:bg-primary hover:text-primary-foreground"
                      onClick={() => updateField(selected.id, { content: (selected.content || "") + ` {${v.key}}` })}
                    >
                      {`{${v.key}}`}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Fonte</Label>
                  <Select value={selected.fontFamily} onValueChange={v => updateField(selected.id, { fontFamily: v as any })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tamanho ({selected.fontSize}pt)</Label>
                  <Input
                    type="number"
                    min={8}
                    max={72}
                    value={selected.fontSize}
                    onChange={e => updateField(selected.id, { fontSize: Math.max(8, Math.min(72, Number(e.target.value) || 12)) })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                <Button
                  type="button" size="sm" variant={selected.fontWeight === "bold" ? "default" : "outline"}
                  className="h-7 w-7 p-0"
                  onClick={() => updateField(selected.id, { fontWeight: selected.fontWeight === "bold" ? "normal" : "bold" })}
                ><Bold className="h-3 w-3" /></Button>
                <Button
                  type="button" size="sm" variant={selected.fontStyle === "italic" ? "default" : "outline"}
                  className="h-7 w-7 p-0"
                  onClick={() => updateField(selected.id, { fontStyle: selected.fontStyle === "italic" ? "normal" : "italic" })}
                ><Italic className="h-3 w-3" /></Button>
                <div className="mx-1 w-px bg-border" />
                <Button
                  type="button" size="sm" variant={selected.align === "left" ? "default" : "outline"}
                  className="h-7 w-7 p-0" onClick={() => updateField(selected.id, { align: "left" })}
                ><AlignLeft className="h-3 w-3" /></Button>
                <Button
                  type="button" size="sm" variant={selected.align === "center" ? "default" : "outline"}
                  className="h-7 w-7 p-0" onClick={() => updateField(selected.id, { align: "center" })}
                ><AlignCenter className="h-3 w-3" /></Button>
                <Button
                  type="button" size="sm" variant={selected.align === "right" ? "default" : "outline"}
                  className="h-7 w-7 p-0" onClick={() => updateField(selected.id, { align: "right" })}
                ><AlignRight className="h-3 w-3" /></Button>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Cor</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={selected.color}
                    onChange={e => updateField(selected.id, { color: e.target.value })}
                    className="h-8 w-12 rounded border border-border cursor-pointer"
                  />
                  <Input
                    value={selected.color}
                    onChange={e => updateField(selected.id, { color: e.target.value })}
                    className="h-8 text-xs flex-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                <div>X: {selected.x.toFixed(1)}%</div>
                <div>Y: {selected.y.toFixed(1)}%</div>
                <div>L: {selected.w.toFixed(1)}%</div>
                <div>A: {selected.h.toFixed(1)}%</div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Clique em uma caixa no certificado para editar suas propriedades.
            </div>
          )}

          {fields.length > 0 && (
            <div className="rounded-lg border border-border p-3 space-y-1.5">
              <Label className="text-sm font-semibold">Campos ({fields.length})</Label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {fields.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedId(f.id)}
                    className={`flex w-full items-center justify-between rounded px-2 py-1 text-xs ${
                      selectedId === f.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    <span className="truncate">{f.content || `{${f.key}}`}</span>
                    <span className="opacity-60 ml-2">{f.key}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {previewUrl && (
        <div className="space-y-2">
          <Label className="text-base font-semibold">Pré-visualização do PDF</Label>
          <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
            <iframe src={previewUrl} className="w-full h-[500px]" title="Preview" />
          </div>
        </div>
      )}
    </div>
  );
}
