import type { Challenge, Completion, Store } from "../store.js";
import { nowIso, uid } from "../store.js";

/** Centralized scoring service. Server-calculated; never trusts client point totals. */

export function pointsForChallenge(ch: Challenge, archivedPointsDefault: number, activePointsDefault: number): { active: number; archived: number } {
  return {
    active: ch.activePoints ?? activePointsDefault,
    archived: ch.archivedPoints ?? archivedPointsDefault,
  };
}

/** Award points for a verified completion, transactionally + idempotently. Returns {awarded} (0 on duplicate). */
export function awardVerification(
  store: Store, userId: string, ch: Challenge, completion: Completion, solveTime: string | null
): { awarded: number; duplicate: boolean } {
  if (completion.status === "VERIFIED") return { awarded: 0, duplicate: true }; // idempotent retry
  const isArchived = ch.state === "ARCHIVED";
  const points = isArchived ? ch.archivedPoints : ch.activePoints;
  completion.status = "VERIFIED";
  completion.points = points;
  completion.verifiedAt = nowIso();
  if (solveTime) completion.solveTime = solveTime;
  completion.updatedAt = nowIso();
  store.completions.set(completion.id, completion);
  store.ledger.push({
    id: uid(), userId, challengeId: ch.id, delta: points,
    reason: `Verified solve: day ${ch.dayNumber} (${isArchived ? "archived" : "active"} window)`,
    actorId: null, createdAt: nowIso(),
  });
  return { awarded: points, duplicate: false };
}

export function manualAdjust(store: Store, userId: string, delta: number, reason: string, actorId: string | null, challengeId: string | null = null) {
  store.ledger.push({ id: uid(), userId, challengeId, delta, reason, actorId, createdAt: nowIso() });
}

/** Authoritative totals recomputed from ledger + verified completions. */
export function userTotals(store: Store, userId: string): { totalPoints: number; verifiedCount: number } {
  let totalPoints = 0;
  for (const e of store.ledger) if (e.userId === userId) totalPoints += e.delta;
  let verifiedCount = 0;
  for (const c of store.completions.values()) if (c.userId === userId && c.status === "VERIFIED") verifiedCount += 1;
  return { totalPoints, verifiedCount };
}

export interface LeaderboardRow {
  userId: string; displayName: string; leetcodeUsername: string;
  totalPoints: number; verifiedCount: number; currentStreak: number; longestStreak: number;
  lastVerifiedAt: string | null; rank: number;
}

/** Streaks computed from verified solve dates (UTC calendar days, consecutive). */
export function computeStreaks(datesIso: string[]): { current: number; longest: number } {
  if (!datesIso.length) return { current: 0, longest: 0 };
  const days = [...new Set(datesIso.map((d) => d.slice(0, 10)))].sort();
  let longest = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1] + "T00:00:00Z").getTime();
    const cur = new Date(days[i] + "T00:00:00Z").getTime();
    if (cur - prev === 86400000) run += 1; else run = 1;
    longest = Math.max(longest, run);
  }
  // current streak: run ending at latest solve date
  let current = 1;
  for (let i = days.length - 1; i > 0; i--) {
    const a = new Date(days[i - 1] + "T00:00:00Z").getTime();
    const b = new Date(days[i] + "T00:00:00Z").getTime();
    if (b - a === 86400000) current += 1; else break;
  }
  return { current, longest };
}

/** Leaderboard with documented tie-breaks: points, verifiedCount, longestStreak, earliest lastVerifiedAt, name. */
export function buildLeaderboard(store: Store): LeaderboardRow[] {
  const users = [...store.users.values()].filter((u) => u.role === "PARTICIPANT" && u.status !== "SUSPENDED");
  const rows: LeaderboardRow[] = users.map((u) => {
    const { totalPoints, verifiedCount } = userTotals(store, u.id);
    const verified = [...store.completions.values()]
      .filter((c) => c.userId === u.id && c.status === "VERIFIED")
      .map((c) => c.verifiedAt ?? c.updatedAt)
      .sort();
    const { current, longest } = computeStreaks(verified);
    return {
      userId: u.id, displayName: u.displayName, leetcodeUsername: u.leetcodeUsername,
      totalPoints, verifiedCount, currentStreak: current && verifiedCount ? current : 0,
      longestStreak: longest && verifiedCount ? longest : 0,
      lastVerifiedAt: verified.length ? verified[verified.length - 1] : null, rank: 0,
    };
  });
  rows.sort((a, b) =>
    b.totalPoints - a.totalPoints ||
    b.verifiedCount - a.verifiedCount ||
    b.longestStreak - a.longestStreak ||
    (a.lastVerifiedAt ?? "z").localeCompare(b.lastVerifiedAt ?? "z") ||
    a.displayName.localeCompare(b.displayName));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}
