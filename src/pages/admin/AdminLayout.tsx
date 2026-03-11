import { useEffect, useState } from "react";
import { Outlet, useNavigate, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Calendar, ShoppingCart, Users, QrCode, Award, Download, Settings, LogOut, Menu, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { label: "Eventos", path: "/admin/eventos", icon: Calendar },
  { label: "Pedidos", path: "/admin/pedidos", icon: ShoppingCart },
  { label: "Inscritos", path: "/admin/inscritos", icon: Users },
  { label: "Check-in", path: "/admin/checkin", icon: QrCode },
  { label: "Certificados", path: "/admin/certificados", icon: Award },
  { label: "Exportação", path: "/admin/exportacao", icon: Download },
  { label: "Configurações", path: "/admin/configuracoes", icon: Settings },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState("");
  const [adminRole, setAdminRole] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/admin/login"); return; }

      const { data: admin } = await supabase
        .from("admin_users")
        .select("name, role")
        .eq("user_id", user.id)
        .single();

      if (!admin) { navigate("/admin/login"); return; }
      setAdminName(admin.name);
      setAdminRole(admin.role === "superadmin" ? "Super Admin" : admin.role === "admin" ? "Administrador" : "Operador");
      setLoading(false);
    }
    check();
  }, [navigate]);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/admin/login");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  const currentPageLabel = navItems.find(i => i.path === location.pathname)?.label || "Admin";

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0",
        "gradient-dark text-sidebar-foreground",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-gold shadow-gold">
              <LayoutDashboard className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-white">Painel Admin</h2>
              <p className="text-[11px] text-white/40 font-medium">Sistema de Gestão</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-white/50 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">Menu Principal</p>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
                  isActive
                    ? "bg-white/[0.1] text-white shadow-premium-sm"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white/85"
                )}
              >
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md transition-all duration-200",
                  isActive
                    ? "gradient-gold shadow-gold text-white"
                    : "bg-white/[0.06] text-white/50 group-hover:bg-white/[0.1] group-hover:text-white/70"
                )}>
                  <item.icon className="h-4 w-4" />
                </div>
                {item.label}
                {isActive && (
                  <ChevronRight className="ml-auto h-3.5 w-3.5 text-white/40" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-white/[0.08] p-4">
          <div className="flex items-center gap-3 mb-3 px-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.1] text-white/70 text-sm font-semibold">
              {adminName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white/90 truncate">{adminName}</p>
              <p className="text-[11px] text-white/35">{adminRole}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start gap-2 text-white/40 hover:text-white hover:bg-white/[0.06] text-[13px] h-9"
          >
            <LogOut className="h-4 w-4" /> Sair do sistema
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-border bg-card/80 glass px-5 py-3.5 lg:px-8">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-foreground hover:text-accent transition-colors">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-serif text-xl font-bold text-foreground tracking-tight">
              {currentPageLabel}
            </h1>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-full">
            <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            Sistema online
          </div>
        </header>
        <main className="flex-1 p-5 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
