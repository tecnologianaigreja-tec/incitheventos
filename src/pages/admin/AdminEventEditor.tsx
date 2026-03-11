import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { EventData, EventFormField, TargetAudienceItem, FaqItem } from "@/lib/types";
import { formatCentsToBRL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, GripVertical, Save, Image } from "lucide-react";

// ─── Form Builder Types ───
interface FieldDraft {
  id?: string;
  field_label: string;
  field_key: string;
  field_type: string;
  is_required: boolean;
  placeholder: string;
  options: string[];
  sort_order: number;
  is_active: boolean;
}

function emptyField(sort: number): FieldDraft {
  return { field_label: "", field_key: "", field_type: "text", is_required: false, placeholder: "", options: [], sort_order: sort, is_active: true };
}

// ─── Audience item defaults ───
const ICON_OPTIONS = ["Users", "BookOpen", "Shield", "Award", "Calendar", "MapPin", "Clock", "Star"];

export default function AdminEventEditor() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const isNew = !eventId || eventId === "novo";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // ─── Basic info ───
  const [form, setForm] = useState({
    title: "", subtitle: "", slug: "", description: "", start_date: "", end_date: "",
    start_time: "", end_time: "", location_name: "", address: "", city: "", state: "",
    workload_hours: "", organizer_name: "", unit_price_cents: "", max_participants: "",
    status: "draft", banner_url: "",
  });

  // ─── Landing page content ───
  const [heroBadge, setHeroBadge] = useState("");
  const [aboutTitle, setAboutTitle] = useState("");
  const [aboutDescription, setAboutDescription] = useState("");
  const [audience, setAudience] = useState<TargetAudienceItem[]>([]);
  const [includesItems, setIncludesItems] = useState<string[]>([]);
  const [faqItems, setFaqItems] = useState<FaqItem[]>([]);
  const [ctaTitle, setCtaTitle] = useState("");
  const [ctaDescription, setCtaDescription] = useState("");
  const [pricingLabel, setPricingLabel] = useState("");

  // ─── Form fields ───
  const [fields, setFields] = useState<FieldDraft[]>([]);
  const [deletedFieldIds, setDeletedFieldIds] = useState<string[]>([]);

  useEffect(() => {
    if (isNew) return;
    async function load() {
      const { data: ev } = await supabase.from("events").select("*").eq("id", eventId).single();
      if (!ev) { navigate("/admin/eventos"); return; }
      const e = ev as unknown as EventData;
      setForm({
        title: e.title, subtitle: e.subtitle || "", slug: e.slug, description: e.description || "",
        start_date: e.start_date, end_date: e.end_date, start_time: e.start_time || "",
        end_time: e.end_time || "", location_name: e.location_name || "", address: e.address || "",
        city: e.city || "", state: e.state || "", workload_hours: e.workload_hours?.toString() || "",
        organizer_name: e.organizer_name || "", unit_price_cents: (e.unit_price_cents / 100).toString(),
        max_participants: e.max_participants?.toString() || "", status: e.status,
        banner_url: e.banner_url || "",
      });
      setHeroBadge(e.hero_badge || "");
      setAboutTitle(e.about_title || "");
      setAboutDescription(e.about_description || "");
      setAudience(Array.isArray(e.target_audience) ? e.target_audience : []);
      setIncludesItems(Array.isArray(e.includes_items) ? e.includes_items : []);
      setFaqItems(Array.isArray(e.faq_items) ? e.faq_items : []);
      setCtaTitle(e.cta_title || "");
      setCtaDescription(e.cta_description || "");
      setPricingLabel(e.pricing_label || "");

      // Load form fields
      const { data: ff } = await supabase
        .from("event_form_fields")
        .select("*")
        .eq("event_id", eventId)
        .order("sort_order");
      if (ff) {
        setFields(ff.map((f: any) => ({
          id: f.id,
          field_label: f.field_label,
          field_key: f.field_key,
          field_type: f.field_type,
          is_required: f.is_required,
          placeholder: f.placeholder || "",
          options: Array.isArray(f.options) ? f.options : [],
          sort_order: f.sort_order,
          is_active: f.is_active,
        })));
      }
      setLoading(false);
    }
    load();
  }, [eventId, isNew, navigate]);

  function generateKey(label: string): string {
    return label.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  async function handleSave() {
    if (!form.title || !form.slug || !form.start_date || !form.end_date) {
      toast.error("Preencha os campos obrigatórios: Título, Slug, Datas");
      return;
    }
    setSaving(true);

    const payload: any = {
      title: form.title, subtitle: form.subtitle || null,
      slug: form.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      description: form.description || null, start_date: form.start_date, end_date: form.end_date,
      start_time: form.start_time || null, end_time: form.end_time || null,
      location_name: form.location_name || null, address: form.address || null,
      city: form.city || null, state: form.state || null,
      workload_hours: form.workload_hours ? parseFloat(form.workload_hours) : null,
      organizer_name: form.organizer_name || null,
      unit_price_cents: Math.round(parseFloat(form.unit_price_cents || "0") * 100),
      max_participants: form.max_participants ? parseInt(form.max_participants) : null,
      status: form.status,
      banner_url: form.banner_url || null,
      hero_badge: heroBadge || null,
      about_title: aboutTitle || null,
      about_description: aboutDescription || null,
      target_audience: audience,
      includes_items: includesItems,
      faq_items: faqItems,
      cta_title: ctaTitle || null,
      cta_description: ctaDescription || null,
      pricing_label: pricingLabel || null,
    };

    let savedEventId = eventId;

    if (isNew) {
      const { data, error } = await supabase.from("events").insert(payload).select("id").single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      savedEventId = data.id;
    } else {
      const { error } = await supabase.from("events").update(payload).eq("id", eventId);
      if (error) { toast.error("Erro ao atualizar"); setSaving(false); return; }
    }

    // Save form fields
    // Delete removed fields
    for (const id of deletedFieldIds) {
      await supabase.from("event_form_fields").delete().eq("id", id);
    }
    // Upsert fields
    for (const f of fields) {
      if (!f.field_label || !f.field_key) continue;
      const fieldPayload = {
        event_id: savedEventId!,
        field_label: f.field_label,
        field_key: f.field_key,
        field_type: f.field_type,
        is_required: f.is_required,
        placeholder: f.placeholder || null,
        options: f.options,
        sort_order: f.sort_order,
        is_active: f.is_active,
      };
      if (f.id) {
        await supabase.from("event_form_fields").update(fieldPayload).eq("id", f.id);
      } else {
        const { data } = await supabase.from("event_form_fields").insert(fieldPayload).select("id").single();
        if (data) f.id = data.id;
      }
    }

    toast.success(isNew ? "Evento criado!" : "Evento salvo!");
    setSaving(false);
    if (isNew && savedEventId) {
      navigate(`/admin/eventos/${savedEventId}`, { replace: true });
    }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate("/admin/eventos")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar Evento"}
        </Button>
      </div>

      <h2 className="font-serif text-xl font-bold text-foreground">
        {isNew ? "Novo Evento" : `Editar: ${form.title}`}
      </h2>

      <Tabs defaultValue="basic" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic">Dados Básicos</TabsTrigger>
          <TabsTrigger value="landing">Landing Page</TabsTrigger>
          <TabsTrigger value="form">Formulário</TabsTrigger>
        </TabsList>

        {/* ─── TAB: DADOS BÁSICOS ─── */}
        <TabsContent value="basic">
          <Card>
            <CardHeader><CardTitle className="font-serif">Informações do Evento</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Título *</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Subtítulo</Label>
                <Input value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} />
              </div>
              <div>
                <Label>Slug *</Label>
                <Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="conferencia-2026" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Rascunho</SelectItem>
                    <SelectItem value="published">Publicado</SelectItem>
                    <SelectItem value="closed">Encerrado</SelectItem>
                    <SelectItem value="canceled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Data início *</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>Data fim *</Label><Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
              <div><Label>Hora início</Label><Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} /></div>
              <div><Label>Hora fim</Label><Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} /></div>
              <div><Label>Local</Label><Input value={form.location_name} onChange={e => setForm({ ...form, location_name: e.target.value })} /></div>
              <div><Label>Endereço</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
              <div><Label>Cidade</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
              <div><Label>Estado</Label><Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} /></div>
              <div><Label>Carga horária (h)</Label><Input type="number" value={form.workload_hours} onChange={e => setForm({ ...form, workload_hours: e.target.value })} /></div>
              <div><Label>Organizador</Label><Input value={form.organizer_name} onChange={e => setForm({ ...form, organizer_name: e.target.value })} /></div>
              <div><Label>Valor unitário (R$) *</Label><Input type="number" step="0.01" value={form.unit_price_cents} onChange={e => setForm({ ...form, unit_price_cents: e.target.value })} /></div>
              <div><Label>Máx. participantes</Label><Input type="number" value={form.max_participants} onChange={e => setForm({ ...form, max_participants: e.target.value })} /></div>
              <div className="sm:col-span-2">
                <Label>Descrição</Label>
                <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB: LANDING PAGE ─── */}
        <TabsContent value="landing" className="space-y-6">
          {/* Banner */}
          <Card>
            <CardHeader><CardTitle className="font-serif text-base">Banner / Imagem de Fundo</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Label>URL do banner</Label>
              <Input value={form.banner_url} onChange={e => setForm({ ...form, banner_url: e.target.value })} placeholder="https://... (URL da imagem de fundo)" />
              {form.banner_url && (
                <div className="relative h-40 overflow-hidden rounded-lg border border-border">
                  <img src={form.banner_url} alt="Banner preview" className="h-full w-full object-cover" />
                </div>
              )}
              <p className="text-xs text-muted-foreground">Cole a URL de uma imagem hospedada. Ela será exibida como fundo da seção hero.</p>
            </CardContent>
          </Card>

          {/* Hero Badge */}
          <Card>
            <CardHeader><CardTitle className="font-serif text-base">Hero — Selo / Subtexto</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Label>Texto do selo (aparece acima do título)</Label>
              <Input value={heroBadge} onChange={e => setHeroBadge(e.target.value)} placeholder="Ex: Conferência 2026" />
            </CardContent>
          </Card>

          {/* About Section */}
          <Card>
            <CardHeader><CardTitle className="font-serif text-base">Seção "Sobre"</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Título da seção</Label>
                <Input value={aboutTitle} onChange={e => setAboutTitle(e.target.value)} placeholder="Sobre a Conferência" />
              </div>
              <div>
                <Label>Texto descritivo</Label>
                <Textarea value={aboutDescription} onChange={e => setAboutDescription(e.target.value)} rows={4} placeholder="Descreva o evento em detalhes..." />
              </div>
            </CardContent>
          </Card>

          {/* Target Audience */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-serif text-base">Público-Alvo (cards)</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setAudience([...audience, { title: "", description: "", icon: "Users" }])} className="gap-1">
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {audience.length === 0 && <p className="text-sm text-muted-foreground">Nenhum card adicionado. Clique em "Adicionar" para criar.</p>}
              {audience.map((a, i) => (
                <div key={i} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Card {i + 1}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setAudience(audience.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Ícone</Label>
                      <Select value={a.icon} onValueChange={v => { const u = [...audience]; u[i] = { ...u[i], icon: v }; setAudience(u); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ICON_OPTIONS.map(ic => <SelectItem key={ic} value={ic}>{ic}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Título</Label>
                      <Input value={a.title} onChange={e => { const u = [...audience]; u[i] = { ...u[i], title: e.target.value }; setAudience(u); }} />
                    </div>
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <Textarea value={a.description} onChange={e => { const u = [...audience]; u[i] = { ...u[i], description: e.target.value }; setAudience(u); }} rows={2} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Includes */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-serif text-base">O Que Está Incluso</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setIncludesItems([...includesItems, ""])} className="gap-1">
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {includesItems.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item adicionado.</p>}
              {includesItems.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={item} onChange={e => { const u = [...includesItems]; u[i] = e.target.value; setIncludesItems(u); }} placeholder="Ex: Acesso a todas as palestras" />
                  <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0 text-destructive" onClick={() => setIncludesItems(includesItems.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* FAQ */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-serif text-base">Perguntas Frequentes</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setFaqItems([...faqItems, { question: "", answer: "" }])} className="gap-1">
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {faqItems.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pergunta adicionada.</p>}
              {faqItems.map((faq, i) => (
                <div key={i} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Pergunta {i + 1}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setFaqItems(faqItems.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div>
                    <Label>Pergunta</Label>
                    <Input value={faq.question} onChange={e => { const u = [...faqItems]; u[i] = { ...u[i], question: e.target.value }; setFaqItems(u); }} />
                  </div>
                  <div>
                    <Label>Resposta</Label>
                    <Textarea value={faq.answer} onChange={e => { const u = [...faqItems]; u[i] = { ...u[i], answer: e.target.value }; setFaqItems(u); }} rows={2} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* CTA & Pricing */}
          <Card>
            <CardHeader><CardTitle className="font-serif text-base">Seção Final (CTA) e Investimento</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Título do CTA</Label>
                <Input value={ctaTitle} onChange={e => setCtaTitle(e.target.value)} placeholder="Ex: Esteja Preparado Para Dar Razão da Sua Esperança" />
              </div>
              <div>
                <Label>Descrição do CTA</Label>
                <Textarea value={ctaDescription} onChange={e => setCtaDescription(e.target.value)} rows={2} placeholder="Ex: Vagas limitadas. Inscreva-se..." />
              </div>
              <div>
                <Label>Rótulo de preço</Label>
                <Input value={pricingLabel} onChange={e => setPricingLabel(e.target.value)} placeholder="Ex: Inscrição Individual" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB: FORMULÁRIO ─── */}
        <TabsContent value="form" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-serif text-base">Campos do Formulário</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Os campos <strong>Nome completo</strong>, <strong>CPF</strong> e <strong>E-mail</strong> são fixos e sempre obrigatórios. Configure campos adicionais abaixo.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setFields([...fields, emptyField(fields.length)])} className="gap-1">
                  <Plus className="h-3 w-3" /> Adicionar Campo
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Fixed fields indicator */}
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Campos fixos (sempre presentes)</p>
                <div className="flex flex-wrap gap-2">
                  {["Nome completo (text)", "CPF (cpf)", "E-mail (email)"].map(f => (
                    <span key={f} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{f}</span>
                  ))}
                </div>
              </div>

              {fields.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum campo adicional. Clique em "Adicionar Campo" para criar.
                </p>
              )}

              {fields.map((field, i) => (
                <div key={i} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Campo {i + 1}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Ativo</Label>
                        <Switch checked={field.is_active} onCheckedChange={c => { const u = [...fields]; u[i] = { ...u[i], is_active: c }; setFields(u); }} />
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
                        if (field.id) setDeletedFieldIds([...deletedFieldIds, field.id]);
                        setFields(fields.filter((_, j) => j !== i));
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label>Nome do campo *</Label>
                      <Input
                        value={field.field_label}
                        onChange={e => {
                          const u = [...fields];
                          u[i] = { ...u[i], field_label: e.target.value, field_key: u[i].field_key || generateKey(e.target.value) };
                          setFields(u);
                        }}
                        placeholder="Ex: Telefone"
                      />
                    </div>
                    <div>
                      <Label>Chave (slug)</Label>
                      <Input
                        value={field.field_key}
                        onChange={e => { const u = [...fields]; u[i] = { ...u[i], field_key: e.target.value }; setFields(u); }}
                        placeholder="Ex: telefone"
                      />
                    </div>
                    <div>
                      <Label>Tipo</Label>
                      <Select value={field.field_type} onValueChange={v => { const u = [...fields]; u[i] = { ...u[i], field_type: v }; setFields(u); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Texto</SelectItem>
                          <SelectItem value="select">Menu suspenso</SelectItem>
                          <SelectItem value="date">Data</SelectItem>
                          <SelectItem value="phone">Telefone</SelectItem>
                          <SelectItem value="email">E-mail</SelectItem>
                          <SelectItem value="cpf">CPF</SelectItem>
                          <SelectItem value="textarea">Texto longo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Placeholder</Label>
                      <Input
                        value={field.placeholder}
                        onChange={e => { const u = [...fields]; u[i] = { ...u[i], placeholder: e.target.value }; setFields(u); }}
                        placeholder="Texto de exemplo no campo"
                      />
                    </div>
                    <div className="flex items-end gap-3 pb-1">
                      <div className="flex items-center gap-2">
                        <Switch checked={field.is_required} onCheckedChange={c => { const u = [...fields]; u[i] = { ...u[i], is_required: c }; setFields(u); }} />
                        <Label className="text-sm">Obrigatório</Label>
                      </div>
                    </div>
                  </div>

                  {/* Options for select type */}
                  {field.field_type === "select" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Opções do menu</Label>
                        <Button variant="ghost" size="sm" onClick={() => {
                          const u = [...fields];
                          u[i] = { ...u[i], options: [...u[i].options, ""] };
                          setFields(u);
                        }} className="h-7 gap-1 text-xs">
                          <Plus className="h-3 w-3" /> Opção
                        </Button>
                      </div>
                      {field.options.map((opt, oi) => (
                        <div key={oi} className="flex gap-2">
                          <Input
                            value={opt}
                            onChange={e => {
                              const u = [...fields];
                              const opts = [...u[i].options];
                              opts[oi] = e.target.value;
                              u[i] = { ...u[i], options: opts };
                              setFields(u);
                            }}
                            placeholder={`Opção ${oi + 1}`}
                          />
                          <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0 text-destructive" onClick={() => {
                            const u = [...fields];
                            u[i] = { ...u[i], options: u[i].options.filter((_, j) => j !== oi) };
                            setFields(u);
                          }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {field.options.length === 0 && <p className="text-xs text-muted-foreground">Adicione pelo menos uma opção para o menu suspenso.</p>}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
