import { Router } from "express";
import { z } from "zod";
import { leetcodeSlugFromUrl, canonicalLeetcodeUrl, normalizeEmail, isRvceEmail } from "@accelerate/shared";
import { newToken, hashToken, hashPassword } from "../lib/crypto.js";
import { sendEmail } from "../lib/email.js";
import { auth, requireAdmin, requireRole, rateLimit, validate, audit } from "../middleware.js";
import { config } from "../config.js";
import { nowIso, uid } from "../store.js";
import { awardVerification, buildLeaderboard, manualAdjust } from "../lib/scoring.js";

export const adminRouter = Router();
adminRouter.use(auth, requireAdmin);

// ---------- Overview ----------
adminRouter.get("/overview", (_req, res) => {
  const store = _req.store!;
  const users = [...store.users.values()];
  const wait = [...store.waitlist.values()];
  const completions = [...store.completions.values()];
  const board = buildLeaderboard(store).slice(0, 10);
  const pending = completions.filter((c) => c.status === "PENDING" || c.status === "MANUAL_REVIEW").length;
  const verified = completions.filter((c) => c.status === "VERIFIED").length;
  // participation trend: verified per day (last 14 entries by verifiedAt date)
  const byDay = new Map<string, number>();
  for (const c of completions) if (c.status === "VERIFIED" && c.verifiedAt) byDay.set(c.verifiedAt.slice(0, 10), (byDay.get(c.verifiedAt.slice(0, 10)) ?? 0) + 1);
  res.json({
    totals: {
      registrations: wait.length,
      emailVerified: wait.filter((w) => w.status === "EMAIL_VERIFIED" || w.status === "APPROVED").length,
      approved: wait.filter((w) => w.status === "APPROVED").length,
      activeUsers: users.filter((u) => u.status === "ACTIVE").length,
      verifiedCompletions: verified, pendingClaims: pending,
      challenges: store.challenges.size,
    },
    trend: [...byDay.entries()].sort().slice(-14).map(([day, count]) => ({ day, count })),
    top: board,
    recentAudit: store.audit.slice(-15).reverse(),
    health: { store: "ok", scheduler: "external-cron", lastJobs: store.jobs.slice(-5).reverse() },
  });
});

// ---------- User management ----------
adminRouter.get("/users", (req, res) => {
  const store = req.store!;
  const q = String(req.query.q ?? "").toLowerCase();
  const role = String(req.query.role ?? "");
  const status = String(req.query.status ?? "");
  let users = [...store.users.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (q) users = users.filter((u) => u.email.includes(q) || u.displayName.toLowerCase().includes(q) || u.leetcodeUsername.toLowerCase().includes(q));
  if (role) users = users.filter((u) => u.role === role);
  if (status) users = users.filter((u) => u.status === status);
  const page = Number(req.query.page ?? 1), pageSize = Math.min(Number(req.query.pageSize ?? 20), 100);
  const total = users.length;
  const data = users.slice((page - 1) * pageSize, page * pageSize).map((u) => ({
    id: u.id, email: u.email, name: u.name, displayName: u.displayName, leetcodeUsername: u.leetcodeUsername,
    role: u.role, status: u.status, emailVerifiedAt: u.emailVerifiedAt, createdAt: u.createdAt,
  }));
  res.json({ data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

adminRouter.post("/users/:id/suspend", (req, res) => {
  const store = req.store!;
  const u = store.users.get(req.params.id);
  if (!u) { res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } }); return; }
  if (u.role === "SUPERADMIN" && req.user!.role !== "SUPERADMIN") { res.status(403).json({ error: { code: "FORBIDDEN", message: "Only superadmins can suspend a superadmin" } }); return; }
  u.status = "SUSPENDED"; u.updatedAt = nowIso();
  for (const s of store.sessions.values()) if (s.userId === u.id && !s.revokedAt) { s.revokedAt = nowIso(); store.sessionsByHash.delete(s.tokenHash); }
  audit(store, req.user!.id, "admin.suspend", "user", u.id, u.email);
  res.json({ ok: true });
});

adminRouter.post("/users/:id/reactivate", (req, res) => {
  const store = req.store!;
  const u = store.users.get(req.params.id);
  if (!u) { res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } }); return; }
  u.status = u.emailVerifiedAt ? "ACTIVE" : "PENDING_VERIFICATION"; u.updatedAt = nowIso();
  audit(store, req.user!.id, "admin.reactivate", "user", u.id, u.email);
  res.json({ ok: true });
});

