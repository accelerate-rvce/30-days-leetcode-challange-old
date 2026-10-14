import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Search } from "lucide-react";
import { api, type Challenge } from "../lib/api";
import { Button, Card, Empty, Err, Skeleton, StatusBadge, inputCls } from "../components/ui";

export function Challenges() {
  const q = useQuery({ queryKey: ["challenges"], queryFn: () => api.get<{ data: Challenge[] }>("/challenges") });
  const rows = q.data?.data ?? [];
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="font-disp text-3xl font-bold">Challenges</h1>
      <p className="text-sm text-mut mt-1">Active problems earn full points; archived problems stay open for reduced points.</p>
      {q.isLoading ? <div className="grid md:grid-cols-3 gap-4 mt-6"><Skeleton className="h-36" /><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
        : q.isError ? <div className="mt-6"><Err message="Could not load challenges." retry={() => q.refetch()} /></div>
        : !rows.length ? <div className="mt-6"><Empty title="No challenges published yet" hint="Check back at the scheduled publication time." /></div>
        : <div className="grid md:grid-cols-3 gap-4 mt-6">{rows.map((c) => (
          <Card key={c.id} className="p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2"><span className="font-mono text-xs text-mut">DAY {c.dayNumber}</span><StatusBadge status={c.state} /></div>
            <Link to={`/challenges/${c.dayNumber}`} className="font-disp font-bold hover:text-cy">{c.title}</Link>
            <p className="text-xs text-mut">{c.difficulty} · {(c.topics ?? []).join(", ") || "General"}</p>
            <p className="text-xs font-mono">{c.activePoints} / {c.archivedPoints} pts</p>
          </Card>))}</div>}
    </div>
  );
}

export function ChallengeDetail() {
  const { n } = useParams();
  const q = useQuery({ queryKey: ["challenge", n], queryFn: () => api.get<{ challenge: Challenge; mine: { status: string; points: number } | null }>(`/challenges/day/${n}`) });
  const d = q.data;
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {q.isLoading ? <Skeleton className="h-56" /> : q.isError || !d ? <Err message="Challenge not found or not yet published." /> : (
        <Card className="p-6">
          <div className="flex items-center gap-2"><span className="font-mono text-xs text-mut">DAY {d.challenge.dayNumber}</span><StatusBadge status={d.challenge.state} />{d.mine && <StatusBadge status={d.mine.status} />}</div>
          <h1 className="font-disp text-3xl font-bold mt-2">{d.challenge.title}</h1>
          <p className="text-sm text-mut mt-1">{d.challenge.difficulty} · {(d.challenge.topics ?? []).join(", ")} · {d.challenge.activePoints} pts active / {d.challenge.archivedPoints} archived</p>
          <div className="flex gap-2 mt-5">
            <Button asChild><a href={d.challenge.leetcodeUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /> Open on LeetCode</a></Button>
            <Button variant="ghost" asChild><Link to="/dashboard">Verify from dashboard</Link></Button>
          </div>
        </Card>
      )}
    </div>
  );
}

interface Row { rank: number; displayName: string; leetcodeUsername: string; totalPoints: number; verifiedCount: number; currentStreak: number }

export function Leaderboard() {
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState("");
  const [deb, setDeb] = useState("");
  const q = useQuery({ queryKey: ["lb", page, deb], queryFn: () => api.get<{ data: Row[]; page: number; totalPages: number; total: number }>(`/leaderboard?page=${page}&pageSize=20&q=${encodeURIComponent(deb)}`) });
  const lb = q.data;
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="font-disp text-3xl font-bold">Leaderboard</h1>
      <p className="text-sm text-mut mt-1">Server-calculated from verified solves. Ties: points → solves → streak → earliest finish → name.</p>
      <div className="relative mt-4">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-mut" />
        <input className={`${inputCls} pl-9`} placeholder="Search name or LeetCode handle…" value={term} onChange={(e) => { setTerm(e.target.value); setPage(1); clearTimeout((window as unknown as { _t: number })._t); (window as unknown as { _t: number })._t = window.setTimeout(() => setDeb(e.target.value), 300); }} />
      </div>
      {q.isLoading ? <Skeleton className="h-64 mt-4" /> : q.isError ? <div className="mt-4"><Err message="Could not load leaderboard." retry={() => q.refetch()} /></div> : !(lb?.data?.length) ? <div className="mt-4"><Empty title="No rankings yet" hint="Rankings appear after the first verified solves." /></div> : (<>
        <div className="border border-line rounded-lg overflow-hidden mt-4">
          <div className="hidden sm:grid grid-cols-[3rem_1fr_5rem_5rem] gap-2 px-4 py-2 text-xs font-mono text-mut border-b border-line"><span>RANK</span><span>PARTICIPANT</span><span className="text-right">POINTS</span><span className="text-right">SOLVED</span></div>
          {(lb?.data ?? []).map((r, i) => (
            <Link key={r.rank} to={`/u/${r.leetcodeUsername}`} className={`grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[3rem_1fr_5rem_5rem] items-center gap-2 px-4 py-2.5 text-sm border-b border-line last:border-0 hover:bg-white/5 ${i < 3 && page === 1 && !deb ? "bg-gradient-to-r from-cy/10 via-blu/10 to-pur/10" : ""}`}>
              <span className="font-mono text-mut">#{r.rank}</span>
              <span><span className="font-medium">{r.displayName}</span> <span className="font-mono text-xs text-mut">@{r.leetcodeUsername}</span></span>
              <span className="font-mono text-right">{r.totalPoints}</span>
              <span className="font-mono text-right hidden sm:block">{r.verifiedCount}</span>
            </Link>))}
        </div>
        <div className="flex items-center gap-3 mt-4 text-sm">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</Button>
          <span className="font-mono text-mut">Page {lb?.page} of {lb?.totalPages} · {lb?.total} participants</span>
          <Button variant="ghost" disabled={lb ? page >= lb.totalPages : true} onClick={() => setPage(page + 1)}>Next →</Button>
        </div>
      </>)}
    </div>
  );
}

export function PublicProfile() {
  const { username } = useParams();
  const q = useQuery({ queryKey: ["pub", username], queryFn: () => api.get<{ profile: { displayName: string; leetcodeUsername: string }; rank: Row | null; history: { dayNumber: number; title: string; points: number }[] }>(`/leaderboard/users/${username}`) });
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {q.isLoading ? <Skeleton className="h-40" /> : q.isError || !q.data ? <Err message="Participant not found." /> : (
        <>
          <h1 className="font-disp text-3xl font-bold">{q.data!.profile.displayName}</h1>
          <p className="font-mono text-sm text-mut">@{q.data!.profile.leetcodeUsername} {q.data!.rank && `· rank #${q.data!.rank.rank} · ${q.data!.rank.totalPoints} pts`}</p>
          <h2 className="font-disp text-xl font-bold mt-6 mb-2">Verified solves</h2>
          {!q.data!.history.length ? <Empty title="No verified solves yet" /> : (
            <div className="border border-line rounded-lg overflow-hidden">{q.data!.history.map((h) => (
              <div key={h.dayNumber} className="flex gap-3 px-4 py-2 text-sm border-b border-line last:border-0"><span className="font-mono text-mut">D{h.dayNumber}</span><span>{h.title}</span><span className="ml-auto font-mono">+{h.points}</span></div>))}</div>)}
        </>
      )}
    </div>
  );
}
