import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, Empty, Err, Skeleton, StatusBadge, inputCls } from "../components/ui";

function useAdmin<T>(path: string, extra: unknown[] = []) {
  return useQuery({ queryKey: ["admin", path, ...extra], queryFn: () => api.get<T>(`/admin/${path}`) });
}

export function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPERADMIN")) return <div className="max-w-4xl mx-auto px-4 py-14"><Empty title="Admins only" hint="This area requires an administrator account." /></div>;
  const tabs = ["overview", "users", "waitlist", "challenges", "verifications", "scoring", "settings"];
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="font-disp text-3xl font-bold">Admin panel</h1>
      <div className="flex flex-wrap gap-2 mt-4">{tabs.map((t) => (
        <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-sm rounded-md border ${tab === t ? "border-cy/60 bg-cy/10 text-white" : "border-line text-mut"}`}>{t}</button>))}</div>
      <div className="mt-6">
        {tab === "overview" && <Overview />}
        {tab === "users" && <Users />}
        {tab === "waitlist" && <WaitlistAdmin />}
        {tab === "challenges" && <ChallengesAdmin />}
        {tab === "verifications" && <Verifications />}
        {tab === "scoring" && <Scoring />}
        {tab === "settings" && <Settings />}
      </div>
    </div>
  );
}

function Overview() {
  const q = useAdmin<{ totals: Record<string, number>; trend: { day: string; count: number }[]; top: { rank: number; displayName: string; totalPoints: number }[]; recentAudit: { action: string; detail: string; createdAt: string }[]; health: unknown }>("overview");
  if (q.isLoading) return <Skeleton className="h-48" />;
  if (q.isError) return <Err message="Could not load overview." retry={() => q.refetch()} />;
  const t = q.data!.totals;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(t).map(([k, v]) => <Card key={k} className="p-4"><p className="font-mono text-2xl font-bold">{v}</p><p className="text-xs text-mut">{k}</p></Card>)}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4"><p className="font-semibold text-sm mb-2">Participation trend (verified/day)</p>
          {!q.data!.trend.length ? <p className="text-sm text-mut">No data yet.</p> : q.data!.trend.map((d) => <div key={d.day} className="flex items-center gap-2 text-sm"><span className="font-mono text-xs w-24">{d.day}</span><div className="h-2 bg-gradient-to-r from-cy to-pur rounded" style={{ width: Math.min(200, d.count * 20) }} /><span className="font-mono">{d.count}</span></div>)}
        </Card>
        <Card className="p-4"><p className="font-semibold text-sm mb-2">Recent admin activity</p>
          {q.data!.recentAudit.map((a, i) => <p key={i} className="text-xs font-mono text-mut">{a.createdAt.slice(0, 19).replace("T", " ")} · {a.action} · {a.detail}</p>)}
        </Card>
      </div>
    </div>
  );
}

function Users() {
  const [term, setTerm] = useState("");
  const q = useAdmin<{ data: { id: string; email: string; displayName: string; leetcodeUsername: string; role: string; status: string }[] }>(`users?q=${encodeURIComponent(term)}`, [term]);
  const qc = useQueryClient();
  const act = useMutation({
    mutationFn: ({ id, op }: { id: string; op: string }) => api.post(`/admin/users/${id}/${op}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
  });
  return (
    <div>
      <div className="flex gap-2 items-center">
        <input className={inputCls} placeholder="Search users…" value={term} onChange={(e) => setTerm(e.target.value)} />
        <a className="text-sm text-cy underline whitespace-nowrap" href={`${(import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:4000/api/v1"}/admin/users/export.csv`}>Export CSV</a>
      </div>
      {q.isLoading ? <Skeleton className="h-40 mt-3" /> : (
        <div className="border border-line rounded-lg overflow-hidden mt-3">{q.data!.data.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm border-b border-line last:border-0">
            <span className="font-medium">{u.displayName}</span><span className="font-mono text-xs text-mut">{u.email} · @{u.leetcodeUsername}</span>
            <StatusBadge status={u.status} /><span className="text-xs font-mono text-mut">{u.role}</span>
            <span className="ml-auto flex gap-1.5">
              <button className="text-xs underline" onClick={() => act.mutate({ id: u.id, op: "suspend" })}>Suspend</button>
              <button className="text-xs underline" onClick={() => act.mutate({ id: u.id, op: "reactivate" })}>Reactivate</button>
              <button className="text-xs underline" onClick={() => act.mutate({ id: u.id, op: "revoke-sessions" })}>Revoke sessions</button>
              <button className="text-xs underline" onClick={() => act.mutate({ id: u.id, op: "password-reset" })}>Password reset</button>
            </span>
          </div>))}</div>)}
      {act.isError && <p className="text-sm text-red-300 mt-2">{(act.error as ApiError).message}</p>}
    </div>
  );
}