adminRouter.post("/users/:id/role", validate(z.object({ role: z.enum(["PARTICIPANT", "ADMIN"]) })), (req, res) => {
  const store = req.store!;
  const u = store.users.get(req.params.id);
  if (!u) { res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } }); return; }
  if (u.id === req.user!.id) { res.status(400).json({ error: { code: "INVALID", message: "You cannot change your own role" } }); return; }
  u.role = req.body.role; u.updatedAt = nowIso();
  audit(store, req.user!.id, "admin.role", "user", u.id, req.body.role);
  res.json({ ok: true, role: u.role });
});

adminRouter.post("/users/:id/password-reset", rateLimit(10, 60_000), async (req, res) => {
  const store = req.store!;
  const u = store.users.get(req.params.id);
  if (!u) { res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } }); return; }
  const raw = newToken();
  store.emailTokens.set(hashToken(raw), { id: uid(), purpose: "password-reset", emailNorm: u.emailNorm, userId: u.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(), usedAt: null, createdAt: nowIso() });
  const r = await sendEmail(u.email, "Reset your Accelerate password", `An administrator triggered a password reset. Use this link within 1 hour:\n${config.webOrigin}/#/reset-password?token=${raw}`);
  audit(store, req.user!.id, "admin.password-reset", "user", u.id, r.sent ? "email sent" : `email failed: ${r.error}`);
  res.json({ ok: true, emailSent: r.sent, emailError: r.sent ? undefined : r.error });
});

adminRouter.post("/users/:id/revoke-sessions", (req, res) => {
  const store = req.store!;
  let n = 0;
  for (const s of store.sessions.values()) if (s.userId === req.params.id && !s.revokedAt) { s.revokedAt = nowIso(); store.sessionsByHash.delete(s.tokenHash); n++; }
  audit(store, req.user!.id, "admin.revoke-sessions", "user", req.params.id, `${n} revoked`);
  res.json({ ok: true, revoked: n });
});

adminRouter.get("/users/export.csv", (req, res) => {
  const store = req.store!;
  const rows = [...store.users.values()].filter((u) => u.role === "PARTICIPANT");
  const csv = ["name,email,leetcodeUsername,status,createdAt", ...rows.map((u) => `${JSON.stringify(u.displayName)},${u.email},${u.leetcodeUsername},${u.status},${u.createdAt}`)].join("\n");
  audit(store, req.user!.id, "admin.export-users", "user", "", `${rows.length} rows`);
  res.header("content-type", "text/csv").header("content-disposition", "attachment; filename=participants.csv").send(csv);
});

