import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ArrowLeft, QrCode } from "lucide-react";

export default function CheckinLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error("Credenciais inválidas");
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Erro de autenticação"); return; }

      const { data: adminUser } = await supabase
        .from("admin_users")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (!adminUser || !["superadmin", "admin", "checkin_operator"].includes(adminUser.role)) {
        toast.error("Acesso não autorizado para check-in");
        await supabase.auth.signOut();
        return;
      }

      navigate("/checkin");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-[400px] space-y-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Voltar para eventos
        </Link>

        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-gold shadow-gold">
            <QrCode className="h-7 w-7 text-white" />
          </div>
        </div>

        <div className="space-y-2 text-center">
          <h1 className="font-serif text-3xl font-bold text-foreground tracking-tight">
            Acesso Check-in
          </h1>
          <p className="text-muted-foreground">
            Entre com as credenciais da equipe de check-in
          </p>
        </div>

        <Card className="border-border/60 shadow-premium-lg">
          <CardContent className="p-6">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[13px] font-medium">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="equipe@exemplo.com"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-[13px] font-medium">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="h-11"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 gradient-gold text-white font-semibold shadow-gold hover:opacity-90 transition-opacity"
                disabled={loading}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Entrar
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground/60">
          Acesso restrito à equipe autorizada de check-in
        </p>
      </div>
    </div>
  );
}
