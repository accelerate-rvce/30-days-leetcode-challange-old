import { HashRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./lib/auth";
import { Shell } from "./components/layout";
import { Landing } from "./pages/landing";
import { Waitlist, WaitlistVerify } from "./pages/waitlist";
import { Login, Register, VerifyEmail, Forgot, Reset } from "./pages/auth";
import { Dashboard, Profile } from "./pages/dashboard";
import { Challenges, ChallengeDetail, Leaderboard, PublicProfile } from "./pages/challenges-leaderboard";
import { Admin } from "./pages/admin";
import type { ReactNode } from "react";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } });

function Guard({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="max-w-4xl mx-auto px-4 py-14 text-sm text-mut">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "ADMIN" && user.role !== "SUPERADMIN") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function NotFound() {
  return <div className="max-w-xl mx-auto px-4 py-20 text-center"><h1 className="font-disp text-3xl font-bold">404</h1><p className="text-mut mt-2">This page doesn't exist.</p><Link to="/" className="text-cy underline text-sm">Back home</Link></div>;
}

export function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <HashRouter>
          <Shell>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/waitlist" element={<Waitlist />} />
              <Route path="/waitlist/verify" element={<WaitlistVerify />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/forgot-password" element={<Forgot />} />
              <Route path="/reset-password" element={<Reset />} />
              <Route path="/dashboard" element={<Guard><Dashboard /></Guard>} />
              <Route path="/profile" element={<Guard><Profile /></Guard>} />
              <Route path="/challenges" element={<Challenges />} />
              <Route path="/challenges/:n" element={<ChallengeDetail />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/u/:username" element={<PublicProfile />} />
              <Route path="/admin" element={<Guard admin><Admin /></Guard>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Shell>
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
