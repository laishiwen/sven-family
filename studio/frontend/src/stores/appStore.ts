import { create } from "zustand";
import { persist } from "zustand/middleware";
import i18n from "@/i18n";

type Theme = "light" | "dark" | "system";
type Locale = "zh-CN" | "en";

interface UserInfo {
  email: string;
  name: string;
}

interface AppState {
  theme: Theme;
  locale: Locale;
  sidebarCollapsed: boolean;
  userName: string;
  userAvatarUrl: string;

  // Auth
  isLoggedIn: boolean;
  authToken: string | null;
  userEmail: string;

  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
  toggleSidebar: () => void;
  setUserProfile: (payload: { name?: string; avatarUrl?: string }) => void;

  login: (user: UserInfo, token: string) => void;
  logout: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: "light",
      locale: "zh-CN",
      sidebarCollapsed: false,
      userName: i18n.t("chat.user.default-name"),
      userAvatarUrl: "",

      // Auth defaults
      isLoggedIn: false,
      authToken: null,
      userEmail: "",

      setTheme: (theme) => {
        set({ theme });
        const isDark =
          theme === "dark" ||
          (theme === "system" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.classList.toggle("dark", isDark);
      },

      setLocale: (locale) => {
        localStorage.setItem("locale", locale);
        set({ locale });
      },
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setUserProfile: ({ name, avatarUrl }) =>
        set((s) => ({
          userName: name === undefined ? s.userName : name,
          userAvatarUrl: avatarUrl === undefined ? s.userAvatarUrl : avatarUrl,
        })),

      login: (user, token) =>
        set({
          isLoggedIn: true,
          authToken: token,
          userEmail: user.email,
          userName: user.name || user.email,
        }),

      logout: () =>
        set({
          isLoggedIn: false,
          authToken: null,
          userEmail: "",
        }),
    }),
    { name: "agent-studio-app" },
  ),
);
