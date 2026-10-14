import { createContext, useContext, useCallback, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export interface User { id: string; email: string; name: string; displayName: string; leetcodeUsername: string; role: string; status: string }

const AuthCtx = createContext<{ user: User | null; loading: boolean; refresh: () => void; logout: () => Promise<void> }>({
  user: null, loading: true, refresh: () => {}, logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [tick, setTick] = useState(0);
  const q = useQuery({
    queryKey: ["me", tick],
    queryFn: () => api.get<{ user: User }>("/auth/me").then((r) => r.user).catch(() => null),
    retry: false, staleTime: 30_000,
  });
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => {});
    qc.clear(); setTick((t) => t + 1);
  }, [qc]);
  return <AuthCtx.Provider value={{ user: q.data ?? null, loading: q.isLoading, refresh, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
