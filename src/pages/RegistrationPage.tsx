import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { EventData, ParticipantForm } from "@/lib/types";
import { formatCentsToBRL, MAX_BATCH_SIZE, MIN_BATCH_SIZE } from "@/lib/constants";
import { validateParticipant, emptyParticipant } from "@/lib/validation";
import ParticipantFormFields from "@/components/ParticipantFormFields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Users, User, Plus, Minus, ArrowLeft, Loader2 } from "lucide-react";

export default function RegistrationPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<"individual" | "batch">("individual");

  // Individual form
  const [individual, setIndividual] = useState<ParticipantForm>(emptyParticipant());
  const [individualErrors, setIndividualErrors] = useState<Record<string, string>>({});
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentData, setConsentData] = useState(false);

  // Batch form
  const [buyer, setBuyer] = useState<ParticipantForm>(emptyParticipant());
  const [buyerErrors, setBuyerErrors] = useState<Record<string, string>>({});
  const [buyerIsParticipant, setBuyerIsParticipant] = useState(true);
  const [participants, setParticipants] = useState<ParticipantForm[]>([emptyParticipant(), emptyParticipant()]);
  const [participantErrors, setParticipantErrors] = useState<Record<string, string>[]>([]);
  const [batchConsentTerms, setBatchConsentTerms] = useState(false);
  const [batchConsentData, setBatchConsentData] = useState(false);

  useEffect(() => {
    async function load() {
      if (!slug) return;
      const { data } = await supabase
        .from("events")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .single();
      if (data) setEvent(data as unknown as EventData);
      setLoading(false);
    }
    load();
  }, [slug]);

  const addParticipant = () => {
    const currentCount = buyerIsParticipant ? participants.length + 1 : participants.length;
    if (currentCount >= MAX_BATCH_SIZE) {
      toast.error(`Máximo de ${MAX_BATCH_SIZE} participantes por lote`);
      return;
    }
    setParticipants([...participants, emptyParticipant()]);
  };

  const removeParticipant = (i: number) => {
    const currentCount = buyerIsParticipant ? participants.length + 1 : participants.length;
    if (currentCount <= MIN_BATCH_SIZE) {
      toast.error(`Mínimo de ${MIN_BATCH_SIZE} participantes por lote`);
      return;
    }
    setParticipants(participants.filter((_, idx) => idx !== i));
  };

  const participantCount = tab === "batch"
    ? (buyerIsParticipant ? participants.length + 1 : participants.length)
    : 1;

  const totalCents = event ? participantCount * event.unit_price_cents : 0;

  async function handleSubmit() {
    if (!event) return;
    if (submitting) return;

    if (tab === "individual") {
      const errs = validateParticipant(individual);
      setIndividualErrors(errs);
      if (Object.keys(errs).length > 0) { toast.error("Corrija os campos em destaque"); return; }
      if (!consentTerms || !consentData) { toast.error("Aceite os termos para continuar"); return; }
    } else {
      const bErrs = validateParticipant(buyer);
      setBuyerErrors(bErrs);
      const pErrs = participants.map(validateParticipant);
      setParticipantErrors(pErrs);
      const hasErrors = Object.keys(bErrs).length > 0 || pErrs.some(e => Object.keys(e).length > 0);
      if (hasErrors) { toast.error("Corrija os campos em destaque"); return; }
      if (!batchConsentTerms || !batchConsentData) { toast.error("Aceite os termos para continuar"); return; }

      // Check duplicates
      const allPeople = buyerIsParticipant ? [buyer, ...participants] : participants;
      const seen = new Set<string>();
      for (const p of allPeople) {
        const key = `${p.full_name.toLowerCase().trim()}|${p.email.toLowerCase().trim()}`;
        if (seen.has(key)) { toast.error("Existem participantes duplicados no lote"); return; }
        seen.add(key);
      }

      const count = buyerIsParticipant ? participants.length + 1 : participants.length;
      if (count < MIN_BATCH_SIZE) { toast.error(`Mínimo de ${MIN_BATCH_SIZE} participantes`); return; }
      if (count > MAX_BATCH_SIZE) { toast.error(`Máximo de ${MAX_BATCH_SIZE} participantes`); return; }
    }

    setSubmitting(true);
    try {
      const payload = tab === "individual"
        ? {
            event_id: event.id,
            purchase_type: "individual" as const,
            buyer: individual,
            participants: [individual],
            consent_terms: consentTerms,
            consent_data_usage: consentData,
          }
        : {
            event_id: event.id,
            purchase_type: "batch" as const,
            buyer,
            buyer_is_participant: buyerIsParticipant,
            participants: buyerIsParticipant ? [buyer, ...participants] : participants,
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
        toast.error(result.error || "Erro ao processar inscrição");
        setSubmitting(false);
        return;
      }

      // Navigate to payment status page with order code
      if (result.payment_link) {
        // Save order code in sessionStorage for return
        sessionStorage.setItem("last_order_code", result.order_code);
        window.location.href = result.payment_link;
      } else {
        navigate(`/pedido/${result.order_code}`);
      }
    } catch (err) {
      toast.error("Erro de conexão. Tente novamente.");
      setSubmitting(false);
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
      {/* Header */}
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
            <TabsTrigger value="individual" className="gap-2">
              <User className="h-4 w-4" /> Individual
            </TabsTrigger>
            <TabsTrigger value="batch" className="gap-2">
              <Users className="h-4 w-4" /> Em Lote
            </TabsTrigger>
          </TabsList>

          {/* INDIVIDUAL */}
          <TabsContent value="individual" className="space-y-6">
            <ParticipantFormFields value={individual} onChange={setIndividual} errors={individualErrors} label="Seus Dados" />

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

          {/* BATCH */}
          <TabsContent value="batch" className="space-y-6">
            <ParticipantFormFields value={buyer} onChange={setBuyer} errors={buyerErrors} label="Responsável pela Compra" />

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
                  <ParticipantFormFields
                    value={p}
                    onChange={(v) => {
                      const updated = [...participants];
                      updated[i] = v;
                      setParticipants(updated);
                    }}
                    index={i}
                    errors={participantErrors[i] || {}}
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

        {/* SUMMARY */}
        <Card className="mt-8 border-2 border-accent/20">
          <CardHeader>
            <CardTitle className="font-serif text-xl">Resumo</CardTitle>
          </CardHeader>
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
    </div>
  );
}
