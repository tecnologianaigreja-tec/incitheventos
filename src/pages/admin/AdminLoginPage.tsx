import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Shield } from "lucide-react";
import { Link } from "react-router-dom";

export default function AdminLoginPage() {
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
        .maybeSingle();

      if (!adminUser || !["superadmin", "admin"].includes(adminUser.role)) {
        toast.error("Acesso restrito a administradores");
        await supabase.auth.signOut();
        return;
      }

      navigate("/admin");
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel - decorative */}
      <div className="hidden lg:flex lg:w-[45%] gradient-dark relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 opacity-[0.03]">
          <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-accent blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 h-64 w-64 rounded-full bg-primary blur-[100px]" />
        </div>
        <div className="relative text-center max-w-md">
          <div className="flex justify-center mb-8">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl gradient-gold shadow-gold">
              <Shield className="h-10 w-10 text-white" />
            </div>
          </div>
          <h2 className="font-serif text-4xl font-bold text-white tracking-tight mb-4">
            Painel Administrativo
          </h2>
          <p className="text-white/40 text-lg leading-relaxed">
            Gerencie eventos, inscrições, certificados e muito mais em uma plataforma integrada.
          </p>
          <div className="mt-10 flex justify-center gap-8">
            {["Eventos", "Inscrições", "Certificados"].map(item => (
              <div key={item} className="text-center">
                <div className="h-2 w-2 rounded-full gradient-gold mx-auto mb-2" />
                <span className="text-[11px] text-white/30 uppercase tracking-wider font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-[400px] space-y-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Voltar para eventos
          </Link>

          <div className="space-y-2">
            <h1 className="font-serif text-3xl font-bold text-foreground tracking-tight">
              Bem-vindo de volta
            </h1>
            <p className="text-muted-foreground">
              Faça login para acessar o painel administrativo
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
                    placeholder="admin@exemplo.com"
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
            Acesso restrito a administradores autorizados
          </p>
        </div>
      </div>
    </div>
  );
}
