import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { EventData } from "@/lib/types";
import { formatCentsToBRL } from "@/lib/constants";
import { getTemplateById } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, MapPin, ChevronRight, BookOpen } from "lucide-react";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function EventsListPage() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("events")
        .select("*")
        .in("status", ["published", "closed"])
        .order("start_date", { ascending: true });
      setEvents((data || []) as unknown as EventData[]);
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

  // If only one event, redirect directly to its landing page
  if (events.length === 1) {
    navigate(`/evento/${events[0].slug}`, { replace: true });
    return null;
  }

  if (events.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <BookOpen className="mb-4 h-16 w-16 text-muted-foreground" />
        <h1 className="mb-2 font-serif text-3xl font-bold text-foreground">Nenhum evento publicado</h1>
        <p className="text-muted-foreground">Em breve teremos novidades. Volte logo!</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <section className="bg-primary px-4 py-16 text-primary-foreground">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="mb-2 font-serif text-4xl font-bold">Nossos Eventos</h1>
          <p className="text-primary-foreground/70">Confira os eventos disponíveis e inscreva-se</p>
        </div>
      </section>

      <section className="px-4 py-12">
        <motion.div
          className="container mx-auto max-w-4xl space-y-6"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        >
          {events.map((ev) => {
            const isClosed = ev.status === "closed";
            const template = getTemplateById((ev as any).template || "classic");
            const dateStr = new Date(ev.start_date + "T00:00:00").toLocaleDateString("pt-BR", {
              day: "numeric", month: "long", year: "numeric",
            });

            return (
              <motion.div key={ev.id} variants={fadeUp}>
                <Card
                  className="cursor-pointer overflow-hidden hover:shadow-lg transition-shadow"
                  onClick={() => navigate(`/evento/${ev.slug}`)}
                >
                  <div className="flex flex-col md:flex-row">
                    {ev.banner_url && (
                      <div className="h-48 md:h-auto md:w-72 flex-shrink-0">
                        <img src={ev.banner_url} alt={ev.title} className="h-full w-full object-cover" />
                      </div>
                    )}
                    <CardContent className="flex flex-1 flex-col justify-between p-6">
                      <div>
                        <h2 className="mb-2 font-serif text-2xl font-bold text-foreground">{ev.title}</h2>
                        {ev.subtitle && <p className="mb-3 text-muted-foreground">{ev.subtitle}</p>}
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" /> {dateStr}
                          </span>
                          {ev.location_name && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" /> {ev.location_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="font-serif text-xl font-bold text-foreground">
                          {formatCentsToBRL(ev.unit_price_cents)}
                        </span>
                        <Button
                          variant={isClosed ? "outline" : "default"}
                          className="gap-1"
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
      </section>
    </div>
  );
}
