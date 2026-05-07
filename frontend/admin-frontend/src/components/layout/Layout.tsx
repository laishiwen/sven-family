import { Suspense, useState } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import { useThemeStore, applyTheme } from "@/stores/themeStore";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  FileText,
  LayoutGrid,
  CreditCard,
  ShoppingCart,
  Search,
  BarChart3,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Loader2,
  Cog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV_GROUPS = [
  {
    label: "nav.overview",
    items: [{ to: "/dashboard", icon: LayoutDashboard, key: "nav.dashboard" }],
  },
  {
    label: "nav.community",
    items: [
      { to: "/community/users", icon: Users, key: "nav.community-users" },
      {
        to: "/community/sections",
        icon: LayoutGrid,
        key: "nav.community-sections",
      },
      { to: "/community/posts", icon: FileText, key: "nav.community-posts" },
      { to: "/engines", icon: Cog, key: "引擎管理" },
      { to: "/crawler", icon: Search, key: "nav.crawler" },
    ],
  },
  {
    label: "nav.business",
    items: [
      { to: "/memberships", icon: CreditCard, key: "nav.memberships" },
      { to: "/orders", icon: ShoppingCart, key: "nav.orders" },
    ],
  },
  {
    label: "nav.stats",
    items: [
      { to: "/stats/site", icon: BarChart3, key: "nav.stats-site" },
      { to: "/stats/desktop", icon: BarChart3, key: "nav.stats-desktop" },
      { to: "/stats/community", icon: BarChart3, key: "nav.stats-community" },
    ],
  },
  {
    label: "nav.system",
    items: [
      { to: "/analytics", icon: BarChart3, key: "nav.analytics" },
      { to: "/settings", icon: Settings, key: "nav.settings" },
      { to: "/system/admins", icon: Shield, key: "nav.admin-users" },
    ],
  },
];

// Flatten for header title lookup
const allNavItems = NAV_GROUPS.flatMap((g) => g.items);

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { adminUser, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const { t, i18n } = useTranslation();

  const handleSignOut = () => {
    logout();
    navigate("/login");
  };

  const toggleLanguage = () => {
    const next = i18n.language === "zh" ? "en" : "zh";
    i18n.changeLanguage(next);
  };

  const currentNavItem = allNavItems.find(
    (item) =>
      location.pathname === item.to ||
      (item.to !== "/dashboard" && location.pathname.startsWith(item.to)),
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-sidebar transition-all duration-200 ease",
          collapsed ? "w-16" : "w-56",
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            "flex items-center h-14 px-4 border-b border-border",
            collapsed ? "justify-center" : "gap-3",
          )}
        >
          <div className="w-3 h-3 rounded-full bg-[#D97706] flex-shrink-0" />
          {!collapsed && (
            <span className="font-serif text-lg font-semibold text-foreground">
              Sven Admin
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-3 mb-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                  {t(group.label)}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    location.pathname === item.to ||
                    (item.to !== "/dashboard" &&
                      location.pathname.startsWith(item.to));
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150",
                        collapsed && "justify-center px-2",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                      title={collapsed ? t(item.key) : undefined}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      {!collapsed && <span>{t(item.key)}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-border p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-full py-2 rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors duration-150"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header bar */}
        <header className="flex items-center justify-between h-14 px-6 border-b border-border bg-background/80 backdrop-blur-sm">
          <h1 className="font-serif text-lg font-semibold text-foreground">
            {currentNavItem ? t(currentNavItem.key) : t("app.title")}
          </h1>

          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next =
                  theme === "light"
                    ? "dark"
                    : theme === "dark"
                      ? "system"
                      : "light";
                setTheme(next);
                applyTheme(next);
              }}
              className="text-muted-foreground h-8 px-1.5"
              title={t("theme")}
            >
              {theme === "dark" ? (
                <Moon className="w-4 h-4" />
              ) : theme === "system" ? (
                <Monitor className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </Button>

            {/* Language toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="text-xs font-medium text-muted-foreground"
            >
              {i18n.language === "zh" ? "EN" : "中"}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                    {adminUser?.name?.charAt(0)?.toUpperCase() || "A"}
                  </div>
                  <span className="text-sm text-muted-foreground hidden sm:inline">
                    {adminUser?.name || "Admin"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  disabled
                  className="text-xs text-muted-foreground"
                >
                  {adminUser?.email || ""}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {t("sign-out")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
