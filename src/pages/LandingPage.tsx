import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { EventData } from "@/lib/types";
import { formatCentsToBRL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Calendar, MapPin, Clock, Users, BookOpen, Award, Shield, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

export default function LandingPage() {
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("events")
        .select("*")
        .in("status", ["published", "closed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (data) setEvent(data as unknown as EventData);
      setLoading(false);
    }
    load();
  }, []);

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
        <h1 className="mb-2 font-serif text-3xl font-bold text-foreground">Nenhum evento publicado</h1>
        <p className="text-muted-foreground">Em breve teremos novidades. Volte logo!</p>
      </div>
    );
  }

  const startDate = new Date(event.start_date + "T00:00:00");
  const endDate = new Date(event.end_date + "T00:00:00");
  const dateStr = startDate.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  const endDateStr = endDate.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  const isClosed = event.status === "closed";

  return (
    <div className="min-h-screen bg-background">
      {/* HERO */}
      <section className="relative overflow-hidden bg-primary px-4 py-24 text-primary-foreground md:py-32">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(32,80%,50%,0.3),transparent_70%)]" />
        </div>
        <motion.div
          className="container relative mx-auto max-w-4xl text-center"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.p variants={fadeUp} className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-accent">
            Conferência 2026
          </motion.p>
          <motion.h1 variants={fadeUp} className="mb-6 font-serif text-4xl font-bold leading-tight md:text-6xl lg:text-7xl">
            {event.title}
          </motion.h1>
          {event.subtitle && (
            <motion.p variants={fadeUp} className="mb-8 text-lg text-primary-foreground/80 md:text-xl">
              {event.subtitle}
            </motion.p>
          )}
          <motion.div variants={fadeUp} className="mb-10 flex flex-wrap items-center justify-center gap-6 text-sm text-primary-foreground/70">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {dateStr} — {endDateStr}
            </span>
            {event.location_name && (
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {event.location_name}, {event.city}/{event.state}
              </span>
            )}
            {event.start_time && (
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {event.start_time?.slice(0, 5)} — {event.end_time?.slice(0, 5)}
              </span>
            )}
          </motion.div>
          <motion.div variants={fadeUp}>
            {!isClosed ? (
              <Button
                size="lg"
                className="bg-accent text-accent-foreground hover:bg-accent/90 px-10 py-6 text-lg font-semibold shadow-lg"
                onClick={() => navigate(`/evento/${event.slug}/inscricao`)}
              >
                Inscreva-se agora <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            ) : (
              <p className="text-lg font-medium text-primary-foreground/60">Inscrições encerradas</p>
            )}
          </motion.div>
        </motion.div>
      </section>

      {/* ABOUT */}
      <section className="px-4 py-20">
        <motion.div
          className="container mx-auto max-w-3xl text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.h2 variants={fadeUp} className="mb-6 font-serif text-3xl font-bold text-foreground md:text-4xl">
            Sobre a Conferência
          </motion.h2>
          <motion.p variants={fadeUp} className="text-lg leading-relaxed text-muted-foreground">
            {event.description || "Uma conferência dedicada ao estudo profundo e respeitoso das razões da fé cristã. Junte-se a nós para explorar os fundamentos intelectuais, históricos e filosóficos do cristianismo com palestrantes renomados e em um ambiente acolhedor."}
          </motion.p>
        </motion.div>
      </section>

      {/* FOR WHOM */}
      <section className="bg-secondary/50 px-4 py-20">
        <motion.div
          className="container mx-auto max-w-5xl"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.h2 variants={fadeUp} className="mb-12 text-center font-serif text-3xl font-bold text-foreground md:text-4xl">
            Para Quem é Este Evento
          </motion.h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: Users, title: "Líderes e Pastores", desc: "Fortaleça sua base teológica e aprenda a responder questionamentos com clareza e compaixão." },
              { icon: BookOpen, title: "Estudantes e Curiosos", desc: "Explore as evidências históricas e filosóficas que sustentam a fé cristã ao longo dos séculos." },
              { icon: Shield, title: "Toda a Igreja", desc: "Qualquer cristão que deseja aprofundar sua fé e estar preparado para dar razão de sua esperança." },
            ].map((item, i) => (
              <motion.div key={i} variants={fadeUp}>
                <Card className="h-full border-border/50 bg-card shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-8 text-center">
                    <item.icon className="mx-auto mb-4 h-10 w-10 text-accent" />
                    <h3 className="mb-3 font-serif text-xl font-semibold text-foreground">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* WHAT'S INCLUDED */}
      <section className="px-4 py-20">
        <motion.div
          className="container mx-auto max-w-4xl"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.h2 variants={fadeUp} className="mb-12 text-center font-serif text-3xl font-bold text-foreground md:text-4xl">
            O Que Está Incluso
          </motion.h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              "Acesso a todas as palestras e painéis",
              "Material de apoio digital",
              "Certificado de participação",
              `${event.workload_hours || 8} horas de conteúdo`,
              "Coffee break",
              "Networking com palestrantes",
            ].map((item, i) => (
              <motion.div key={i} variants={fadeUp} className="flex items-center gap-3 rounded-lg border border-border/50 bg-card p-4">
                <Award className="h-5 w-5 flex-shrink-0 text-accent" />
                <span className="text-foreground">{item}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* FAQ */}
      <section className="bg-secondary/50 px-4 py-20">
        <motion.div
          className="container mx-auto max-w-3xl"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.h2 variants={fadeUp} className="mb-12 text-center font-serif text-3xl font-bold text-foreground md:text-4xl">
            Perguntas Frequentes
          </motion.h2>
          <motion.div variants={fadeUp}>
            <Accordion type="single" collapsible className="space-y-3">
              {[
                { q: "Posso me inscrever em grupo?", a: "Sim! Oferecemos inscrição em lote de 2 a 10 pessoas com um único pagamento. Cada participante recebe inscrição, QR Code e certificado individuais." },
                { q: "Como funciona o pagamento?", a: "Após preencher o formulário, você será redirecionado ao checkout seguro da InfinitePay. Aceitamos diversas formas de pagamento." },
                { q: "Receberei certificado?", a: "Sim. Após o evento, todo participante com pagamento confirmado e presença registrada via check-in receberá certificado digital individual." },
                { q: "Posso cancelar minha inscrição?", a: "Consulte a política de cancelamento entrando em contato com a organização do evento." },
                { q: "Preciso levar algo no dia?", a: "Apenas um documento com foto e o QR Code de check-in que será disponibilizado após a confirmação do pagamento." },
              ].map((faq, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="rounded-lg border border-border/50 bg-card px-6">
                  <AccordionTrigger className="text-left font-medium text-foreground hover:no-underline">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </motion.div>
      </section>

      {/* PRICING */}
      <section className="px-4 py-20">
        <motion.div
          className="container mx-auto max-w-lg text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.h2 variants={fadeUp} className="mb-4 font-serif text-3xl font-bold text-foreground md:text-4xl">
            Investimento
          </motion.h2>
          <motion.div variants={fadeUp}>
            <Card className="border-2 border-accent/30 bg-card shadow-lg">
              <CardContent className="p-10">
                <p className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">Inscrição Individual</p>
                <p className="mb-1 font-serif text-5xl font-bold text-foreground">{formatCentsToBRL(event.unit_price_cents)}</p>
                <p className="mb-8 text-sm text-muted-foreground">por participante</p>
                {!isClosed && (
                  <Button
                    size="lg"
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90 py-6 text-lg font-semibold"
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

      {/* FINAL CTA */}
      <section className="bg-primary px-4 py-20 text-primary-foreground">
        <motion.div
          className="container mx-auto max-w-3xl text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          <motion.h2 variants={fadeUp} className="mb-6 font-serif text-3xl font-bold md:text-4xl">
            Esteja Preparado Para Dar Razão da Sua Esperança
          </motion.h2>
          <motion.p variants={fadeUp} className="mb-8 text-lg text-primary-foreground/70">
            Vagas limitadas. Inscreva-se e faça parte desta conferência transformadora.
          </motion.p>
          {!isClosed && (
            <motion.div variants={fadeUp}>
              <Button
                size="lg"
                className="bg-accent text-accent-foreground hover:bg-accent/90 px-10 py-6 text-lg font-semibold shadow-lg"
                onClick={() => navigate(`/evento/${event.slug}/inscricao`)}
              >
                Inscreva-se agora <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </motion.div>
          )}
        </motion.div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border bg-card px-4 py-8">
        <div className="container mx-auto max-w-4xl text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} {event.organizer_name || "Igreja"}. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
