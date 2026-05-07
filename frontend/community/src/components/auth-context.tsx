"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { loginAPI, registerAPI } from "@/lib/bridge-client";

interface User {
  id: string;
  email: string;
  username: string;
  avatar_url: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (email: string, username: string, password: string) => Promise<{ error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: async () => ({}),
  register: async () => ({}),
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function decodeUser(t: string): User | null {
  try {
    const payload = JSON.parse(atob(t.split(".")[1]));
    return {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      avatar_url: payload.avatar_url || "",
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("community_token");
    if (stored) {
      const u = decodeUser(stored);
      if (u) {
        setToken(stored);
        setUser(u);
      } else {
        localStorage.removeItem("community_token");
      }
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const data = await loginAPI(email, password);
      localStorage.setItem("community_token", data.access_token);
      setToken(data.access_token);
      const u = decodeUser(data.access_token);
      if (u) setUser(u);
      return {};
    } catch (err: any) {
      return { error: err.message || "Login failed" };
    }
  }, []);

  const register = useCallback(
    async (email: string, username: string, password: string) => {
      try {
        const data = await registerAPI(email, username, password);
        localStorage.setItem("community_token", data.access_token);
        setToken(data.access_token);
        const u = decodeUser(data.access_token);
        if (u) setUser(u);
        return {};
      } catch (err: any) {
        return { error: err.message || "Registration failed" };
      }
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem("community_token");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