// ---------- Waitlist approvals & invitations ----------
adminRouter.get("/waitlist", (req, res) => {
  const store = req.store!;
  const status = String(req.query.status ?? "");
  let rows = [...store.waitlist.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (status) rows = rows.filter((w) => w.status === status);
  res.json({ data: rows, total: rows.length });
});

adminRouter.post("/waitlist/:id/approve", (req, res) => {
  const store = req.store!;
  const w = store.waitlist.get(req.params.id);
  if (!w) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Entry not found" } }); return; }
  w.status = "APPROVED"; w.decidedAt = nowIso(); w.decidedBy = req.user!.id; w.updatedAt = nowIso();
  audit(store, req.user!.id, "waitlist.approve", "waitlist", w.id, w.emailNorm);
  res.json({ ok: true });
});

adminRouter.post("/waitlist/:id/reject", validate(z.object({ reason: z.string().max(500).optional().default("") })), (req, res) => {
  const store = req.store!;
  const w = store.waitlist.get(req.params.id);
  if (!w) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Entry not found" } }); return; }
  w.status = "REJECTED"; w.decidedAt = nowIso(); w.decidedBy = req.user!.id; w.updatedAt = nowIso();
  audit(store, req.user!.id, "waitlist.reject", "waitlist", w.id, `${w.emailNorm} ${req.body.reason ?? ""}`);
  res.json({ ok: true });
});

adminRouter.post("/waitlist/invite", validate(z.object({ emails: z.array(z.string()).min(1).max(500) })), async (req, res) => {
  const store = req.store!;
  let invited = 0, skipped = 0;
  const failures: string[] = [];
  for (const raw of req.body.emails as string[]) {
    const emailNorm = normalizeEmail(raw);
    if (!isRvceEmail(emailNorm) || store.usersByNorm.has(emailNorm)) { skipped++; continue; }
    let w = store.waitlistByNorm.has(emailNorm) ? store.waitlist.get(store.waitlistByNorm.get(emailNorm)!)! : null;
    if (w?.status === "APPROVED") { skipped++; continue; } // no duplicates
    if (!w) {
      w = { id: uid(), email: emailNorm, emailNorm, name: emailNorm.split("@")[0], leetcodeUsername: "", consent: true, status: "INVITED", invitedAt: nowIso(), decidedAt: null, decidedBy: null, createdAt: nowIso(), updatedAt: nowIso() };
      store.waitlist.set(w.id, w); store.waitlistByNorm.set(emailNorm, w.id);
    } else { w.status = "INVITED"; w.invitedAt = nowIso(); w.updatedAt = nowIso(); }
    const token = newToken();
    store.emailTokens.set(hashToken(token), { id: uid(), purpose: "waitlist-verify", emailNorm, userId: null, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(), usedAt: null, createdAt: nowIso() });
    const r = await sendEmail(emailNorm, "You're invited: Accelerate 30 Days of LeetCode", `You've been approved to register:\n${config.webOrigin}/#/register?email=${encodeURIComponent(emailNorm)}\n\n— Accelerate, RVCE`);
    if (r.sent) invited++; else failures.push(`${emailNorm}: ${r.error}`);
  }
  audit(store, req.user!.id, "waitlist.invite-bulk", "waitlist", "", `invited=${invited} skipped=${skipped}`);
  res.json({ ok: true, invited, skipped, emailFailures: failures });
});

// ---------- Challenge manager ----------
const challengeSchema = z.object({
  dayNumber: z.number().int().min(1).max(30),
  title: z.string().trim().min(2).max(200),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
  leetcodeUrl: z.string().trim().url(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  topics: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  publishAt: z.string().datetime({ offset: true }).nullable().optional(),
  archiveAt: z.string().datetime({ offset: true }).nullable().optional(),
  activePoints: z.number().int().min(0).max(1000).default(100),
  archivedPoints: z.number().int().min(0).max(1000).default(25),
});

function toChallengeInput(b: z.infer<typeof challengeSchema>) {
  const derived = leetcodeSlugFromUrl(b.leetcodeUrl);
  if (!derived && !b.slug) return { error: "Could not derive problem slug from LeetCode URL — provide slug explicitly" as const };
  const slug = (b.slug ?? derived!)?.toLowerCase();
  if (b.slug && derived && b.slug.toLowerCase() !== derived) return { error: `Slug "${b.slug}" does not match URL slug "${derived}"` as const };
  return { slug: slug!, url: canonicalLeetcodeUrl(slug!) };
}

adminRouter.get("/challenges", (_req, res) => {
  const store = _req.store!;
  res.json({ data: [...store.challenges.values()].sort((a, b) => a.dayNumber - b.dayNumber) });
});

adminRouter.post("/challenges", validate(challengeSchema), (req, res) => {
  const store = req.store!;
  const b = req.body as z.infer<typeof challengeSchema>;
  if (store.challengesByDay.has(b.dayNumber)) { res.status(409).json({ error: { code: "DAY_CONFLICT", message: `Day ${b.dayNumber} is already assigned` } }); return; }
  const conv = toChallengeInput(b);
  if ("error" in conv) { res.status(400).json({ error: { code: "SLUG", message: conv.error } }); return; }
  if (store.challengesBySlug.has(conv.slug)) { res.status(409).json({ error: { code: "SLUG_CONFLICT", message: "This problem slug is already used" } }); return; }
  const id = uid();
  const ch = { id, dayNumber: b.dayNumber, title: b.title.trim(), slug: conv.slug, leetcodeUrl: conv.url, difficulty: b.difficulty, topics: b.topics ?? [], state: "DRAFT" as const, publishAt: b.publishAt ?? null, archiveAt: b.archiveAt ?? null, activePoints: b.activePoints ?? 100, archivedPoints: b.archivedPoints ?? 25, publishedAt: null as string | null, archivedAt: null as string | null, createdAt: nowIso(), updatedAt: nowIso() };
  store.challenges.set(id, ch); store.challengesByDay.set(ch.dayNumber, id); store.challengesBySlug.set(ch.slug, id);
  store.history.push({ id: uid(), challengeId: id, actorId: req.user!.id, action: "created", detail: ch.title, createdAt: nowIso() });
  audit(store, req.user!.id, "challenge.create", "challenge", id, `day ${ch.dayNumber} ${ch.slug}`);
  res.status(201).json({ challenge: ch });
});

adminRouter.put("/challenges/:id", validate(challengeSchema), (req, res) => {
  const store = req.store!;
  const ch = store.challenges.get(req.params.id);
  if (!ch) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Challenge not found" } }); return; }
  if (ch.state === "ACTIVE" || ch.state === "ARCHIVED") { res.status(400).json({ error: { code: "LOCKED", message: "Published challenges are locked — reschedule only via publish/archive actions" } }); return; }
  const b = req.body as z.infer<typeof challengeSchema>;
  if (b.dayNumber !== ch.dayNumber && store.challengesByDay.has(b.dayNumber)) { res.status(409).json({ error: { code: "DAY_CONFLICT", message: `Day ${b.dayNumber} is already assigned` } }); return; }
  const conv = toChallengeInput(b);
  if ("error" in conv) { res.status(400).json({ error: { code: "SLUG", message: conv.error } }); return; }
  store.challengesByDay.delete(ch.dayNumber);
  if (conv.slug !== ch.slug) { store.challengesBySlug.delete(ch.slug); }
  Object.assign(ch, { dayNumber: b.dayNumber, title: b.title.trim(), slug: conv.slug, leetcodeUrl: conv.url, difficulty: b.difficulty, topics: b.topics ?? [], publishAt: b.publishAt ?? null, archiveAt: b.archiveAt ?? null, activePoints: b.activePoints ?? 100, archivedPoints: b.archivedPoints ?? 25, updatedAt: nowIso() });
  store.challengesByDay.set(ch.dayNumber, ch.id); store.challengesBySlug.set(ch.slug, ch.id);
  store.history.push({ id: uid(), challengeId: ch.id, actorId: req.user!.id, action: "edited", detail: ch.title, createdAt: nowIso() });
  audit(store, req.user!.id, "challenge.edit", "challenge", ch.id, `day ${ch.dayNumber}`);
  res.json({ challenge: ch });
});

adminRouter.delete("/challenges/:id", (req, res) => {
  const store = req.store!;
  const ch = store.challenges.get(req.params.id);
  if (!ch) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Challenge not found" } }); return; }
  if (ch.state === "ACTIVE" || ch.state === "ARCHIVED") { res.status(400).json({ error: { code: "LOCKED", message: "Cannot delete a published challenge" } }); return; }
  store.challenges.delete(ch.id); store.challengesByDay.delete(ch.dayNumber); store.challengesBySlug.delete(ch.slug);
  audit(store, req.user!.id, "challenge.delete", "challenge", ch.id, `day ${ch.dayNumber}`);
  res.json({ ok: true });
});

adminRouter.post("/challenges/:id/publish", (req, res) => {
  const store = req.store!;
  const ch = store.challenges.get(req.params.id);
  if (!ch) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Challenge not found" } }); return; }
  if (ch.state === "ACTIVE") { res.json({ challenge: ch, duplicate: true }); return; } // idempotent
  // only one ACTIVE at a time: archive the previous
  for (const o of store.challenges.values()) if (o.state === "ACTIVE" && o.id !== ch.id) { o.state = "ARCHIVED"; o.archivedAt = nowIso(); }
  ch.state = "ACTIVE"; ch.publishedAt = nowIso(); ch.updatedAt = nowIso();
  store.history.push({ id: uid(), challengeId: ch.id, actorId: req.user!.id, action: "published", detail: `day ${ch.dayNumber}`, createdAt: nowIso() });
  audit(store, req.user!.id, "challenge.publish", "challenge", ch.id, `day ${ch.dayNumber}`);
  res.json({ challenge: ch });
});

adminRouter.post("/challenges/:id/archive", (req, res) => {
  const store = req.store!;
  const ch = store.challenges.get(req.params.id);
  if (!ch) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Challenge not found" } }); return; }
  if (ch.state === "ARCHIVED") { res.json({ challenge: ch, duplicate: true }); return; } // idempotent
  ch.state = "ARCHIVED"; ch.archivedAt = nowIso(); ch.updatedAt = nowIso();
  store.history.push({ id: uid(), challengeId: ch.id, actorId: req.user!.id, action: "archived", detail: `day ${ch.dayNumber}`, createdAt: nowIso() });
  audit(store, req.user!.id, "challenge.archive", "challenge", ch.id, `day ${ch.dayNumber}`);
  res.json({ challenge: ch });
});

adminRouter.get("/challenges/:id/history", (req, res) => {
  const store = req.store!;
  res.json({ data: store.history.filter((h) => h.challengeId === req.params.id).sort((a: { createdAt: string }, b: { createdAt: string }) => a.createdAt.localeCompare(b.createdAt)) });
});

adminRouter.post("/challenges/import", validate(z.object({ items: z.array(challengeSchema).min(1).max(30) })), (req, res) => {
  const store = req.store!;
  const items = (req.body as { items: z.infer<typeof challengeSchema>[] }).items;
  // preview + conflict detection first (no partial writes)
  const issues: string[] = [];
  const days = new Set<number>(); const slugs = new Set<string>();
  for (const [i, b] of items.entries()) {
    if (days.has(b.dayNumber)) issues.push(`row ${i + 1}: duplicate day ${b.dayNumber} in import`);
    days.add(b.dayNumber);
    if (store.challengesByDay.has(b.dayNumber)) issues.push(`row ${i + 1}: day ${b.dayNumber} already assigned`);
    const conv = toChallengeInput(b);
    if ("error" in conv) issues.push(`row ${i + 1}: ${conv.error}`);
    else { if (slugs.has(conv.slug) || store.challengesBySlug.has(conv.slug)) issues.push(`row ${i + 1}: slug ${conv.slug} already used`); slugs.add(conv.slug); }
  }
  if (String(req.query.preview ?? "true") === "true") { res.json({ preview: true, issues, count: items.length }); return; }
  if (issues.length) { res.status(409).json({ error: { code: "IMPORT_CONFLICTS", message: "Resolve conflicts first", details: issues } }); return; }
  const created = [];
  for (const b of items) {
    const conv = toChallengeInput(b) as { slug: string; url: string };
    const id = uid();
    const ch = { id, dayNumber: b.dayNumber, title: b.title.trim(), slug: conv.slug, leetcodeUrl: conv.url, difficulty: b.difficulty, topics: b.topics ?? [], state: "DRAFT" as const, publishAt: b.publishAt ?? null, archiveAt: b.archiveAt ?? null, activePoints: b.activePoints ?? 100, archivedPoints: b.archivedPoints ?? 25, publishedAt: null as string | null, archivedAt: null as string | null, createdAt: nowIso(), updatedAt: nowIso() };
    store.challenges.set(id, ch); store.challengesByDay.set(ch.dayNumber, id); store.challengesBySlug.set(ch.slug, id);
    created.push(ch);
  }
  audit(store, req.user!.id, "challenge.import", "challenge", "", `${created.length} items`);
  res.status(201).json({ created });
});

// ---------- Verification queue ----------
adminRouter.get("/verifications", (req, res) => {
  const store = req.store!;
  const status = String(req.query.status ?? "");
  let rows = [...store.completions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (status) rows = rows.filter((c) => c.status === status);
  else rows = rows.filter((c) => c.status === "PENDING" || c.status === "MANUAL_REVIEW" || c.status === "NOT_VERIFIED");
  res.json({
    data: rows.slice(0, 100).map((c) => ({
      ...c, user: (() => { const u = store.users.get(c.userId); return u ? { displayName: u.displayName, leetcodeUsername: u.leetcodeUsername, email: u.email } : null; })(),
      challenge: store.challenges.get(c.challengeId) ?? null,
    })),
    total: rows.length,
  });
});

adminRouter.post("/verifications/:id/review", validate(z.object({ decision: z.enum(["VERIFIED", "NOT_VERIFIED"]), reason: z.string().trim().min(3).max(500), awardPoints: z.number().int().min(0).max(1000).optional() })), (req, res) => {
  const store = req.store!;
  const c = store.completions.get(req.params.id);
  if (!c) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Claim not found" } }); return; }
  if (c.status === "VERIFIED") { res.json({ completion: c, duplicate: true }); return; } // no duplicate awards
  const ch = store.challenges.get(c.challengeId);
  const { decision, reason, awardPoints } = req.body as { decision: "VERIFIED" | "NOT_VERIFIED"; reason: string; awardPoints?: number };
  if (decision === "VERIFIED" && ch) {
    const pts = awardPoints ?? (ch.state === "ARCHIVED" ? ch.archivedPoints : ch.activePoints);
    c.status = "VERIFIED"; c.points = pts; c.verifiedAt = nowIso(); c.failReason = ""; c.updatedAt = nowIso();
    store.ledger.push({ id: uid(), userId: c.userId, challengeId: c.challengeId, delta: pts, reason: `Manual approval: ${reason}`, actorId: req.user!.id, createdAt: nowIso() });
  } else {
    c.status = "NOT_VERIFIED"; c.failReason = reason; c.updatedAt = nowIso();
  }
  audit(store, req.user!.id, "verification.review", "completion", c.id, `${decision}: ${reason}`);
  res.json({ completion: c });
});

// ---------- Scoring & audit ----------
adminRouter.get("/ledger", (req, res) => {
  const store = req.store!;
  const rows = [...store.ledger].reverse().slice(0, 200);
  res.json({ data: rows, total: store.ledger.length });
});

adminRouter.post("/adjust", validate(z.object({ userId: z.string().min(1), delta: z.number().int().min(-10000).max(10000), reason: z.string().trim().min(3).max(500) })), (req, res) => {
  const store = req.store!;
  const u = store.users.get(String(req.body.userId));
  if (!u) { res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } }); return; }
  manualAdjust(store, u.id, Number(req.body.delta), String(req.body.reason), req.user!.id);
  audit(store, req.user!.id, "score.adjust", "user", u.id, `${req.body.delta}: ${req.body.reason}`);
  res.json({ ok: true });
});

