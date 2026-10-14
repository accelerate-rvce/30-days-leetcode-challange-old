import { hashPassword } from "./crypto.js";
import { nowIso, uid, type Store } from "../store.js";
import { config } from "../config.js";

/**
 * Idempotent SUPERADMIN bootstrap from env credentials (never hardcoded).
 * Returns "created" | "exists" | "skipped" (env vars absent).
 */
export async function ensureBootstrapAdmin(store: Store): Promise<"created" | "exists" | "skipped"> {
  const { email, password, name } = config.bootstrapAdmin;
  if (!email || !password) return "skipped";
  const emailNorm = email.trim().toLowerCase();
  if (store.usersByNorm.has(emailNorm)) return "exists";
  const id = uid();
  store.users.set(id, {
    id, email: emailNorm, emailNorm, name, displayName: name, leetcodeUsername: "admin",
    passwordHash: await hashPassword(password), role: "SUPERADMIN", status: "ACTIVE",
    emailVerifiedAt: nowIso(), createdAt: nowIso(), updatedAt: nowIso(),
  });
  store.usersByNorm.set(emailNorm, id);
  return "created";
}

export interface DemoSeedResult { users: number; challenges: number }

/**
 * Idempotent DEMO seed for local dev only. Skips rows that already exist,
 * so it is safe to run on every server boot behind SEED_DEMO=1.
 */
export async function seedDemo(store: Store): Promise<DemoSeedResult> {
  let users = 0;
  const mk = async (email: string, name: string, lc: string, role: "PARTICIPANT" | "ADMIN" = "PARTICIPANT") => {
    if (store.usersByNorm.has(email)) return;
    const id = uid();
    store.users.set(id, {
      id, email, emailNorm: email, name, displayName: name, leetcodeUsername: lc,
      passwordHash: await hashPassword("Password123!"), role, status: "ACTIVE",
      emailVerifiedAt: nowIso(), createdAt: nowIso(), updatedAt: nowIso(),
    });
    store.usersByNorm.set(email, id);
    users++;
  };
  await mk("admin@rvce.edu.in", "Demo Admin", "demo-admin", "ADMIN");
  await mk("aarav@rvce.edu.in", "Aarav Sharma", "solved-two-sum");
  await mk("diya@rvce.edu.in", "Diya Patel", "diya-codes");

  let challenges = 0;
  const rows: [number, string, string, "Easy" | "Medium" | "Hard"][] = [
    [1, "Two Sum", "two-sum", "Easy"],
    [2, "Add Two Numbers", "add-two-numbers", "Medium"],
    [3, "Median of Two Sorted Arrays", "median-of-two-sorted-arrays", "Hard"],
  ];
  for (const [day, title, slug, diff] of rows) {
    if (store.challengesByDay.has(day) || store.challengesBySlug.has(slug)) continue;
    const id = uid();
    store.challenges.set(id, {
      id, dayNumber: day, title, slug, leetcodeUrl: `https://leetcode.com/problems/${slug}/`,
      difficulty: diff, topics: ["Array"], state: day === 1 ? "ACTIVE" : "SCHEDULED",
      publishAt: new Date(Date.now() - (day === 1 ? 3600 : -86400) * 1000).toISOString(),
      archiveAt: null, activePoints: 100, archivedPoints: 25,
      publishedAt: day === 1 ? nowIso() : null, archivedAt: null, createdAt: nowIso(), updatedAt: nowIso(),
    });
    store.challengesByDay.set(day, id); store.challengesBySlug.set(slug, id);
    challenges++;
  }
  return { users, challenges };
}
