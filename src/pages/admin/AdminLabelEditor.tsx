import { useEffect, useMemo, useState } from "react";
import { Rnd } from "react-rnd";
import { supabase } from "@/integrations/supabase/client";
import type { LabelTemplate, LabelElement } from "@/lib/labelTypes";
import { FIXED_SOURCES } from "@/lib/labelTypes";
import type { EventFormField } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, QrCode, Type, Trash2, Save, Eye, Loader2, Printer } from "lucide-react";
import { printLabels } from "@/lib/labelRenderer";

const PX_PER_MM = 4; // editor scale

function newId() {
  return crypto.randomUUID();
}

export default function AdminLabelEditor() {
  const [template, setTemplate] = useState<LabelTemplate | null>(null);
  const [customFields, setCustomFields] = useState<EventFormField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: tpl } = await supabase
        .from("label_template")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (tpl) {
        setTemplate({
          id: (tpl as any).id,
          width_mm: Number((tpl as any).width_mm) || 90.3,
          height_mm: Number((tpl as any).height_mm) || 29,
          elements: ((tpl as any).elements || []) as LabelElement[],
          updated_at: (tpl as any).updated_at,
        });
      }
      const { data: fields } = await supabase
        .from("event_form_fields")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (fields) {
        const seen = new Set<string>();
        const unique: EventFormField[] = [];
        for (const f of fields as unknown as EventFormField[]) {
          if (!seen.has(f.field_key)) {
            seen.add(f.field_key);
            unique.push(f);
          }
        }
        setCustomFields(unique);
      }
      setLoading(false);
    })();
  }, []);

  const sources = useMemo(() => {
    return [
      ...FIXED_SOURCES,
      ...customFields.map(f => ({ key: `custom:${f.field_key}`, label: `[Campo] ${f.field_label}` })),
    ];
  }, [customFields]);

  function addText() {
    if (!template) return;
    const textCount = template.elements.filter(e => e.type === "text").length;
    // Cascade new elements so they don't stack invisibly on top of each other
    const offset = (textCount % 5) * 2;
    const el: LabelElement = {
      id: newId(),
      type: "text",
      x_mm: Math.min(4 + offset, Math.max(0, template.width_mm - 42)),
      y_mm: Math.min(4 + textCount * 7, Math.max(0, template.height_mm - 7)),
      width_mm: 40,
      height_mm: 6,
      font_size_pt: 11,
      font_weight: "normal",
      align: "left",
      source: "static",
      static_text: `Texto ${textCount + 1}`,
    };
    setTemplate({ ...template, elements: [...template.elements, el] });
    setSelectedId(el.id);
  }

  function addQr() {
    if (!template) return;
    const el: LabelElement = {
      id: newId(),
      type: "qrcode",
      x_mm: template.width_mm - 26,
      y_mm: 2,
      width_mm: 24,
      height_mm: 24,
      source: "qr_token",
    };
    setTemplate({ ...template, elements: [...template.elements, el] });
    setSelectedId(el.id);
  }

  function updateEl(id: string, patch: Partial<LabelElement>) {
    if (!template) return;
    setTemplate({
      ...template,
      elements: template.elements.map(e => e.id === id ? { ...e, ...patch } : e),
    });
  }

  function removeEl(id: string) {
    if (!template) return;
    setTemplate({ ...template, elements: template.elements.filter(e => e.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }

  async function save() {
    if (!template) return;
    setSaving(true);
    const { error } = await supabase
      .from("label_template")
      .update({
        width_mm: template.width_mm,
        height_mm: template.height_mm,
        elements: template.elements as any,
      })
      .eq("id", template.id);
    if (error) {
      toast.error("Erro ao salvar template");
    } else {
      toast.success("Template salvo!");
    }
    setSaving(false);
  }

  async function preview() {
    if (!template) return;
    const sample: Record<string, any> = {
      full_name: "JOÃO DA SILVA",
      registration_code: "ABC-1234",
      cpf: "000.000.000-00",
      phone: "(11) 99999-9999",
      email: "joao@exemplo.com",
      congregation: "Sede",
      area: "Área 1",
      church_role: "Membro",
      church_function: "Diácono",
      qr_token: "preview-token-sample-1234567890",
      custom_fields: Object.fromEntries(customFields.map(f => [f.field_key, f.field_label])),
    };
    await printLabels([sample], template);
  }

  if (loading || !template) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const selected = template.elements.find(e => e.id === selectedId) || null;

  const canvasW = template.width_mm * PX_PER_MM;
  const canvasH = template.height_mm * PX_PER_MM;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl font-bold text-foreground">Editor de Etiquetas</h2>
          <p className="text-sm text-muted-foreground">DK-1201 — {template.width_mm} × {template.height_mm} mm</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={preview} className="gap-2"><Eye className="h-4 w-4" /> Pré-visualizar</Button>
          <Button size="sm" onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Layout (escala 4× para visualização)</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={addText} className="gap-1"><Type className="h-3.5 w-3.5" /> Texto</Button>
                <Button size="sm" variant="outline" onClick={addQr} className="gap-1"><QrCode className="h-3.5 w-3.5" /> QR Code</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border border-dashed border-border bg-muted/30 p-6">
              <div
                className="relative bg-card shadow-sm"
                style={{ width: canvasW, height: canvasH, outline: "1px solid hsl(var(--border))" }}
                onClick={() => setSelectedId(null)}
              >
                {template.elements.map(el => (
                  <Rnd
                    key={el.id}
                    size={{ width: el.width_mm * PX_PER_MM, height: el.height_mm * PX_PER_MM }}
                    position={{ x: el.x_mm * PX_PER_MM, y: el.y_mm * PX_PER_MM }}
                    bounds="parent"
                    onDragStop={(_, d) =>
                      updateEl(el.id, { x_mm: +(d.x / PX_PER_MM).toFixed(2), y_mm: +(d.y / PX_PER_MM).toFixed(2) })
                    }
                    onResizeStop={(_, __, ref, ___, pos) =>
                      updateEl(el.id, {
                        width_mm: +(ref.offsetWidth / PX_PER_MM).toFixed(2),
                        height_mm: +(ref.offsetHeight / PX_PER_MM).toFixed(2),
                        x_mm: +(pos.x / PX_PER_MM).toFixed(2),
                        y_mm: +(pos.y / PX_PER_MM).toFixed(2),
                      })
                    }
                    onClick={(e: any) => { e.stopPropagation(); setSelectedId(el.id); }}
                    className={selectedId === el.id ? "ring-2 ring-primary" : "ring-1 ring-border"}
                    style={{ background: el.type === "qrcode" ? "hsl(var(--muted))" : "transparent" }}
                  >
                    <div className="flex h-full w-full items-center justify-center overflow-hidden p-0.5 text-[10px] text-foreground/80 select-none pointer-events-none">
                      {el.type === "qrcode" ? (
                        <QrCode className="h-full w-full opacity-60" />
                      ) : (
                        <span style={{
                          fontWeight: el.font_weight,
                          fontSize: Math.max(8, (el.font_size_pt || 10) * 1.2),
                          textAlign: el.align,
                          width: "100%",
                          lineHeight: 1.1,
                        }}>
                          {sourceLabel(el, sources)}
                        </span>
                      )}
                    </div>
                  </Rnd>
                ))}
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Clique em um elemento para editá-lo. Arraste para mover. Use os cantos para redimensionar.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Propriedades</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected && <p className="text-sm text-muted-foreground">Nenhum elemento selecionado.</p>}
            {selected && (
              <>
                <div>
                  <Label>Origem do dado</Label>
                  <Select value={selected.source} onValueChange={(v) => updateEl(selected.id, { source: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {selected.type === "qrcode" ? (
                        <SelectItem value="qr_token">QR Code (check-in)</SelectItem>
                      ) : (
                        <>
                          {FIXED_SOURCES.filter(s => s.key !== "qr_token").map(s => (
                            <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                          ))}
                          {customFields.length > 0 && (
                            <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground border-t mt-1">
                              Campos do formulário
                            </div>
                          )}
                          {customFields.map(f => (
                            <SelectItem key={`custom:${f.field_key}`} value={`custom:${f.field_key}`}>
                              {f.field_label}
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  {selected.type === "text" && selected.source !== "static" && !resolveSampleValue(selected.source) && (
                    <p className="mt-1 text-[11px] text-amber-600">
                      Dica: se este dado for específico do seu evento (ex.: Congregação, Área), prefira selecionar a opção em "Campos do formulário".
                    </p>
                  )}
                </div>

                {selected.type === "text" && selected.source === "static" && (
                  <div>
                    <Label>Texto fixo</Label>
                    <Input
                      value={selected.static_text || ""}
                      onChange={(e) => updateEl(selected.id, { static_text: e.target.value })}
                    />
                  </div>
                )}

                {selected.type === "text" && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Tamanho (pt)</Label>
                        <Input
                          type="number" min={6} max={48}
                          value={selected.font_size_pt ?? 10}
                          onChange={(e) => updateEl(selected.id, { font_size_pt: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label>Peso</Label>
                        <Select value={selected.font_weight ?? "normal"} onValueChange={(v: any) => updateEl(selected.id, { font_weight: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="bold">Negrito</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Alinhamento</Label>
                      <Select value={selected.align ?? "left"} onValueChange={(v: any) => updateEl(selected.id, { align: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Esquerda</SelectItem>
                          <SelectItem value="center">Centro</SelectItem>
                          <SelectItem value="right">Direita</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>X (mm)</Label>
                    <Input type="number" step="0.1" value={selected.x_mm}
                      onChange={(e) => updateEl(selected.id, { x_mm: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Y (mm)</Label>
                    <Input type="number" step="0.1" value={selected.y_mm}
                      onChange={(e) => updateEl(selected.id, { y_mm: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Largura (mm)</Label>
                    <Input type="number" step="0.1" value={selected.width_mm}
                      onChange={(e) => updateEl(selected.id, { width_mm: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Altura (mm)</Label>
                    <Input type="number" step="0.1" value={selected.height_mm}
                      onChange={(e) => updateEl(selected.id, { height_mm: Number(e.target.value) })} />
                  </div>
                </div>

                <Button variant="destructive" size="sm" onClick={() => removeEl(selected.id)} className="w-full gap-2">
                  <Trash2 className="h-4 w-4" /> Remover elemento
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Printer className="h-4 w-4" /> Dicas de impressão</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1.5">
          <p>• Impressora: <strong>Brother QL</strong> com fita <strong>DK-1201 (29 × 90,3 mm)</strong>.</p>
          <p>• Na primeira impressão, selecione a Brother QL como destino, marque "Mais configurações" → margens "Nenhuma" e escala "100%".</p>
          <p>• Marque "Salvar como padrão" para impressões futuras.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function sourceLabel(el: LabelElement, sources: { key: string; label: string }[]): string {
  if (el.type === "text" && el.source === "static") return el.static_text || "[texto fixo]";
  const s = sources.find(s => s.key === el.source);
  return s ? `{${s.label}}` : `{${el.source}}`;
}
