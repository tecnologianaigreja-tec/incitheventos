import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Trophy, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import type { RegistrationData } from "@/lib/types";
import { getFieldValue } from "@/components/DynamicFieldFilters";

interface Props {
  pool: RegistrationData[]; // currently filtered presentes
}

export default function CheckinRaffle({ pool }: Props) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);
  const [allowRepeat, setAllowRepeat] = useState(false);
  const [drawnIds, setDrawnIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<RegistrationData[]>([]);
  const [winners, setWinners] = useState<RegistrationData[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [spinName, setSpinName] = useState<string>("");
  const intervalRef = useRef<number | null>(null);

  useEffect(() => () => { if (intervalRef.current) window.clearInterval(intervalRef.current); }, []);

  const eligible = allowRepeat ? pool : pool.filter(r => !drawnIds.has(r.id));
  const maxDraw = Math.max(1, eligible.length);

  function pickRandom(arr: RegistrationData[], n: number): RegistrationData[] {
    const copy = [...arr];
    const out: RegistrationData[] = [];
    for (let i = 0; i < n && copy.length > 0; i++) {
      const idx = Math.floor(Math.random() * copy.length);
      out.push(copy.splice(idx, 1)[0]);
    }
    return out;
  }

  function start() {
    if (eligible.length === 0) return;
    const n = Math.min(Math.max(1, count), eligible.length);
    setSpinning(true);
    setWinners([]);

    const tickStart = Date.now();
    const DURATION = 2500;
    intervalRef.current = window.setInterval(() => {
      const r = pool[Math.floor(Math.random() * pool.length)];
      setSpinName(r?.full_name || "");
      if (Date.now() - tickStart >= DURATION) {
        if (intervalRef.current) window.clearInterval(intervalRef.current);
        intervalRef.current = null;
        const picks = pickRandom(eligible, n);
        setWinners(picks);
        setHistory(prev => [...picks, ...prev]);
        if (!allowRepeat) {
          setDrawnIds(prev => {
            const s = new Set(prev);
            picks.forEach(p => s.add(p.id));
            return s;
          });
        }
        setSpinning(false);
        setSpinName("");
      }
    }, 80);
  }

  function clearHistory() {
    setHistory([]);
    setDrawnIds(new Set());
    setWinners([]);
  }

  function detail(r: RegistrationData) {
    const cong = r.congregation || getFieldValue(r, "congregacao") || getFieldValue(r, "congregation");
    const area = r.area || getFieldValue(r, "area");
    const parts = [area, cong].filter(Boolean);
    return parts.join(" · ");
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-serif text-lg font-semibold text-foreground">
              Sorteio entre presentes
            </h3>
            <Badge variant="outline">
              {eligible.length} elegíve{eligible.length === 1 ? "l" : "is"}
              {!allowRepeat && drawnIds.size > 0 ? ` · ${drawnIds.size} já sorteado${drawnIds.size > 1 ? "s" : ""}` : ""}
            </Badge>
          </div>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {open && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <div className="space-y-1">
                <Label className="text-xs">Quantidade a sortear</Label>
                <Input
                  type="number"
                  min={1}
                  max={maxDraw}
                  value={count}
                  onChange={e => setCount(Math.max(1, Math.min(maxDraw, Number(e.target.value) || 1)))}
                  disabled={spinning}
                />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch checked={allowRepeat} onCheckedChange={setAllowRepeat} disabled={spinning} />
                <Label className="text-xs">Permitir repetir vencedores</Label>
              </div>
              <div className="flex gap-2">
                <Button onClick={start} disabled={spinning || eligible.length === 0} className="gap-2 flex-1">
                  <Sparkles className="h-4 w-4" />
                  {spinning ? "Sorteando..." : "Sortear agora"}
                </Button>
                {history.length > 0 && (
                  <Button variant="ghost" onClick={clearHistory} disabled={spinning} className="gap-1">
                    <RotateCcw className="h-3.5 w-3.5" /> Limpar
                  </Button>
                )}
              </div>
            </div>

            {spinning && (
              <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-8 text-center">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Sorteando...</p>
                <p className="mt-2 font-serif text-2xl font-bold text-foreground truncate">{spinName || "—"}</p>
              </div>
            )}

            {!spinning && winners.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {winners.length === 1 ? "Vencedor" : `Vencedores (${winners.length})`}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {winners.map(w => (
                    <div key={w.id} className="rounded-lg border-2 border-primary bg-gradient-to-br from-primary/10 to-primary/5 p-4">
                      <div className="flex items-start gap-3">
                        <Trophy className="h-6 w-6 text-primary flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-serif text-lg font-bold text-foreground truncate">{w.full_name}</p>
                          {w.email && <p className="text-xs text-muted-foreground truncate">{w.email}</p>}
                          {detail(w) && <p className="text-xs text-muted-foreground truncate">{detail(w)}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {history.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Histórico da sessão ({history.length})
                </p>
                <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-xs space-y-0.5">
                  {history.map((h, i) => (
                    <div key={`${h.id}-${i}`} className="flex justify-between gap-2">
                      <span className="truncate">{history.length - i}. {h.full_name}</span>
                      <span className="text-muted-foreground flex-shrink-0">{detail(h)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pool.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                Nenhum participante presente para sortear neste dia/filtro.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