adminRouter.get("/audit", (req, res) => {
  const store = req.store!;
  const q = String(req.query.q ?? "").toLowerCase();
  let rows = [...store.audit].reverse();
  if (q) rows = rows.filter((a) => (a.action + a.entity + a.detail).toLowerCase().includes(q));
  res.json({ data: rows.slice(0, 200), total: rows.length });
});

adminRouter.get("/leaderboard/export.csv", (_req, res) => {
  const store = _req.store!;
  const rows = buildLeaderboard(store);
  const csv = ["rank,displayName,leetcodeUsername,totalPoints,verifiedCount,currentStreak", ...rows.map((r) => `${r.rank},${JSON.stringify(r.displayName)},${r.leetcodeUsername},${r.totalPoints},${r.verifiedCount},${r.currentStreak}`)].join("\n");
  audit(store, _req.user!.id, "admin.export-leaderboard", "leaderboard", "", `${rows.length} rows`);
  res.header("content-type", "text/csv").send(csv);
});

// ---------- Event settings ----------
adminRouter.get("/settings", (_req, res) => { res.json({ settings: _req.store!.settings }); });

adminRouter.put("/settings", validate(z.object({
  eventName: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).optional(),
  startDate: z.string().datetime({ offset: true }).nullable().optional(),
  endDate: z.string().datetime({ offset: true }).nullable().optional(),
  timezone: z.string().min(2).max(64).optional(),
  registrationMode: z.enum(["WAITLIST", "OPEN", "CLOSED"]).optional(),
  activePoints: z.number().int().min(0).max(1000).optional(),
  archivedPoints: z.number().int().min(0).max(1000).optional(),
})), (req, res) => {
  const store = req.store!;
  Object.assign(store.settings, req.body);
  audit(store, req.user!.id, "settings.update", "settings", "singleton", JSON.stringify(req.body));
  res.json({ settings: store.settings });
});

// Superadmin-only role grant for ADMIN (least privilege: admins cannot create admins)
export const superRouter = Router();
superRouter.use(auth, requireRole("SUPERADMIN"));
superRouter.post("/users/:id/grant-admin", async (req, res) => {
  const store = req.store!;
  const u = store.users.get(req.params.id);
  if (!u) { res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } }); return; }
  u.role = "ADMIN"; u.updatedAt = nowIso();
  audit(store, req.user!.id, "admin.grant", "user", u.id, u.email);
  res.json({ ok: true });
});
void hashPassword;
