import { useEffect, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { EventData } from "@/lib/types";
import { formatCentsToBRL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, MapPin, ChevronRight, BookOpen, Search } from "lucide-react";
import CpfLookupDialog from "@/components/CpfLookupDialog";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

interface SiteSettings {
  header_type: "color" | "banner";
  header_color: string;
  header_title: string;
  header_subtitle: string;
  header_banner_url: string | null;
  footer_text: string;
}

export default function EventsListPage() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [lookupOpen, setLookupOpen] = useState(false);

  // Open lookup dialog automatically when redirected with ?lookup=1
  useEffect(() => {
    if (searchParams.get("lookup") === "1") {
      setLookupOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("lookup");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    async function load() {
      const [evRes, settingsRes] = await Promise.all([
        supabase
          .from("events")
          .select("*")
          .in("status", ["published"])
          .order("start_date", { ascending: true }),
        supabase
          .from("site_settings")
          .select("*")
          .limit(1)
          .single(),
      ]);
      setEvents((evRes.data || []) as unknown as EventData[]);
      if (settingsRes.data) setSettings(settingsRes.data as unknown as SiteSettings);
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

  const headerTitle = settings?.header_title || "Nossos Eventos";
  const headerSubtitle = settings?.header_subtitle || "Confira os eventos disponíveis e inscreva-se";
  const footerText = settings?.footer_text || "© 2026 INSIT. Todos os direitos reservados.";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* HEADER */}
      {settings?.header_type === "banner" && settings.header_banner_url ? (
        <section
          className="relative flex items-center justify-center px-4 py-20 text-center"
          style={{
            backgroundImage: `url(${settings.header_banner_url})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-[2px]" />
          <div className="relative z-10 container mx-auto max-w-4xl">
            <motion.h1
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className="mb-3 font-serif text-4xl font-bold text-white md:text-5xl tracking-tight"
            >
              {headerTitle}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}
              className="text-white/70 text-lg"
            >
              {headerSubtitle}
            </motion.p>
          </div>
        </section>
      ) : (
        <section
          className="relative px-4 py-20 text-center overflow-hidden"
          style={{ backgroundColor: `hsl(${settings?.header_color || "222 47% 18%"})` }}
        >
          <div className="absolute inset-0 opacity-[0.06]">
            <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-white blur-[100px]" />
            <div className="absolute bottom-0 left-1/4 h-48 w-48 rounded-full bg-white blur-[80px]" />
          </div>
          <div className="container relative mx-auto max-w-4xl">
            <motion.h1
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className="mb-3 font-serif text-4xl font-bold text-white md:text-5xl tracking-tight"
            >
              {headerTitle}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}
              className="text-white/60 text-lg"
            >
              {headerSubtitle}
            </motion.p>
          </div>
        </section>
      )}

      {/* CONTENT */}
      <section className="flex-1 px-4 py-8">
        <div className="container mx-auto max-w-4xl">
          {/* Consultar inscrições */}
          <div className="mb-8 flex justify-end">
            <Button variant="outline" className="gap-2" onClick={() => setLookupOpen(true)}>
              <Search className="h-4 w-4" /> Consultar minhas inscrições
            </Button>
            <CpfLookupDialog open={lookupOpen} onOpenChange={setLookupOpen} />
          </div>

          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BookOpen className="mb-4 h-16 w-16 text-muted-foreground" />
              <h2 className="mb-2 font-serif text-3xl font-bold text-foreground">Nenhum evento publicado</h2>
              <p className="text-muted-foreground">Em breve teremos novidades. Volte logo!</p>
            </div>
          ) : (
            <motion.div
              className="space-y-6"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
            >
              {events.map((ev) => {
                const isClosed = ev.status === "closed";
                const dateStr = new Date(ev.start_date + "T00:00:00").toLocaleDateString("pt-BR", {
                  day: "numeric", month: "long", year: "numeric",
                });

                return (
                  <motion.div key={ev.id} variants={fadeUp}>
                    <Card
                      className="group cursor-pointer overflow-hidden border-border/50 bg-card shadow-premium hover:shadow-premium-lg transition-all duration-300"
                      onClick={() => navigate(`/evento/${ev.slug}`)}
                    >
                      <div className="flex flex-col md:flex-row">
                        {((ev as any).poster_url || ev.banner_url) && (
                          <div className="h-48 md:h-auto md:w-72 flex-shrink-0 overflow-hidden">
                            <img src={((ev as any).poster_url || ev.banner_url)!} alt={ev.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          </div>
                        )}
                        <CardContent className="flex flex-1 flex-col justify-between p-6 lg:p-8">
                          <div>
                            <h2 className="mb-2 font-serif text-2xl font-bold text-foreground tracking-tight group-hover:text-accent transition-colors duration-300">{ev.title}</h2>
                            {ev.subtitle && <p className="mb-4 text-muted-foreground leading-relaxed">{ev.subtitle}</p>}
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                <Calendar className="h-4 w-4 text-accent/70" /> {dateStr}
                              </span>
                              {ev.location_name && (
                                <span className="flex items-center gap-1.5">
                                  <MapPin className="h-4 w-4 text-accent/70" /> {ev.location_name}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-5 flex items-center justify-between pt-4 border-t border-border/40">
                            <span className="font-serif text-2xl font-bold text-foreground">
                              {formatCentsToBRL(ev.unit_price_cents)}
                            </span>
                            <Button
                              variant={isClosed ? "outline" : "default"}
                              className={`gap-1 ${!isClosed ? "gradient-gold text-white shadow-gold hover:opacity-90" : ""}`}
                              disabled={isClosed}
                            >
                              {isClosed ? "Encerrado" : "Ver detalhes"}
                              {!isClosed && <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </div>
                        </CardContent>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border/60 bg-card px-4 py-8">
        <div className="container mx-auto max-w-4xl flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">{footerText}</p>
          <div className="flex items-center gap-4">
            <Link
              to="/checkin/login"
              className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              Check-in
            </Link>
            <Link
              to="/admin/login"
              className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              Administrativo
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
