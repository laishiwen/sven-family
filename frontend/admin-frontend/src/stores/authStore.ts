import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

type AuthState = {
  token: string | null;
  adminUser: AdminUser | null;
  isAuthenticated: boolean;
  login: (token: string, user: AdminUser) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      adminUser: null,
      isAuthenticated: false,

      login: (token: string, user: AdminUser) =>
        set({
          token,
          adminUser: user,
          isAuthenticated: true,
        }),

      logout: () =>
        set({
          token: null,
          adminUser: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: "sven-admin-auth",
      partialize: (state) => ({
        token: state.token,
        adminUser: state.adminUser,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
