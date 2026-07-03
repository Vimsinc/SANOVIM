import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Sparkles,
  Image,
  Video,
  TrendingUp,
  Wand2,
  Zap,
  History,
  LogOut,
  ShieldCheck,
  Users,
  Filter,
  CalendarClock,
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useIsAdmin } from "@/hooks/use-is-admin";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/leads", icon: Users, label: "Leads" },
  { href: "/retornos", icon: CalendarClock, label: "Retornos" },
  { href: "/funil", icon: Filter, label: "Funil" },
  { href: "/generator", icon: Sparkles, label: "Gerar" },
  { href: "/images", icon: Image, label: "Imagens" },
  { href: "/video", icon: Video, label: "Vídeo" },
  { href: "/experience", icon: Wand2, label: "Experience" },
  { href: "/trending", icon: TrendingUp, label: "Trending" },
  { href: "/history", icon: History, label: "Histórico" },
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const isAdmin = useIsAdmin();

  return (
    <aside className="w-16 md:w-56 flex flex-col h-screen bg-sidebar border-r border-sidebar-border shrink-0 fixed left-0 top-0 z-40">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-primary-foreground" />
        </div>
        <div className="hidden md:block overflow-hidden">
          <p className="text-sm font-bold text-foreground tracking-tight leading-tight">VibeManager</p>
          <p className="text-[10px] text-muted-foreground leading-tight">Conteúdo Viral com IA</p>
        </div>
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href}>
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer group ${
                  isActive
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
                <span className="hidden md:block text-sm font-medium">{label}</span>
              </div>
            </Link>
          );
        })}

        {isAdmin && (
          <Link href="/admin">
            <div
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer mt-2 border ${
                location.startsWith("/admin")
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : "text-amber-500/60 hover:text-amber-400 border-amber-500/20 hover:bg-amber-500/10 border-transparent"
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="hidden md:block text-sm font-medium">Admin</span>
            </div>
          </Link>
        )}
      </nav>

      <div className="px-3 py-3 border-t border-sidebar-border space-y-2">
        {user && (
          <div className="hidden md:flex items-center gap-2 px-2 py-1.5 rounded-lg bg-sidebar-accent/50">
            {user.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-primary">
                  {(user.firstName?.[0] || user.email?.[0] || "U").toUpperCase()}
                </span>
              </div>
            )}
            <p className="text-xs text-foreground font-medium truncate">
              {user.firstName || user.email || "Usuário"}
            </p>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className="hidden md:block text-xs font-medium">Sair</span>
        </button>
        <p className="hidden md:block text-[10px] text-muted-foreground px-2">v1.0.0 &bull; VibeManager</p>
      </div>
    </aside>
  );
}
