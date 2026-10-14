import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Code2, Trophy, ShieldCheck, Clock, Mail } from "lucide-react";
import { api, type EventInfo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, Skeleton, StatusBadge } from "../components/ui";

function useEvent() { return useQuery({ queryKey: ["event"], queryFn: () => api.get<EventInfo>("/event") }); }
function usePreview() {
  return useQuery({ queryKey: ["lb-preview"], queryFn: () => api.get<{ data: { rank: number; displayName: string; leetcodeUsername: string; totalPoints: number; verifiedCount: number }[]; total: number }>("/leaderboard?page=1&pageSize=5") });
}
function useToday() { return useQuery({ queryKey: ["today"], queryFn: () => api.get<{ today: { dayNumber: number; title: string; difficulty: string } | null }>("/challenges/today") }); }

function Countdown({ start }: { start: string }) {
  const t = Math.max(0, new Date(start).getTime() - Date.now());
  const d = Math.floor(t / 86400000), h = Math.floor(t % 86400000 / 3600000), m = Math.floor(t % 3600000 / 60000);
  return <span className="font-mono text-cy">{d}d {h}h {m}m</span>;
}

export function Landing() {
  const { user } = useAuth();
  const ev = useEvent();
  const prev = usePreview();
  const today = useToday();
  const mode = ev.data?.registrationMode ?? "WAITLIST";
  const cta = user ? { to: "/dashboard", label: "Open your dashboard" } : mode === "WAITLIST" ? { to: "/waitlist", label: "Join the Waitlist" } : mode === "OPEN" ? { to: "/register", label: "Register now" } : { to: "/leaderboard", label: "View leaderboard" };

  return (
    <div>
      {/* HERO */}
      <section className="acc-grid-bg border-b border-line">
        <div className="max-w-6xl mx-auto px-4 py-16 md:py-24">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <p className="font-mono text-xs tracking-widest text-cy">ACCELERATE · RVCE · 30-DAY CHALLENGE</p>
            <h1 className="font-disp text-4xl md:text-6xl font-bold leading-tight mt-3">30 Days. 30 Problems.<br /><span className="acc-gradient-text">One Better You.</span></h1>
            <p className="text-mut max-w-2xl mt-4 text-base md:text-lg">One curated LeetCode problem every day for 30 days. Solve it in your own LeetCode account, verify here, and climb a live RVCE leaderboard. Active solves earn full points; archived problems stay open for reduced points.</p>
            <div className="flex flex-wrap items-center gap-3 mt-6">
              <Button asChild><Link to={cta.to}>{cta.label} <ArrowRight className="w-4 h-4" /></Link></Button>
              <Button variant="ghost" asChild><Link to="/leaderboard">View leaderboard</Link></Button>
            </div>
            <div className="flex flex-wrap gap-4 mt-6 text-sm text-mut">
              {ev.data ? (<>
                <span className="inline-flex items-center gap-1.5"><Clock className="w-4 h-4" /> Status: <strong className="text-gray-200">{ev.data.phase}</strong></span>
                {ev.data.startDate && ev.data.phase === "UPCOMING" && <span>Starts in <Countdown start={ev.data.startDate} /></span>}
                {today.data?.today && <span>Today: <strong className="text-gray-200">Day {today.data.today.dayNumber} — {today.data.today.title}</strong></span>}
              </>) : <Skeleton className="h-5 w-64" />}
            </div>
          </motion.div>
        </div>
      </section>

      {/* STEPS */}
      <section className="max-w-6xl mx-auto px-4 py-14">
        <h2 className="font-disp text-2xl font-bold">How it works</h2>
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          {[
            { icon: Code2, t: "1 · Solve", d: "Open the daily problem on LeetCode and solve it in your own account. No passwords or cookies ever leave your hands." },
            { icon: ShieldCheck, t: "2 · Verify", d: "Submit a verification claim. The backend checks for a matching accepted submission and awards points automatically — or queues you for fair manual review." },
            { icon: Trophy, t: "3 · Climb", d: "Verified active solves earn 100 points; archived solves earn 25. Ties break on solves, streaks, then earliest finish." },
          ].map((s) => (
            <Card key={s.t} className="p-5"><s.icon className="w-6 h-6 text-cy" /><p className="font-semibold mt-3">{s.t}</p><p className="text-sm text-mut mt-1">{s.d}</p></Card>
          ))}
        </div>
      </section>

      {/* LEADERBOARD PREVIEW (genuine data) */}
      <section className="border-y border-line bg-panel/40">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <div className="flex items-center justify-between"><h2 className="font-disp text-2xl font-bold">Leaderboard preview</h2><Link to="/leaderboard" className="text-sm text-cy hover:underline">Full board →</Link></div>
          {prev.isLoading ? <Skeleton className="h-40 w-full mt-4" /> : prev.data && prev.data.data.length ? (
            <div className="mt-4 border border-line rounded-lg overflow-hidden">
              {prev.data.data.map((r, i) => (
                <div key={r.rank} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i < 3 ? "bg-gradient-to-r from-cy/10 via-blu/10 to-pur/10" : ""} border-b border-line last:border-0`}>
                  <span className="font-mono w-8 text-mut">#{r.rank}</span>
                  <span className="font-medium">{r.displayName}</span>
                  <span className="font-mono text-xs text-mut">@{r.leetcodeUsername}</span>
                  <span className="ml-auto font-mono">{r.totalPoints} pts · {r.verifiedCount} solved</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-mut mt-4">No scores yet — rankings appear once participants verify their first solves.</p>}
        </div>
      </section>

      {/* FORMAT + RULES + FAQ */}
      <section className="max-w-6xl mx-auto px-4 py-14 grid gap-10 md:grid-cols-2">
        <div>
          <h2 className="font-disp text-2xl font-bold">Format & scoring</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-gray-300">
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-cy shrink-0 mt-0.5" /> One problem published per day (Days 1–30), selected by server time in Asia/Kolkata.</li>
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-cy shrink-0 mt-0.5" /> Verified solve in the active window: <strong>100 pts</strong>. After archival: <strong>25 pts</strong>.</li>
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-cy shrink-0 mt-0.5" /> One completion per person per challenge. Retries never double-award.</li>
            <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-cy shrink-0 mt-0.5" /> Every award is written to an auditable score ledger admins can inspect.</li>
          </ul>
        </div>
        <div>
          <h2 className="font-disp text-2xl font-bold">Rules & FAQ</h2>
          <div className="mt-4 space-y-3 text-sm">
            {[["Who can join?", "Any RVCE student with an @rvce.edu.in email address. Registration opens in WAITLIST, OPEN, or CLOSED modes."],
              ["Do I share my LeetCode password?", "Never. You solve on leetcode.com in your own account; we only look for a matching accepted submission."],
              ["What if verification misses my solve?", "Claims without conclusive evidence go to manual review — an organizer confirms them with a recorded reason."],
              ["Can I solve old problems?", "Yes — archived problems stay solvable for reduced points until the event ends."],
              ["Contact?", "Reach your Accelerate coordinators on campus or reply to any event email."]].map(([q, a]) => (
              <details key={q} className="border border-line rounded-md p-3 bg-panel"><summary className="font-medium cursor-pointer">{q}</summary><p className="text-mut mt-1.5">{a}</p></details>
            ))}
          </div>
        </div>
      </section>

      {/* STATUS STRIP */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <Card className="p-5 flex flex-wrap items-center gap-3">
          <Mail className="w-5 h-5 text-cy" />
          <p className="text-sm">Registration is currently <StatusBadge status={mode} /> <span className="text-mut">Only @rvce.edu.in addresses. Email ownership is verified with a single-use expiring link.</span></p>
          <Button asChild className="ml-auto"><Link to={cta.to}>{cta.label}</Link></Button>
        </Card>
      </section>
    </div>
  );
}
