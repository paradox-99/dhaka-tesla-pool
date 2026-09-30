"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export type UserRole = "PASSENGER" | "DRIVER";

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  walletBalancePaisa: number;
  createdAt: string;
  vehicle?: {
    id: string;
    name: string;
    plateNumber: string;
    capacity: number;
    isOnline: boolean;
  };
};

type AuthPayload = {
  token: string;
  user: User;
};

type AuthContextValue = {
  token: string | null;
  user: User | null;
  isReady: boolean;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: { name: string; email: string; phone: string; password: string }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_TOKEN_KEY = "dhaka-tesla-pool-token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage.getItem(STORAGE_TOKEN_KEY);
  });
  const [user, setUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return !window.localStorage.getItem(STORAGE_TOKEN_KEY);
  });

  useEffect(() => {
    if (!token) {
      return;
    }

    apiFetch<User>("/api/auth/me")
      .then((payload) => setUser(payload ?? null))
      .catch(() => {
        window.localStorage.removeItem(STORAGE_TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setIsReady(true));
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    window.localStorage.setItem(STORAGE_TOKEN_KEY, token);
  }, [token]);

  const persist = useCallback(
    (nextToken: string, nextUser: User) => {
      setToken(nextToken);
      setUser(nextUser);
      window.localStorage.setItem(STORAGE_TOKEN_KEY, nextToken);
      const destination = nextUser.role === "PASSENGER" ? "/passenger" : "/driver";
      router.push(destination);
    },
    [router],
  );

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const result = await apiFetch<AuthPayload>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      });

      persist(result.token, result.user);
    },
    [persist],
  );

  const register = useCallback(
    async (input: { name: string; email: string; phone: string; password: string }) => {
      const result = await apiFetch<AuthPayload>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      });

      persist(result.token, result.user);
    },
    [persist],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    window.localStorage.removeItem(STORAGE_TOKEN_KEY);
    router.push("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ token, user, isReady, login, register, logout }),
    [token, user, isReady, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