function WaitlistAdmin() {
  const q = useAdmin<{ data: { id: string; email: string; name: string; leetcodeUsername: string; status: string }[] }>("waitlist");
  const qc = useQueryClient();
  const [emails, setEmails] = useState("");
  const m = useMutation({
    mutationFn: (op: { id?: string; kind: string }) => op.kind === "invite"
      ? api.post("/admin/waitlist/invite", { emails: emails.split(/[\s,]+/).filter(Boolean) })
      : api.post(`/admin/waitlist/${op.id}/${op.kind}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); setEmails(""); },
  });
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="font-semibold text-sm">Bulk invite (RVCE emails, comma/newline separated — no duplicates)</p>
        <textarea className={`${inputCls} mt-2 h-20`} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="a@rvce.edu.in, b@rvce.edu.in" />
        <Button className="mt-2" onClick={() => m.mutate({ kind: "invite" })}>Send invitations</Button>
        {m.isSuccess && <p className="text-sm text-emerald-300 mt-2">Invited {(m.data as { invited: number }).invited}, skipped {(m.data as { skipped: number }).skipped}.{(m.data as { emailFailures: string[] }).emailFailures?.length ? ` Email issues: ${(m.data as { emailFailures: string[] }).emailFailures.join("; ")}` : ""}</p>}
      </Card>
      {q.isLoading ? <Skeleton className="h-40" /> : (
        <div className="border border-line rounded-lg overflow-hidden">{q.data!.data.map((w) => (
          <div key={w.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm border-b border-line last:border-0">
            <span className="font-medium">{w.name}</span><span className="font-mono text-xs text-mut">{w.email} · @{w.leetcodeUsername}</span>
            <StatusBadge status={w.status} />
            <span className="ml-auto flex gap-2">
              <button className="text-xs underline" onClick={() => m.mutate({ id: w.id, kind: "approve" })}>Approve</button>
              <button className="text-xs underline" onClick={() => m.mutate({ id: w.id, kind: "reject" })}>Reject</button>
            </span>
          </div>))}</div>)}
    </div>
  );
}

function ChallengesAdmin() {
  const q = useAdmin<{ data: { id: string; dayNumber: number; title: string; slug: string; state: string; difficulty: string }[] }>("challenges");
  const qc = useQueryClient();
  const [form, setForm] = useState({ dayNumber: 1, title: "", leetcodeUrl: "", difficulty: "Easy", publishAt: "" });
  const [msg, setMsg] = useState("");
  const create = async () => {
    setMsg("");
    try {
      await api.post("/admin/challenges", { ...form, dayNumber: Number(form.dayNumber), topics: [], publishAt: form.publishAt || undefined });
      setForm({ dayNumber: form.dayNumber + 1, title: "", leetcodeUrl: "", difficulty: "Easy", publishAt: "" });
      qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) { setMsg((e as ApiError).message); }
  };
  const op = async (id: string, kind: string) => { setMsg(""); try { await api.post(`/admin/challenges/${id}/${kind}`); qc.invalidateQueries({ queryKey: ["admin"] }); } catch (e) { setMsg((e as ApiError).message); } };
  return (
    <div className="space-y-4">
      <Card className="p-4 grid sm:grid-cols-2 gap-2">
        <input className={inputCls} type="number" min={1} max={30} value={form.dayNumber} onChange={(e) => setForm({ ...form, dayNumber: Number(e.target.value) })} placeholder="Day" />
        <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" />
        <input className={inputCls} value={form.leetcodeUrl} onChange={(e) => setForm({ ...form, leetcodeUrl: e.target.value })} placeholder="https://leetcode.com/problems/…/" />
        <div className="flex gap-2">
          <select className={inputCls} value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}><option>Easy</option><option>Medium</option><option>Hard</option></select>
          <input className={inputCls} type="datetime-local" value={form.publishAt} onChange={(e) => setForm({ ...form, publishAt: e.target.value })} />
        </div>
        <div><Button onClick={create}>Create draft</Button></div>
        {msg && <p className="text-sm text-red-300 sm:col-span-2">{msg}</p>}
      </Card>
      <div className="grid sm:grid-cols-6 gap-1.5">
        {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => {
          const c = q.data?.data.find((x) => x.dayNumber === d);
          return <div key={d} title={c ? `${c.title} (${c.state})` : "Unscheduled"} className={`text-center text-xs font-mono border rounded px-1 py-1.5 ${c ? "border-cy/40 bg-cy/10" : "border-line text-mut"}`}>D{d}</div>;
        })}
      </div>
      {q.isLoading ? <Skeleton className="h-40" /> : (
        <div className="border border-line rounded-lg overflow-hidden">{q.data!.data.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm border-b border-line last:border-0">
            <span className="font-mono text-mut">D{c.dayNumber}</span><span className="font-medium">{c.title}</span>
            <span className="font-mono text-xs text-mut">{c.slug} · {c.difficulty}</span><StatusBadge status={c.state} />
            <span className="ml-auto flex gap-2 text-xs">
              <button className="underline" onClick={() => op(c.id, "publish")}>Publish</button>
              <button className="underline" onClick={() => op(c.id, "archive")}>Archive</button>
            </span>
          </div>))}</div>)}
    </div>
  );
}

function Verifications() {
  const [status, setStatus] = useState("");
  const q = useAdmin<{ data: { id: string; status: string; failReason: string; evidence: string; user: { displayName: string; leetcodeUsername: string } | null; challenge: { dayNumber: number; title: string } | null }[] }>(`verifications${status ? `?status=${status}` : ""}`, [status]);
  const qc = useQueryClient();
  const [reason, setReason] = useState("Confirmed via organizer review");
  const review = async (id: string, decision: string) => {
    await api.post(`/admin/verifications/${id}/review`, { decision, reason });
    qc.invalidateQueries({ queryKey: ["admin"] });
  };
  return (
    <div>
      <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Pending + review</option><option value="NOT_VERIFIED">Not verified</option><option value="VERIFIED">Verified</option></select>
      {q.isLoading ? <Skeleton className="h-40 mt-3" /> : !q.data!.data.length ? <div className="mt-3"><Empty title="Queue is clear" /></div> : (
        <div className="space-y-2 mt-3">{q.data!.data.map((c) => (
          <Card key={c.id} className="p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge status={c.status} /><span>Day {c.challenge?.dayNumber} — {c.challenge?.title}</span><span className="font-mono text-xs text-mut">@{c.user?.leetcodeUsername}</span></div>
            {c.failReason && <p className="text-xs text-mut mt-1">Verifier: {c.failReason}</p>}
            {c.evidence && <p className="text-xs font-mono text-mut mt-1 truncate">Evidence: {c.evidence}</p>}
            <div className="flex gap-2 mt-2">
              <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button variant="ghost" onClick={() => review(c.id, "VERIFIED")}>Approve</Button>
              <Button variant="danger" onClick={() => review(c.id, "NOT_VERIFIED")}>Reject</Button>
            </div>
          </Card>))}</div>)}
    </div>
  );
}

function Scoring() {
  const ledger = useAdmin<{ data: { id: string; userId: string; delta: number; reason: string; createdAt: string }[] }>("ledger");
  const auditQ = useAdmin<{ data: { action: string; entity: string; detail: string; createdAt: string }[] }>("audit");
  const qc = useQueryClient();
  const [adj, setAdj] = useState({ userId: "", delta: 0, reason: "" });
  const [msg, setMsg] = useState("");
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card className="p-4">
        <p className="font-semibold text-sm">Manual adjustment (requires reason, audit-logged)</p>
        <div className="space-y-2 mt-2">
          <input className={inputCls} placeholder="userId" value={adj.userId} onChange={(e) => setAdj({ ...adj, userId: e.target.value })} />
          <input className={inputCls} type="number" placeholder="delta (+/-)" value={adj.delta} onChange={(e) => setAdj({ ...adj, delta: Number(e.target.value) })} />
          <input className={inputCls} placeholder="Reason (required)" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
          <Button onClick={async () => { try { await api.post("/admin/adjust", adj); setMsg("Applied."); qc.invalidateQueries({ queryKey: ["admin"] }); } catch (e) { setMsg((e as ApiError).message); } }}>Apply</Button>
          {msg && <p className="text-sm text-mut">{msg}</p>}
        </div>
        <p className="font-semibold text-sm mt-4 mb-1">Score ledger (latest)</p>
        {ledger.data?.data.slice(0, 20).map((l) => <p key={l.id} className="text-xs font-mono text-mut">{l.createdAt.slice(0, 19).replace("T", " ")} · {l.delta > 0 ? "+" : ""}{l.delta} · {l.reason}</p>)}
      </Card>
      <Card className="p-4"><p className="font-semibold text-sm mb-1">Audit history</p>
        {auditQ.data?.data.slice(0, 30).map((a, i) => <p key={i} className="text-xs font-mono text-mut">{a.createdAt.slice(0, 19).replace("T", " ")} · {a.action} · {a.entity} · {a.detail}</p>)}
      </Card>
    </div>
  );
}

function Settings() {
  const q = useAdmin<{ settings: { eventName: string; description: string; timezone: string; registrationMode: string; activePoints: number; archivedPoints: number; startDate: string | null; endDate: string | null } }>("settings");
  const qc = useQueryClient();
  const [msg, setMsg] = useState("");
  if (q.isLoading) return <Skeleton className="h-40" />;
  if (q.isError) return <Err message="Could not load settings." />;
  const s = q.data!.settings;
  const save = async (patch: object) => { try { await api.put("/admin/settings", patch); setMsg("Saved."); qc.invalidateQueries({ queryKey: ["admin"] }); } catch (e) { setMsg((e as ApiError).message); } };
  return (
    <Card className="p-4 space-y-3 max-w-xl">
      <label className="block text-sm">Event name<input className={`${inputCls} mt-1`} defaultValue={s.eventName} id="ev-name" /></label>
      <label className="block text-sm">Registration mode
        <select className={`${inputCls} mt-1`} defaultValue={s.registrationMode} id="ev-mode"><option>WAITLIST</option><option>OPEN</option><option>CLOSED</option></select></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">Active pts<input className={`${inputCls} mt-1`} type="number" defaultValue={s.activePoints} id="ev-ap" /></label>
        <label className="block text-sm">Archived pts<input className={`${inputCls} mt-1`} type="number" defaultValue={s.archivedPoints} id="ev-rp" /></label>
      </div>
      <Button onClick={() => save({
        eventName: (document.getElementById("ev-name") as HTMLInputElement).value,
        registrationMode: (document.getElementById("ev-mode") as HTMLSelectElement).value,
        activePoints: Number((document.getElementById("ev-ap") as HTMLInputElement).value),
        archivedPoints: Number((document.getElementById("ev-rp") as HTMLInputElement).value),
      })}>Save settings</Button>
      {msg && <p className="text-sm text-mut">{msg}</p>}
      <p className="text-xs text-mut">Timezone: {s.timezone} · Email + verification provider status: <a className="underline" href={`${(import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:4000/api/v1"}/verification`} target="_blank" rel="noreferrer">view status JSON</a></p>
    </Card>
  );
}
