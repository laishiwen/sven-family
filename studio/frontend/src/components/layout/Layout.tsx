import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { trackAppOpen } from "@/lib/analytics";
import TopBar from "./TopBar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
export default function Layout() {
  const location = useLocation();
  const isChatRoute =
    location.pathname === "/chat" || location.pathname.startsWith("/chat/");
  const isCommunityRoute =
    location.pathname === "/community" || location.pathname.startsWith("/community/");
  const isFullWidth = isChatRoute || isCommunityRoute;

  useEffect(() => {
    trackAppOpen(location.pathname);
  }, [location.pathname]);

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "12rem",
          "--sidebar-width-mobile": "12rem",
          "--sidebar-width-icon": "3.5rem",
        } as React.CSSProperties
      }
    >
      <AppSidebar />
      <SidebarInset className="overflow-hidden min-h-0">
        <TopBar />
        <main
          className="flex-1 overflow-y-auto"
          style={{ scrollbarGutter: "stable" }}
        >
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
