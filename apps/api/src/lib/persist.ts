import type {
  PrismaClient,
  Role,
  AccountStatus,
  WaitlistStatus,
  ChallengeState,
  ClaimStatus,
} from "@prisma/client";
import { type Store } from "../store.js";

/**
 * Postgres persistence for the in-memory store.
 *
 * Design: the server keeps serving from memory (all routes untouched).
 * On boot the snapshot is loaded from Postgres; every SNAPSHOT_INTERVAL_SEC
 * (default 60s) and on graceful shutdown the full snapshot is written back
 * inside one transaction. Worst case a crash loses <1 interval of writes —
 * acceptable for this event's scale, and vastly simpler than rewriting every
 * query. Tables are fully rewritten, so no drift is possible.
 *
 * Only loaded when STORE=prisma. The @prisma/client import below is
 * type-only (erased at compile); the runtime import happens in
 * createPrisma() so STORE=memory never needs a generated client.
 */

const toDate = (s: string | null): Date | null => (s ? new Date(s) : null);

/** Runtime client factory. Throws a clear error when the client was never generated. */
export async function createPrisma(): Promise<PrismaClient> {
  try {
    const { PrismaClient } = await import("@prisma/client");
    return new PrismaClient();
  } catch {
    throw new Error("@prisma/client is not generated. Run: npx prisma generate --schema apps/api/prisma/schema.prisma");
  }
}

