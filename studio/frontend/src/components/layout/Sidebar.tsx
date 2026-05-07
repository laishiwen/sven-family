import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/appStore";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Cpu,
  Wrench,
  Zap,
  Server,
  BookOpen,
  HardDrive,
  Activity,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
  { to: "/chat", icon: MessageSquare, key: "chat" },
  { to: "/agents", icon: Bot, key: "agents" },
  { to: "/llm", icon: Cpu, key: "llm" },
  { to: "/tools", icon: Wrench, key: "tools" },
  { to: "/skills", icon: Zap, key: "skills" },
  { to: "/mcp", icon: Server, key: "mcp" },
  { to: "/rag", icon: BookOpen, key: "rag" },
  { to: "/store", icon: HardDrive, key: "store" },
  { to: "/observability", icon: Activity, key: "observability" },
  { to: "/settings", icon: Settings, key: "settings" },
];

export default function Sidebar() {
  const { t } = useTranslation();
  const { sidebarCollapsed, toggleSidebar } = useAppStore();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-full flex flex-col transition-all duration-200 z-30",
        "bg-sidebar border-r border-sidebar-border",
        sidebarCollapsed ? "w-16" : "w-60",
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-primary-foreground" />
        </div>
        {!sidebarCollapsed && (
          <span className="text-sidebar-foreground font-semibold text-base tracking-tight">
            Sven Studio
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150",
                "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                isActive &&
                  "text-sidebar-primary-foreground bg-primary hover:bg-primary/90 hover:text-sidebar-primary-foreground",
              )
            }
            title={sidebarCollapsed ? t(key) : undefined}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {!sidebarCollapsed && <span>{t(key)}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse button */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-10 border-t border-sidebar-border text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
        title={sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
      >
        {sidebarCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>
    </aside>
  );
}
