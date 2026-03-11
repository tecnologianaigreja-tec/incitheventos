import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { EventData, TargetAudienceItem, FaqItem } from "@/lib/types";
import { formatCentsToBRL } from "@/lib/constants";
import { getTemplateById, getTemplateStyles } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Calendar, MapPin, Clock, Users, BookOpen, Award, Shield, ChevronRight, Star } from "lucide-react";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const iconMap: Record<string, React.ComponentType<any>> = {
  Users, BookOpen, Shield, Award, Calendar, MapPin, Clock, Star,
};

export default function LandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      if (!slug) { setLoading(false); return; }
      const { data } = await supabase
        .from("events")
        .select("*")
        .eq("slug", slug)
        .in("status", ["published", "closed"])
        .single();
      if (data) setEvent(data as unknown as EventData);
      setLoading(false);
    }
    load();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <BookOpen className="mb-4 h-16 w-16 text-muted-foreground" />
        <h1 className="mb-2 font-serif text-3xl font-bold text-foreground">Evento não encontrado</h1>
        <p className="text-muted-foreground">Este evento não existe ou não está disponível.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>Voltar</Button>
      </div>
    );
  }

  const template = getTemplateById((event as any).template || "classic");
  const templateStyles = getTemplateStyles(template);

  const startDate = new Date(event.start_date + "T00:00:00");
  const endDate = new Date(event.end_date + "T00:00:00");
  const dateStr = startDate.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  const endDateStr = endDate.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  const isClosed = event.status === "closed";

  const audienceItems: TargetAudienceItem[] = Array.isArray(event.target_audience) && event.target_audience.length > 0
    ? event.target_audience : [];

  const includes: string[] = Array.isArray(event.includes_items) && event.includes_items.length > 0
    ? event.includes_items : [];

  const faqs: FaqItem[] = Array.isArray(event.faq_items) && event.faq_items.length > 0
    ? event.faq_items : [];

  const hasBanner = !!event.banner_url;
  const hasAbout = !!(event.about_title || event.about_description || event.description);
  const hasCta = !!(event.cta_title || event.cta_description);

  return (
    <div className="min-h-screen bg-background" style={templateStyles}>
      {/* HERO */}
      <section
        className="relative overflow-hidden px-4 py-24 text-[hsl(var(--lp-primary-foreground))] md:py-32"
        style={{ backgroundColor: `hsl(${template.colors.primary})` }}
      >
        {hasBanner && (
          <div className="absolute inset-0">
            <img src={event.banner_url!} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ backgroundColor: `hsl(${template.colors.primary} / 0.75)` }} />
          </div>
        )}
        {!hasBanner && (
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 30% 50%, hsl(${template.colors.accent} / 0.3), transparent 70%)` }} />
          </div>
        )}
        <motion.div
          className="container relative mx-auto max-w-4xl text-center"
          initial="hidden" animate="visible" variants={stagger}
        >
          {event.hero_badge && (
            <motion.p
              variants={fadeUp}
              className="mb-4 text-sm font-semibold uppercase tracking-[0.2em]"
              style={{ color: `hsl(${template.colors.accent})` }}
            >
              {event.hero_badge}
            </motion.p>
          )}
          <motion.h1 variants={fadeUp} className="mb-6 font-serif text-4xl font-bold leading-tight md:text-6xl lg:text-7xl">
            {event.title}
          </motion.h1>
          {event.subtitle && (
            <motion.p variants={fadeUp} className="mb-8 text-lg opacity-80 md:text-xl">
              {event.subtitle}
            </motion.p>
          )}
          <motion.div variants={fadeUp} className="mb-10 flex flex-wrap items-center justify-center gap-6 text-sm opacity-70">
            <span className="flex items-center gap-2"><Calendar className="h-4 w-4" />{dateStr} — {endDateStr}</span>
            {event.location_name && (
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {event.location_name}{event.city ? `, ${event.city}` : ""}{event.state ? `/${event.state}` : ""}
              </span>
            )}
            {event.start_time && (
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4" />{event.start_time?.slice(0, 5)} — {event.end_time?.slice(0, 5)}
              </span>
            )}
          </motion.div>
          <motion.div variants={fadeUp}>
            {!isClosed ? (
              <Button
                size="lg"
                className="px-10 py-6 text-lg font-semibold shadow-lg"
                style={{
                  backgroundColor: `hsl(${template.colors.accent})`,
                  color: `hsl(${template.colors.accentForeground})`,
                }}
                onClick={() => navigate(`/evento/${event.slug}/inscricao`)}
              >
                Inscreva-se agora <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            ) : (
              <p className="text-lg font-medium opacity-60">Inscrições encerradas</p>
            )}
          </motion.div>
        </motion.div>
      </section>

      {/* ABOUT — only show if content exists */}
      {hasAbout && (
        <section className="px-4 py-20">
          <motion.div className="container mx-auto max-w-3xl text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="mb-6 font-serif text-3xl font-bold text-foreground md:text-4xl">
              {event.about_title || "Sobre o Evento"}
            </motion.h2>
            <motion.p variants={fadeUp} className="text-lg leading-relaxed text-muted-foreground">
              {event.about_description || event.description}
            </motion.p>
          </motion.div>
        </section>
      )}

      {/* FOR WHOM — only show if items exist */}
      {audienceItems.length > 0 && (
        <section className="px-4 py-20" style={{ backgroundColor: `hsl(${template.colors.secondary})` }}>
          <motion.div className="container mx-auto max-w-5xl" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="mb-12 text-center font-serif text-3xl font-bold text-foreground md:text-4xl">
              Para Quem é Este Evento
            </motion.h2>
            <div className="grid gap-6 md:grid-cols-3">
              {audienceItems.map((item, i) => {
                const Icon = iconMap[item.icon] || Users;
                return (
                  <motion.div key={i} variants={fadeUp}>
                    <Card className="h-full border-border/50 bg-card shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-8 text-center">
                        <Icon className="mx-auto mb-4 h-10 w-10" style={{ color: `hsl(${template.colors.accent})` }} />
                        <h3 className="mb-3 font-serif text-xl font-semibold text-foreground">{item.title}</h3>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </section>
      )}

      {/* WHAT'S INCLUDED — only show if items exist */}
      {includes.length > 0 && (
        <section className="px-4 py-20">
          <motion.div className="container mx-auto max-w-4xl" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="mb-12 text-center font-serif text-3xl font-bold text-foreground md:text-4xl">
              O Que Está Incluso
            </motion.h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {includes.map((item, i) => (
                <motion.div key={i} variants={fadeUp} className="flex items-center gap-3 rounded-lg border border-border/50 bg-card p-4">
                  <Award className="h-5 w-5 flex-shrink-0" style={{ color: `hsl(${template.colors.accent})` }} />
                  <span className="text-foreground">{item}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>
      )}

      {/* FAQ — only show if items exist */}
      {faqs.length > 0 && (
        <section className="px-4 py-20" style={{ backgroundColor: `hsl(${template.colors.secondary})` }}>
          <motion.div className="container mx-auto max-w-3xl" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="mb-12 text-center font-serif text-3xl font-bold text-foreground md:text-4xl">
              Perguntas Frequentes
            </motion.h2>
            <motion.div variants={fadeUp}>
              <Accordion type="single" collapsible className="space-y-3">
                {faqs.map((faq, i) => (
                  <AccordionItem key={i} value={`faq-${i}`} className="rounded-lg border border-border/50 bg-card px-6">
                    <AccordionTrigger className="text-left font-medium text-foreground hover:no-underline">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          </motion.div>
        </section>
      )}

      {/* PRICING */}
      <section className="px-4 py-20">
        <motion.div className="container mx-auto max-w-lg text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
          <motion.h2 variants={fadeUp} className="mb-4 font-serif text-3xl font-bold text-foreground md:text-4xl">
            Investimento
          </motion.h2>
          <motion.div variants={fadeUp}>
            <Card className="border-2 bg-card shadow-lg" style={{ borderColor: `hsl(${template.colors.accent} / 0.3)` }}>
              <CardContent className="p-10">
                <p className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  {event.pricing_label || "Inscrição Individual"}
                </p>
                <p className="mb-1 font-serif text-5xl font-bold text-foreground">{formatCentsToBRL(event.unit_price_cents)}</p>
                <p className="mb-8 text-sm text-muted-foreground">por participante</p>
                {!isClosed && (
                  <Button
                    size="lg"
                    className="w-full py-6 text-lg font-semibold"
                    style={{
                      backgroundColor: `hsl(${template.colors.accent})`,
                      color: `hsl(${template.colors.accentForeground})`,
                    }}
                    onClick={() => navigate(`/evento/${event.slug}/inscricao`)}
                  >
                    Garantir minha vaga
                  </Button>
                )}
              </CardContent>
            </Card>
          </motion.div>
          <motion.p variants={fadeUp} className="mt-4 text-sm text-muted-foreground">
            Inscrição em lote disponível para grupos de 2 a 10 pessoas
          </motion.p>
        </motion.div>
      </section>

      {/* FINAL CTA — only if content exists */}
      {hasCta && (
        <section className="px-4 py-20 text-[hsl(var(--lp-primary-foreground))]" style={{ backgroundColor: `hsl(${template.colors.primary})` }}>
          <motion.div className="container mx-auto max-w-3xl text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            <motion.h2 variants={fadeUp} className="mb-6 font-serif text-3xl font-bold md:text-4xl">
              {event.cta_title}
            </motion.h2>
            {event.cta_description && (
              <motion.p variants={fadeUp} className="mb-8 text-lg opacity-70">
                {event.cta_description}
              </motion.p>
            )}
            {!isClosed && (
              <motion.div variants={fadeUp}>
                <Button
                  size="lg"
                  className="px-10 py-6 text-lg font-semibold shadow-lg"
                  style={{
                    backgroundColor: `hsl(${template.colors.accent})`,
                    color: `hsl(${template.colors.accentForeground})`,
                  }}
                  onClick={() => navigate(`/evento/${event.slug}/inscricao`)}
                >
                  Inscreva-se agora <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              </motion.div>
            )}
          </motion.div>
        </section>
      )}

      {/* FOOTER */}
      <footer className="border-t border-border bg-card px-4 py-8">
        <div className="container mx-auto max-w-4xl text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} {event.organizer_name || "Igreja"}. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
