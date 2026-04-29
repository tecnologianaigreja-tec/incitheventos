import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { EventData, EventFormField, ParticipantForm } from "@/lib/types";
import { formatCentsToBRL, MAX_BATCH_SIZE, MIN_BATCH_SIZE, formatCPF, formatPhone } from "@/lib/constants";
import { isValidCPF, isValidEmail, isValidPhone } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users, User, Plus, Minus, ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTouchDevice } from "@/hooks/use-mobile";

const isMobileTouch = isTouchDevice();

// ─── Dynamic field rendering component ───
function DynamicField({ field, value, onChange, error }: {
  field: EventFormField;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const errorClass = error ? "border-destructive" : "";

  switch (field.field_type) {
    case "select": {
      const validOptions = (field.options || []).filter(opt => typeof opt === "string" && opt.trim() !== "");
      if (isMobileTouch) {
        return (
          <div>
            <Label>{field.field_label} {field.is_required && "*"}</Label>
            <select
              value={value}
              onChange={e => onChange(e.target.value)}
              className={cn(
                "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                errorClass
              )}
            >
              <option value="">{field.placeholder || "Selecione"}</option>
              {validOptions.map((opt, idx) => (
                <option key={`${opt}-${idx}`} value={opt}>{opt}</option>
              ))}
            </select>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
        );
      }
      return (
        <div>
          <Label>{field.field_label} {field.is_required && "*"}</Label>
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger className={errorClass}>
              <SelectValue placeholder={field.placeholder || "Selecione"} />
            </SelectTrigger>
            <SelectContent>
              {validOptions.map((opt, idx) => (
                <SelectItem key={`${opt}-${idx}`} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      );
    }
    case "date":
      return (
        <div>
          <Label>{field.field_label} {field.is_required && "*"}</Label>
          <Input type="date" value={value} onChange={e => onChange(e.target.value)} className={errorClass} />
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      );
    case "phone":
      return (
        <div>
          <Label>{field.field_label} {field.is_required && "*"}</Label>
          <Input value={value} onChange={e => onChange(formatPhone(e.target.value))} placeholder={field.placeholder || "(00) 00000-0000"} maxLength={15} className={errorClass} />
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      );
    case "cpf":
      return (
        <div>
          <Label>{field.field_label} {field.is_required && "*"}</Label>
          <Input value={value} onChange={e => onChange(formatCPF(e.target.value))} placeholder={field.placeholder || "000.000.000-00"} maxLength={14} className={errorClass} />
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      );
    case "email":
      return (
        <div>
          <Label>{field.field_label} {field.is_required && "*"}</Label>
          <Input type="email" value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || "seu@email.com"} className={errorClass} />
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      );
    case "textarea":
      return (
        <div className="sm:col-span-2">
          <Label>{field.field_label} {field.is_required && "*"}</Label>
          <Textarea value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || ""} rows={3} className={errorClass} />
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      );
    default:
      return (
        <div>
          <Label>{field.field_label} {field.is_required && "*"}</Label>
          <Input value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || ""} className={errorClass} />
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      );
  }
}

// ─── Buyer-only form (when NOT participant): nome, cpf, e-mail, whatsapp ───
function BuyerOnlySection({ formData, onChange, errors }: {
  formData: Record<string, string>;
  onChange: (data: Record<string, string>) => void;
  errors: Record<string, string>;
}) {
  const update = (key: string, val: string) => onChange({ ...formData, [key]: val });

  return (
    <div className="space-y-4 rounded-lg border border-border/50 bg-card p-6">
      <h3 className="font-serif text-lg font-semibold text-foreground">Responsável pela Compra</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Nome completo *</Label>
          <Input
            value={formData.full_name || ""}
            onChange={e => update("full_name", e.target.value)}
            placeholder="Nome completo"
            className={errors.full_name ? "border-destructive" : ""}
          />
          {errors.full_name && <p className="mt-1 text-xs text-destructive">{errors.full_name}</p>}
        </div>
        <div>
          <Label>CPF *</Label>
          <Input
            value={formData.cpf || ""}
            onChange={e => update("cpf", formatCPF(e.target.value))}
            placeholder="000.000.000-00"
            maxLength={14}
            className={errors.cpf ? "border-destructive" : ""}
          />
          {errors.cpf && <p className="mt-1 text-xs text-destructive">{errors.cpf}</p>}
        </div>
        <div>
          <Label>WhatsApp *</Label>
          <Input
            value={formData.phone || ""}
            onChange={e => update("phone", formatPhone(e.target.value))}
            placeholder="(00) 00000-0000"
            maxLength={15}
            className={errors.phone ? "border-destructive" : ""}
          />
          {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
        </div>
        <div className="sm:col-span-2">
          <Label>E-mail *</Label>
          <Input
            type="email"
            value={formData.email || ""}
            onChange={e => update("email", e.target.value)}
            placeholder="seu@email.com"
            className={errors.email ? "border-destructive" : ""}
          />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
          <p className="mt-1 text-xs text-muted-foreground">Necessário para emitir o link de pagamento.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Participant form with fixed + dynamic fields ───
function ParticipantSection({ formData, onChange, errors, customFields, title, isBuyer }: {
  formData: Record<string, string>;
  onChange: (data: Record<string, string>) => void;
  errors: Record<string, string>;
  customFields: EventFormField[];
  title: string;
  isBuyer?: boolean;
}) {
  const update = (key: string, val: string) => onChange({ ...formData, [key]: val });

  return (
    <div className="space-y-4 rounded-lg border border-border/50 bg-card p-6">
      <h3 className="font-serif text-lg font-semibold text-foreground">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Fixed: Nome completo */}
        <div className="sm:col-span-2">
          <Label>Nome completo *</Label>
          <Input
            value={formData.full_name || ""}
            onChange={e => update("full_name", e.target.value)}
            placeholder="Nome completo"
            className={errors.full_name ? "border-destructive" : ""}
          />
          {errors.full_name && <p className="mt-1 text-xs text-destructive">{errors.full_name}</p>}
        </div>
        {/* Fixed: CPF */}
        <div>
          <Label>CPF *</Label>
          <Input
            value={formData.cpf || ""}
            onChange={e => update("cpf", formatCPF(e.target.value))}
            placeholder="000.000.000-00"
            maxLength={14}
            className={errors.cpf ? "border-destructive" : ""}
          />
          {errors.cpf && <p className="mt-1 text-xs text-destructive">{errors.cpf}</p>}
        </div>
        {/* Fixed: E-mail (opcional — InfinitePay coleta no checkout se vazio) */}
        <div>
          <Label>E-mail</Label>
          <Input
            type="email"
            value={formData.email || ""}
            onChange={e => update("email", e.target.value)}
            placeholder="seu@email.com (opcional)"
            className={errors.email ? "border-destructive" : ""}
          />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
        </div>
        {/* Dynamic fields */}
        {customFields.map(field => (
          <DynamicField
            key={field.id}
            field={field}
            value={formData[field.field_key] || ""}
            onChange={v => update(field.field_key, v)}
            error={errors[field.field_key]}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Validation ───
function validateForm(data: Record<string, string>, customFields: EventFormField[], opts?: { requireEmail?: boolean }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.full_name?.trim()) errors.full_name = "Nome obrigatório";
  if (!data.cpf?.trim()) errors.cpf = "CPF obrigatório";
  else if (!isValidCPF(data.cpf)) errors.cpf = "CPF inválido";
  if (opts?.requireEmail) {
    if (!data.email?.trim()) errors.email = "E-mail obrigatório para o responsável";
    else if (!isValidEmail(data.email)) errors.email = "E-mail inválido";
  } else if (data.email?.trim() && !isValidEmail(data.email)) {
    errors.email = "E-mail inválido";
  }

  for (const field of customFields) {
    if (!field.is_required) continue;
    const val = data[field.field_key]?.trim() || "";
    if (!val) {
      errors[field.field_key] = `${field.field_label} é obrigatório`;
      continue;
    }
    if (field.field_type === "phone" && !isValidPhone(val)) errors[field.field_key] = "Telefone inválido";
    if (field.field_type === "cpf" && !isValidCPF(val)) errors[field.field_key] = "CPF inválido";
    if (field.field_type === "email" && !isValidEmail(val)) errors[field.field_key] = "E-mail inválido";
  }
  return errors;
}

function validateBuyerOnly(data: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.full_name?.trim()) errors.full_name = "Nome obrigatório";
  if (!data.cpf?.trim()) errors.cpf = "CPF obrigatório";
  else if (!isValidCPF(data.cpf)) errors.cpf = "CPF inválido";
  if (!data.phone?.trim()) errors.phone = "WhatsApp obrigatório";
  else if (!isValidPhone(data.phone)) errors.phone = "Telefone inválido";
  if (!data.email?.trim()) errors.email = "E-mail obrigatório para o responsável";
  else if (!isValidEmail(data.email)) errors.email = "E-mail inválido";
  return errors;
}

function emptyForm(): Record<string, string> {
  return { full_name: "", cpf: "", email: "" };
}

export default function RegistrationPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventData | null>(null);
  const [customFields, setCustomFields] = useState<EventFormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [duplicateModal, setDuplicateModal] = useState<{
    title: string;
    message: string;
    duplicates: { name: string; cpf_masked: string; status: string }[];
  } | null>(null);
  const [tab, setTab] = useState<"individual" | "batch">("individual");
  const [registrationCount, setRegistrationCount] = useState(0);

  // Individual form
  const [individual, setIndividual] = useState<Record<string, string>>(emptyForm());
  const [individualErrors, setIndividualErrors] = useState<Record<string, string>>({});
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentData, setConsentData] = useState(false);

  // Batch form
  const [buyer, setBuyer] = useState<Record<string, string>>(emptyForm());
  const [buyerErrors, setBuyerErrors] = useState<Record<string, string>>({});
  const [buyerIsParticipant, setBuyerIsParticipant] = useState(true);
  const [participants, setParticipants] = useState<Record<string, string>[]>([emptyForm(), emptyForm()]);
  const [participantErrors, setParticipantErrors] = useState<Record<string, string>[]>([]);
  const [batchConsentTerms, setBatchConsentTerms] = useState(false);
  const [batchConsentData, setBatchConsentData] = useState(false);

  useEffect(() => {
    async function load() {
      if (!slug) return;
      const { data: ev } = await supabase
        .from("events")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .single();
      if (ev) {
        setEvent(ev as unknown as EventData);
        // Load custom form fields
        const [{ data: ff }, { count }] = await Promise.all([
          supabase.from("event_form_fields").select("*").eq("event_id", ev.id).eq("is_active", true).order("sort_order"),
          supabase.from("registrations").select("*", { count: "exact", head: true }).eq("event_id", ev.id).in("registration_status", ["confirmed", "pending_payment"]),
        ]);
        if (ff) setCustomFields(ff as unknown as EventFormField[]);
        setRegistrationCount(count || 0);
      }
      setLoading(false);
    }
    load();
  }, [slug]);

  const addParticipant = () => {
    const currentCount = buyerIsParticipant ? participants.length + 1 : participants.length;
    if (currentCount >= MAX_BATCH_SIZE) { toast.error(`Máximo de ${MAX_BATCH_SIZE} participantes por lote`); return; }
    setParticipants([...participants, emptyForm()]);
  };

  const removeParticipant = (i: number) => {
    const currentCount = buyerIsParticipant ? participants.length + 1 : participants.length;
    if (currentCount <= MIN_BATCH_SIZE) { toast.error(`Mínimo de ${MIN_BATCH_SIZE} participantes por lote`); return; }
    setParticipants(participants.filter((_, idx) => idx !== i));
  };

  const participantCount = tab === "batch"
    ? (buyerIsParticipant ? participants.length + 1 : participants.length)
    : 1;

  const totalCents = event ? participantCount * event.unit_price_cents : 0;

  // Convert Record<string, string> to ParticipantForm-like object for the backend
  function toParticipant(data: Record<string, string>): Record<string, string> {
    return { ...data };
  }

  const isFull = event?.max_participants ? registrationCount >= event.max_participants : false;

  async function handleSubmit() {
    if (!event) return;
    // Defense in depth against double-submit (state lag + ref guard)
    if (submitting || submittingRef.current) return;
    submittingRef.current = true;
    if (isFull) { toast.error("Vagas esgotadas para este evento"); return; }

    if (tab === "individual") {
      const errs = validateForm(individual, customFields, { requireEmail: true });
      setIndividualErrors(errs);
      if (Object.keys(errs).length > 0) { toast.error("Corrija os campos em destaque"); return; }
      if (!consentTerms || !consentData) { toast.error("Aceite os termos para continuar"); return; }
    } else {
      // Validate buyer: different validation based on participation. Buyer e-mail is always required.
      const bErrs = buyerIsParticipant
        ? validateForm(buyer, customFields, { requireEmail: true })
        : validateBuyerOnly(buyer);
      setBuyerErrors(bErrs);
      const pErrs = participants.map(p => validateForm(p, customFields));
      setParticipantErrors(pErrs);
      const hasErrors = Object.keys(bErrs).length > 0 || pErrs.some(e => Object.keys(e).length > 0);
      if (hasErrors) { toast.error("Corrija os campos em destaque"); return; }
      if (!batchConsentTerms || !batchConsentData) { toast.error("Aceite os termos para continuar"); return; }

      // Check duplicate CPFs within the batch
      const allPeople = buyerIsParticipant ? [buyer, ...participants] : participants;
      const seenCpf = new Set<string>();
      for (const p of allPeople) {
        const cpfClean = (p.cpf || "").replace(/\D/g, "");
        if (cpfClean && seenCpf.has(cpfClean)) { toast.error(`CPF ${p.cpf} está duplicado no lote`); return; }
        if (cpfClean) seenCpf.add(cpfClean);
      }

      const count = buyerIsParticipant ? participants.length + 1 : participants.length;
      if (count < MIN_BATCH_SIZE) { toast.error(`Mínimo de ${MIN_BATCH_SIZE} participantes`); return; }
      if (count > MAX_BATCH_SIZE) { toast.error(`Máximo de ${MAX_BATCH_SIZE} participantes`); return; }
    }

    // The backend will handle CPF uniqueness — if pending, it resumes the existing order
    // We only block confirmed duplicates client-side for better UX
    {
      const allParticipants = tab === "individual"
        ? [individual]
        : (buyerIsParticipant ? [buyer, ...participants] : participants);
      const cpfs = allParticipants.map(p => (p.cpf || "").replace(/\D/g, "")).filter(Boolean);
      
      if (cpfs.length > 0) {
        const { data: existing } = await supabase
          .from("registrations")
          .select("cpf, full_name, registration_status")
          .eq("event_id", event.id)
          .in("cpf", cpfs)
          .eq("registration_status", "confirmed");

        if (existing && existing.length > 0) {
          const names = existing.map(r => r.full_name).join(", ");
          toast.error(`Já existe inscrição confirmada neste evento para: ${names}.`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const payload = tab === "individual"
        ? {
            event_id: event.id,
            purchase_type: "individual" as const,
            buyer: toParticipant(individual),
            participants: [toParticipant(individual)],
            consent_terms: consentTerms,
            consent_data_usage: consentData,
          }
        : {
            event_id: event.id,
            purchase_type: "batch" as const,
            buyer: toParticipant(buyer),
            buyer_is_participant: buyerIsParticipant,
            participants: buyerIsParticipant
              ? [toParticipant(buyer), ...participants.map(toParticipant)]
              : participants.map(toParticipant),
            consent_terms: batchConsentTerms,
            consent_data_usage: batchConsentData,
          };

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/create-checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify(payload),
        }
      );

      const result = await res.json();

      if (!res.ok) {
        if (res.status === 409 && (result.code === "duplicate_pending" || result.code === "duplicate_confirmed")) {
          setDuplicateModal({
            title: result.code === "duplicate_confirmed" ? "Inscrição já confirmada" : "Inscrição pendente",
            message: result.error || "CPF já cadastrado neste evento.",
            duplicates: Array.isArray(result.duplicates) ? result.duplicates : [],
          });
        } else {
          toast.error(result.error || "Erro ao processar inscrição");
        }
        setSubmitting(false);
        submittingRef.current = false;
        return;
      }

      if (result.payment_link) {
        sessionStorage.setItem("last_order_code", result.order_code);
        window.location.href = result.payment_link;
      } else {
        navigate(`/pedido/${result.order_code}`);
      }
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
      setSubmitting(false);
      submittingRef.current = false;
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <h1 className="mb-2 font-serif text-2xl font-bold text-foreground">Evento não encontrado</h1>
        <p className="mb-6 text-muted-foreground">Este evento não está disponível para inscrição.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Voltar ao início</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-4 py-6">
        <div className="container mx-auto max-w-3xl">
          <button onClick={() => navigate(`/`)} className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Voltar ao evento
          </button>
          <h1 className="font-serif text-2xl font-bold text-foreground md:text-3xl">{event.title}</h1>
          <p className="mt-1 text-muted-foreground">Inscrição</p>
        </div>
      </div>

      <div className="container mx-auto max-w-3xl px-4 py-8">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "individual" | "batch")} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="individual" className="gap-2"><User className="h-4 w-4" /> Individual</TabsTrigger>
            <TabsTrigger value="batch" className="gap-2"><Users className="h-4 w-4" /> Em Lote</TabsTrigger>
          </TabsList>

          <TabsContent value="individual" className="space-y-6">
            <ParticipantSection
              formData={individual}
              onChange={setIndividual}
              errors={individualErrors}
              customFields={customFields}
              title="Seus Dados"
              isBuyer
            />
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox id="consent_terms" checked={consentTerms} onCheckedChange={(c) => setConsentTerms(!!c)} />
                <Label htmlFor="consent_terms" className="text-sm leading-relaxed text-muted-foreground">
                  Li e aceito os termos e condições do evento. *
                </Label>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id="consent_data" checked={consentData} onCheckedChange={(c) => setConsentData(!!c)} />
                <Label htmlFor="consent_data" className="text-sm leading-relaxed text-muted-foreground">
                  Autorizo o uso dos meus dados para fins de inscrição e comunicação sobre o evento. *
                </Label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="batch" className="space-y-6">
            {buyerIsParticipant ? (
              <ParticipantSection
                formData={buyer}
                onChange={setBuyer}
                errors={buyerErrors}
                customFields={customFields}
                title="Responsável pela Compra (também participante)"
                isBuyer
              />
            ) : (
              <BuyerOnlySection
                formData={buyer}
                onChange={setBuyer}
                errors={buyerErrors}
              />
            )}
            <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-card p-4">
              <Switch checked={buyerIsParticipant} onCheckedChange={setBuyerIsParticipant} id="buyer_participates" />
              <Label htmlFor="buyer_participates" className="text-sm text-foreground">
                O responsável também participará do evento
              </Label>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg font-semibold text-foreground">
                  Participantes {buyerIsParticipant && "(além do responsável)"}
                </h3>
                <Button variant="outline" size="sm" onClick={addParticipant} className="gap-1">
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
              {participants.map((p, i) => (
                <div key={i} className="relative">
                  <ParticipantSection
                    formData={p}
                    onChange={v => { const u = [...participants]; u[i] = v; setParticipants(u); }}
                    errors={participantErrors[i] || {}}
                    customFields={customFields}
                    title={`Participante ${i + 1}`}
                  />
                  {participants.length > 1 && (
                    <button
                      onClick={() => removeParticipant(i)}
                      className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Remover participante"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox id="batch_consent_terms" checked={batchConsentTerms} onCheckedChange={(c) => setBatchConsentTerms(!!c)} />
                <Label htmlFor="batch_consent_terms" className="text-sm leading-relaxed text-muted-foreground">
                  Li e aceito os termos e condições do evento para todos os participantes. *
                </Label>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id="batch_consent_data" checked={batchConsentData} onCheckedChange={(c) => setBatchConsentData(!!c)} />
                <Label htmlFor="batch_consent_data" className="text-sm leading-relaxed text-muted-foreground">
                  Autorizo o uso dos dados de todos os participantes para fins de inscrição e comunicação sobre o evento. *
                </Label>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <Card className="mt-8 border-2 border-accent/20">
          <CardHeader><CardTitle className="font-serif text-xl">Resumo</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Participantes</span>
              <span className="font-medium text-foreground">{participantCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor unitário</span>
              <span className="font-medium text-foreground">{formatCentsToBRL(event.unit_price_cents)}</span>
            </div>
            <div className="border-t border-border pt-3">
              <div className="flex justify-between">
                <span className="font-semibold text-foreground">Total</span>
                <span className="font-serif text-2xl font-bold text-foreground">{formatCentsToBRL(totalCents)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          className="mt-6 w-full bg-accent text-accent-foreground hover:bg-accent/90 py-6 text-lg font-semibold"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processando...</>
          ) : (
            "Prosseguir para pagamento"
          )}
        </Button>
      </div>

      {/* Duplicate registration modal */}
      <Dialog open={duplicateModal !== null} onOpenChange={(o) => { if (!o) setDuplicateModal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{duplicateModal?.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{duplicateModal?.message}</p>
          {duplicateModal?.duplicates && duplicateModal.duplicates.length > 0 && (
            <ul className="mt-2 space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
              {duplicateModal.duplicates.map((d, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{d.name}</span>
                  <span className="text-xs text-muted-foreground">{d.cpf_masked}</span>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDuplicateModal(null)}>Fechar</Button>
            <Button
              onClick={() => {
                setDuplicateModal(null);
                navigate("/?lookup=1");
              }}
            >
              Consultar minha inscrição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
