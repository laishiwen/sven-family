import { useLocation, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useEffect, useCallback } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { isDesktop } from "@/lib/electron";
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Cpu,
  ScrollText,
  Wrench,
  Zap,
  Server,
  BookOpen,
  HardDrive,
  Activity,
  Settings,
  Users,
  Clock,
  Radio,
  BrainCircuit,
} from "lucide-react";
import { chatApi } from "@/lib/api";

const NAV_GROUPS = [
  {
    label: "nav.group.overview",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, key: "dashboard" },
      { to: "/community", icon: Users, key: "community" },
      { to: "/chat", icon: MessageSquare, key: "chat" },
    ],
  },
  {
    label: "nav.group.build",
    items: [
      { to: "/agents", icon: Bot, key: "agents" },
      { to: "/llm", icon: Cpu, key: "llm" },
      { to: "/prompts", icon: ScrollText, key: "prompts" },
      { to: "/tools", icon: Wrench, key: "tools" },
      { to: "/skills", icon: Zap, key: "skills" },
      { to: "/mcp", icon: Server, key: "mcp" },
    ],
  },
  {
    label: "nav.group.data",
    items: [
      { to: "/rag", icon: BookOpen, key: "rag" },
      { to: "/memory", icon: BrainCircuit, key: "memory" },
      { to: "/store", icon: HardDrive, key: "store" },
    ],
  },
  {
    label: "nav.group.ops",
    items: [
      { to: "/scheduler", icon: Clock, key: "scheduler" },
      { to: "/channels", icon: Radio, key: "channels" },
      { to: "/observability", icon: Activity, key: "observability" },
    ],
  },
  {
    label: "nav.group.system",
    items: [{ to: "/settings", icon: Settings, key: "settings" }],
  },
];

export function AppSidebar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state, toggleSidebar } = useSidebar();
  const navScrollRef = useRef<HTMLDivElement>(null);
  const hideNavScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const scheduleHideNavScrollbar = useCallback(() => {
    if (hideNavScrollTimerRef.current)
      clearTimeout(hideNavScrollTimerRef.current);
    hideNavScrollTimerRef.current = setTimeout(() => {
      navScrollRef.current?.classList.remove("sidebar-scrollbar--active");
    }, 800);
  }, []);

  useEffect(() => {
    const el = navScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      el.classList.add("sidebar-scrollbar--active");
      scheduleHideNavScrollbar();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (hideNavScrollTimerRef.current)
        clearTimeout(hideNavScrollTimerRef.current);
    };
  }, [scheduleHideNavScrollbar]);

  const prefetchChatData = async (): Promise<string | null> => {
    const sessions = await queryClient.fetchQuery({
      queryKey: ["chat-sessions"],
      queryFn: () => chatApi.listSessions().then((r) => r.data),
      staleTime: 10_000,
    });
    const firstSessionId = Array.isArray(sessions) ? sessions[0]?.id : null;
    if (firstSessionId) {
      await queryClient.prefetchQuery({
        queryKey: ["messages", firstSessionId],
        queryFn: () => chatApi.listMessages(firstSessionId).then((r) => r.data),
        staleTime: 10_000,
      });
    }
    return firstSessionId || null;
  };

  const handleChatNavigation = async () => {
    try {
      const firstSessionId = await prefetchChatData();
      navigate(firstSessionId ? `/chat/${firstSessionId}` : "/chat");
    } catch {
      navigate("/chat");
    }
  };

  return (
    <Sidebar
      collapsible="icon"
      variant="sidebar"
      className="flex flex-col h-full"
    >
      <SidebarHeader className="h-[calc(3rem+var(--titlebar-offset))] p-0 border-b border-sidebar-border overflow-hidden shrink-0">
        <Link
          to="/dashboard"
          className="flex flex-row items-center gap-2.5 px-3.5 h-full pt-[var(--titlebar-offset)] hover:opacity-80 transition-opacity"
        >
          <span className="flex items-center justify-center h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
          <span className="text-base font-normal text-sidebar-foreground tracking-tight font-serif">
            Sven Studio
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent ref={navScrollRef} className="sidebar-scrollbar">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[9px] uppercase tracking-[0.06em] text-muted-foreground/50">
              {t(group.label)}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(({ to, icon: Icon, key }) => {
                  const isActive = pathname === to;
                  if (to === "/chat") {
                    return (
                      <SidebarMenuItem key={to}>
                        <SidebarMenuButton
                          isActive={isActive || pathname.startsWith("/chat/")}
                          tooltip={t(key)}
                          onMouseEnter={() => void prefetchChatData()}
                          onFocus={() => void prefetchChatData()}
                          onClick={() => void handleChatNavigation()}
                        >
                          <Icon />
                          <span>{t(key)}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }
                  return (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={t(key)}
                      >
                        <Link to={to}>
                          <Icon />
                          <span>{t(key)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={toggleSidebar}
              tooltip={
                state === "expanded"
                  ? t("sidebar.collapse")
                  : t("sidebar.expand")
              }
              className="justify-center h-10 text-muted-foreground/50 hover:text-muted-foreground rounded-none"
            >
              {state === "expanded" ? (
                <PanelLeftClose className="shrink-0 h-4 w-4" />
              ) : (
                <PanelLeftOpen className="shrink-0 h-4 w-4" />
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