export async function loadSnapshot(db: PrismaClient, store: Store): Promise<Record<string, number>> {
  const [users, waitlist, challenges, history, completions, ledger, sessions, emailTokens, audit, jobs, settings] =
    await Promise.all([
      db.user.findMany(),
      db.waitlistEntry.findMany(),
      db.challenge.findMany(),
      db.challengeHistory.findMany(),
      db.completion.findMany(),
      db.scoreLedger.findMany(),
      db.session.findMany(),
      db.emailToken.findMany(),
      db.auditLog.findMany(),
      db.jobRun.findMany(),
      db.eventSettings.findMany(),
    ]);

  // Rebuild via explicit shape to satisfy the Store types (enums arrive as strings).
  store.users.clear(); store.usersByNorm.clear();
  for (const u of users) {
    store.users.set(u.id, {
      id: u.id, email: u.email, emailNorm: u.emailNorm, name: u.name, displayName: u.displayName,
      leetcodeUsername: u.leetcodeUsername, passwordHash: u.passwordHash,
      role: u.role as unknown as "PARTICIPANT" | "ADMIN" | "SUPERADMIN",
      status: u.status as unknown as "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED",
      emailVerifiedAt: u.emailVerifiedAt ? u.emailVerifiedAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(), updatedAt: u.updatedAt.toISOString(),
    });
    store.usersByNorm.set(u.emailNorm, u.id);
  }
  store.waitlist.clear(); store.waitlistByNorm.clear();
  for (const w of waitlist) {
    store.waitlist.set(w.id, {
      id: w.id, email: w.email, emailNorm: w.emailNorm, name: w.name, leetcodeUsername: w.leetcodeUsername,
      consent: w.consent, status: w.status as unknown as "PENDING" | "EMAIL_VERIFIED" | "APPROVED" | "REJECTED" | "INVITED",
      invitedAt: w.invitedAt ? w.invitedAt.toISOString() : null,
      decidedAt: w.decidedAt ? w.decidedAt.toISOString() : null, decidedBy: w.decidedBy,
      createdAt: w.createdAt.toISOString(), updatedAt: w.updatedAt.toISOString(),
    });
    store.waitlistByNorm.set(w.emailNorm, w.id);
  }
  store.challenges.clear(); store.challengesByDay.clear(); store.challengesBySlug.clear();
  for (const c of challenges) {
    store.challenges.set(c.id, {
      id: c.id, dayNumber: c.dayNumber, title: c.title, slug: c.slug, leetcodeUrl: c.leetcodeUrl,
      difficulty: c.difficulty, topics: [...c.topics],
      state: c.state as unknown as "DRAFT" | "SCHEDULED" | "ACTIVE" | "ARCHIVED",
      publishAt: c.publishAt ? c.publishAt.toISOString() : null,
      archiveAt: c.archiveAt ? c.archiveAt.toISOString() : null,
      activePoints: c.activePoints, archivedPoints: c.archivedPoints,
      publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
      archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
    });
    store.challengesByDay.set(c.dayNumber, c.id);
    store.challengesBySlug.set(c.slug, c.id);
  }
  store.history.length = 0;
  for (const h of history) {
    store.history.push({
      id: h.id, challengeId: h.challengeId, actorId: h.actorId, action: h.action,
      detail: h.detail, createdAt: h.createdAt.toISOString(),
    });
  }
  store.completions.clear(); store.completionKey.clear();
  for (const c of completions) {
    store.completions.set(c.id, {
      id: c.id, userId: c.userId, challengeId: c.challengeId,
      status: c.status as unknown as "PENDING" | "VERIFIED" | "NOT_VERIFIED" | "MANUAL_REVIEW",
      points: c.points, evidence: c.evidence, failReason: c.failReason, attempts: c.attempts,
      verifiedAt: c.verifiedAt ? c.verifiedAt.toISOString() : null,
      solveTime: c.solveTime ? c.solveTime.toISOString() : null,
      createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
    });
    store.completionKey.set(`${c.userId}:${c.challengeId}`, c.id);
  }
  store.ledger.length = 0;
  for (const l of ledger) {
    store.ledger.push({
      id: l.id, userId: l.userId, challengeId: l.challengeId, delta: l.delta,
      reason: l.reason, actorId: l.actorId, createdAt: l.createdAt.toISOString(),
    });
  }
  store.sessions.clear(); store.sessionsByHash.clear();
  for (const s of sessions) {
    store.sessions.set(s.id, {
      id: s.id, userId: s.userId, tokenHash: s.tokenHash,
      expiresAt: s.expiresAt.toISOString(),
      revokedAt: s.revokedAt ? s.revokedAt.toISOString() : null,
      ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt.toISOString(),
    });
    store.sessionsByHash.set(s.tokenHash, s.id);
  }
  store.emailTokens.clear();
  for (const t of emailTokens) {
    store.emailTokens.set(t.tokenHash, {
      id: t.id, purpose: t.purpose, emailNorm: t.emailNorm, userId: t.userId, tokenHash: t.tokenHash,
      expiresAt: t.expiresAt.toISOString(),
      usedAt: t.usedAt ? t.usedAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
    });
  }
  store.audit.length = 0;
  for (const a of audit) {
    store.audit.push({
      id: a.id, actorId: a.actorId, action: a.action, entity: a.entity, entityId: a.entityId,
      detail: a.detail, createdAt: a.createdAt.toISOString(),
    });
  }
  store.jobs.length = 0;
  for (const j of jobs) {
    store.jobs.push({ id: j.id, job: j.job, status: j.status, detail: j.detail, createdAt: j.createdAt.toISOString() });
  }
  const s = settings[0];
  if (s) {
    store.setSettings({
      eventName: s.eventName, description: s.description,
      startDate: s.startDate ? s.startDate.toISOString() : null,
      endDate: s.endDate ? s.endDate.toISOString() : null,
      timezone: s.timezone,
      registrationMode: s.registrationMode as "WAITLIST" | "OPEN" | "CLOSED",
      activePoints: s.activePoints, archivedPoints: s.archivedPoints,
    });
  }
  return {
    users: users.length, waitlist: waitlist.length, challenges: challenges.length,
    completions: completions.length, ledger: ledger.length, sessions: sessions.length,
  };
}

