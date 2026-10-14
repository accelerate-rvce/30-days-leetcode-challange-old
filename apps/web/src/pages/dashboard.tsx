import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ExternalLink, BadgeCheck, Flame } from "lucide-react";
import { api, ApiError, type Challenge } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, Empty, Err, Skeleton, StatusBadge } from "../components/ui";

interface TodayResp { today: Challenge | null; upcoming: Challenge | null; myStatus: string | null; serverTime: string }
interface Claim { id: string; status: string; points: number; attempts: number; verifiedAt: string | null; failReason: string; challenge: Challenge | null }

export function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = useQuery({ queryKey: ["today"], queryFn: () => api.get<TodayResp>("/challenges/today") });
  const mine = useQuery({ queryKey: ["mine"], queryFn: () => api.get<{ data: Claim[] }>("/completions/mine") });
  const rank = useQuery({ queryKey: ["myrank"], queryFn: () => api.get<{ rank: { rank: number; totalPoints: number; verifiedCount: number; currentStreak: number; longestStreak: number } | null }>("/leaderboard/me") });
  const claim = useMutation({
    mutationFn: (challengeId: string) => api.post<{ completion: Claim; awarded: number; duplicate?: boolean; message?: string }>("/completions/claims", { challengeId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mine"] }); qc.invalidateQueries({ queryKey: ["myrank"] }); qc.invalidateQueries({ queryKey: ["today"] }); },
  });

  if (!user) return <div className="max-w-4xl mx-auto px-4 py-14"><Empty title="Sign in required" hint="Your dashboard lives behind authentication." /></div>;

  const solved = mine.data?.data.filter((c) => c.status === "VERIFIED") ?? [];
  const activeSolves = solved.filter((c) => c.challenge?.state === "ACTIVE").length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div><h1 className="font-disp text-3xl font-bold">Namaste, {user.displayName}</h1><p className="text-sm text-mut font-mono">@{user.leetcodeUsername} · {user.email}</p></div>
        <div className="ml-auto flex gap-2 text-sm">
          <Card className="px-4 py-2 text-center"><p className="font-mono text-xl font-bold">{rank.data?.rank?.totalPoints ?? 0}</p><p className="text-xs text-mut">points · rank #{rank.data?.rank?.rank ?? "—"}</p></Card>
          <Card className="px-4 py-2 text-center"><p className="font-mono text-xl font-bold">{solved.length}/30</p><p className="text-xs text-mut">solved</p></Card>
          <Card className="px-4 py-2 text-center"><p className="font-mono text-xl font-bold inline-flex items-center gap-1"><Flame className="w-4 h-4 text-cy" />{rank.data?.rank?.currentStreak ?? 0}</p><p className="text-xs text-mut">streak (best {rank.data?.rank?.longestStreak ?? 0})</p></Card>
        </div>
      </div>

      {/* TODAY */}
      <section>
        <h2 className="font-disp text-xl font-bold mb-3">Today's challenge</h2>
        {today.isLoading ? <Skeleton className="h-40" /> : today.isError ? <Err message="Could not load today's challenge." retry={() => today.refetch()} /> : !today.data!.today ? (
          <Empty title="No active challenge right now" hint="The next problem appears here at its scheduled publication time." />
        ) : (
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-mut">DAY {today.data!.today.dayNumber}</span>
              <StatusBadge status={today.data!.today.state} />
              <StatusBadge status={today.data!.myStatus ?? "Not Started"} />
              <span className="ml-auto font-mono text-sm">{today.data!.today.activePoints} pts active · {today.data!.today.archivedPoints} archived</span>
            </div>
            <h3 className="font-disp text-2xl font-bold mt-2">{today.data!.today.title}</h3>
            <p className="text-sm text-mut mt-1">{today.data!.today.difficulty} · {(today.data!.today.topics ?? []).join(", ") || "General"}</p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button asChild><a href={today.data!.today.leetcodeUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /> Open on LeetCode</a></Button>
              <Button variant="ghost" disabled={claim.isPending} onClick={() => claim.mutate(today.data!.today!.id)}>
                <BadgeCheck className="w-4 h-4" /> {claim.isPending ? "Verifying…" : "Verify completion"}
              </Button>
            </div>
            {claim.isError && <p className="text-sm text-red-300 mt-2">{(claim.error as ApiError).message}</p>}
            {claim.isSuccess && <p className="text-sm text-emerald-300 mt-2">{claim.data.duplicate ? "Already verified — no additional points." : claim.data.awarded > 0 ? `Verified! +${claim.data.awarded} points.` : (claim.data.message ?? "Queued for manual review — an organizer will confirm it.")}</p>}
            <p className="text-xs text-mut mt-3">Solve on LeetCode first, then verify. Verification checks your linked handle (<span className="font-mono">@{user.leetcodeUsername}</span>) for a matching accepted submission. <Link to="/profile" className="underline">Wrong handle? Update profile</Link>.</p>
          </Card>
        )}
      </section>

      {/* STATS + HISTORY */}
      <section className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="font-disp text-xl font-bold mb-3">Progress</h2>
          <Card className="p-5 text-sm space-y-1.5">
            <p>Active-day solves: <strong>{activeSolves}</strong> · Archived solves: <strong>{solved.length - activeSolves}</strong></p>
            <p>Remaining: <strong>{30 - solved.length}</strong></p>
            <p className="text-mut">Points come only from verified solves — unverified or duplicate claims earn 0.</p>
            <Link to="/challenges" className="text-cy underline">Browse all challenges →</Link>
          </Card>
          <h2 className="font-disp text-xl font-bold mt-6 mb-3">Recent activity</h2>
          {mine.isLoading ? <Skeleton className="h-24" /> : !mine.data?.data.length ? <Empty title="No claims yet" hint="Your verification attempts will appear here." /> : (
            <div className="space-y-2">{mine.data.data.slice(0, 5).map((c) => (
              <Card key={c.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <StatusBadge status={c.status} />
                <span>Day {c.challenge?.dayNumber} — {c.challenge?.title}</span>
                <span className="ml-auto font-mono">+{c.points}</span>
              </Card>))}</div>
          )}
        </div>
        <div>
          <h2 className="font-disp text-xl font-bold mb-3">Full history</h2>
          {mine.isLoading ? <Skeleton className="h-40" /> : !mine.data?.data.length ? <Empty title="Nothing here yet" /> : (
            <div className="border border-line rounded-lg overflow-hidden">{mine.data.data.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm border-b border-line last:border-0">
                <span className="font-mono text-mut w-14">D{c.challenge?.dayNumber ?? "—"}</span>
                <span className="truncate">{c.challenge?.title ?? "Unknown"}</span>
                <span className="ml-auto flex items-center gap-2"><StatusBadge status={c.status} /><span className="font-mono">+{c.points}</span></span>
              </div>))}</div>
          )}
          {mine.data?.data.some((c) => c.failReason) && (
            <p className="text-xs text-mut mt-2">Pending claims show the verifier's reason — e.g. "{mine.data.data.find((c) => c.failReason)?.failReason}". Retry after solving, or wait for manual review.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export function Profile() {
  const { user, refresh } = useAuth();
  const m = useMutation({
    mutationFn: (v: { name?: string; leetcodeUsername?: string }) => api.put("/profile", v),
    onSuccess: () => refresh(),
  });
  if (!user) return null;
  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="font-disp text-2xl font-bold">Profile settings</h1>
      <Card className="p-5 mt-4 space-y-3">
        <p className="text-sm text-mut">Email: <span className="font-mono text-gray-200">{user.email}</span> (contact organizers to change)</p>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); m.mutate({ name: String(f.get("name")), leetcodeUsername: String(f.get("lc")) }); }}>
          <label className="block text-sm">Display name<input name="name" defaultValue={user.displayName} className="mt-1 w-full bg-ink border border-line rounded-md px-3 py-2 text-sm" /></label>
          <label className="block text-sm">LeetCode username<input name="lc" defaultValue={user.leetcodeUsername} className="mt-1 w-full bg-ink border border-line rounded-md px-3 py-2 text-sm font-mono" /></label>
          {m.isError && <p className="text-sm text-red-300">{(m.error as ApiError).message}</p>}
          {m.isSuccess && <p className="text-sm text-emerald-300">Saved.</p>}
          <Button>Save</Button>
        </form>
      </Card>
    </div>
  );
}
