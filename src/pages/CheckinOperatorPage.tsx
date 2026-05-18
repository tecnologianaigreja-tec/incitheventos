import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, QrCode } from "lucide-react";
import AdminCheckin from "./admin/AdminCheckin";

export default function CheckinOperatorPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [operatorName, setOperatorName] = useState("");

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/checkin/login"); return; }

      const { data: admin } = await supabase
        .from("admin_users")
        .select("name, role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!admin || !["superadmin", "admin", "checkin_operator"].includes(admin.role)) {
        navigate("/checkin/login");
        return;
      }
      setOperatorName(admin.name);
      setLoading(false);
    }
    check();
  }, [navigate]);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/checkin/login");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-border bg-card/80 glass px-5 py-3.5 lg:px-8">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-gold shadow-gold">
          <QrCode className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="font-serif text-xl font-bold text-foreground tracking-tight">
            Check-in
          </h1>
          <p className="text-[11px] text-muted-foreground">Equipe: {operatorName}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </header>
      <main className="flex-1 p-5 lg:p-8">
        <div className="mx-auto max-w-5xl">
          <AdminCheckin />
        </div>
      </main>
    </div>
  );
}