export async function saveSnapshot(db: PrismaClient, store: Store): Promise<void> {
  const userRows = [...store.users.values()].map((u) => ({
    id: u.id, email: u.email, emailNorm: u.emailNorm, name: u.name, displayName: u.displayName,
    leetcodeUsername: u.leetcodeUsername, passwordHash: u.passwordHash,
    role: u.role as unknown as Role, status: u.status as unknown as AccountStatus,
    emailVerifiedAt: toDate(u.emailVerifiedAt),
    createdAt: new Date(u.createdAt), updatedAt: new Date(u.updatedAt),
  }));
  const waitlistRows = [...store.waitlist.values()].map((w) => ({
    id: w.id, email: w.email, emailNorm: w.emailNorm, name: w.name, leetcodeUsername: w.leetcodeUsername,
    consent: w.consent, status: w.status as unknown as WaitlistStatus,
    invitedAt: toDate(w.invitedAt), decidedAt: toDate(w.decidedAt), decidedBy: w.decidedBy,
    createdAt: new Date(w.createdAt), updatedAt: new Date(w.updatedAt),
  }));
  const challengeRows = [...store.challenges.values()].map((c) => ({
    id: c.id, dayNumber: c.dayNumber, title: c.title, slug: c.slug, leetcodeUrl: c.leetcodeUrl,
    difficulty: c.difficulty, topics: c.topics, state: c.state as unknown as ChallengeState,
    publishAt: toDate(c.publishAt), archiveAt: toDate(c.archiveAt),
    activePoints: c.activePoints, archivedPoints: c.archivedPoints,
    publishedAt: toDate(c.publishedAt), archivedAt: toDate(c.archivedAt),
    createdAt: new Date(c.createdAt), updatedAt: new Date(c.updatedAt),
  }));
  const historyRows = store.history.map((h) => ({
    id: h.id, challengeId: h.challengeId, actorId: h.actorId, action: h.action,
    detail: h.detail, createdAt: new Date(h.createdAt),
  }));
  const completionRows = [...store.completions.values()].map((c) => ({
    id: c.id, userId: c.userId, challengeId: c.challengeId,
    status: c.status as unknown as ClaimStatus, points: c.points, evidence: c.evidence,
    failReason: c.failReason, attempts: c.attempts,
    verifiedAt: toDate(c.verifiedAt), solveTime: toDate(c.solveTime),
    createdAt: new Date(c.createdAt), updatedAt: new Date(c.updatedAt),
  }));
  const ledgerRows = store.ledger.map((l) => ({
    id: l.id, userId: l.userId, challengeId: l.challengeId, delta: l.delta,
    reason: l.reason, actorId: l.actorId, createdAt: new Date(l.createdAt),
  }));
  const sessionRows = [...store.sessions.values()].map((s) => ({
    id: s.id, userId: s.userId, tokenHash: s.tokenHash, expiresAt: new Date(s.expiresAt),
    revokedAt: toDate(s.revokedAt), ip: s.ip, userAgent: s.userAgent, createdAt: new Date(s.createdAt),
  }));
  const tokenRows = [...store.emailTokens.values()].map((t) => ({
    id: t.id, purpose: t.purpose, emailNorm: t.emailNorm, userId: t.userId, tokenHash: t.tokenHash,
    expiresAt: new Date(t.expiresAt), usedAt: toDate(t.usedAt), createdAt: new Date(t.createdAt),
  }));
  const auditRows = store.audit.map((a) => ({
    id: a.id, actorId: a.actorId, action: a.action, entity: a.entity, entityId: a.entityId,
    detail: a.detail, createdAt: new Date(a.createdAt),
  }));
  const jobRows = store.jobs.map((j) => ({
    id: j.id, job: j.job, status: j.status, detail: j.detail, createdAt: new Date(j.createdAt),
  }));
  const st = store.settings;

  // Batched in one transaction; children deleted before parents, parents
  // created before children. createMany is skipped when empty.
  // (Typed loosely: the batch only needs to be thenable for $transaction.)
  const ops: Array<Promise<unknown>> = [
    db.completion.deleteMany(),
    db.scoreLedger.deleteMany(),
    db.session.deleteMany(),
    db.challengeHistory.deleteMany(),
    db.emailToken.deleteMany(),
    db.auditLog.deleteMany(),
    db.jobRun.deleteMany(),
    db.waitlistEntry.deleteMany(),
    db.user.deleteMany(),
    db.challenge.deleteMany(),
    db.eventSettings.deleteMany(),
  ];
  if (userRows.length) ops.push(db.user.createMany({ data: userRows }));
  if (challengeRows.length) ops.push(db.challenge.createMany({ data: challengeRows }));
  if (waitlistRows.length) ops.push(db.waitlistEntry.createMany({ data: waitlistRows }));
  if (historyRows.length) ops.push(db.challengeHistory.createMany({ data: historyRows }));
  if (completionRows.length) ops.push(db.completion.createMany({ data: completionRows }));
  if (ledgerRows.length) ops.push(db.scoreLedger.createMany({ data: ledgerRows }));
  if (sessionRows.length) ops.push(db.session.createMany({ data: sessionRows }));
  if (tokenRows.length) ops.push(db.emailToken.createMany({ data: tokenRows }));
  if (auditRows.length) ops.push(db.auditLog.createMany({ data: auditRows }));
  if (jobRows.length) ops.push(db.jobRun.createMany({ data: jobRows }));
  ops.push(db.eventSettings.create({
    data: {
      id: "singleton", eventName: st.eventName, description: st.description,
      startDate: toDate(st.startDate), endDate: toDate(st.endDate), timezone: st.timezone,
      registrationMode: st.registrationMode, activePoints: st.activePoints, archivedPoints: st.archivedPoints,
    },
  }));
  await db.$transaction(ops as never[]);
}
