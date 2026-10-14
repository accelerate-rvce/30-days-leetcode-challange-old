import { hashPassword } from "./lib/crypto.js";
import { createApp } from "./app.js";
import { nowIso, uid } from "./store.js";

/** Dev seed: realistic demo data, clearly marked DEMO. Never used in production. */
async function main() {
  const { store } = createApp();
  const mk = async (email: string, name: string, lc: string, role: "PARTICIPANT" | "ADMIN" = "PARTICIPANT") => {
    const id = uid();
    store.users.set(id, {
      id, email, emailNorm: email, name, displayName: name, leetcodeUsername: lc,
      passwordHash: await hashPassword("Password123!"), role, status: "ACTIVE",
      emailVerifiedAt: nowIso(), createdAt: nowIso(), updatedAt: nowIso(),
    });
    store.usersByNorm.set(email, id);
    return id;
  };
  await mk("admin@rvce.edu.in", "Demo Admin", "demo-admin", "ADMIN");
  const p1 = await mk("aarav@rvce.edu.in", "Aarav Sharma", "solved-two-sum");
  await mk("diya@rvce.edu.in", "Diya Patel", "diya-codes");
  const slugs: [number, string, string, "Easy" | "Medium" | "Hard"][] = [
    [1, "Two Sum", "two-sum", "Easy"],
    [2, "Add Two Numbers", "add-two-numbers", "Medium"],
    [3, "Median of Two Sorted Arrays", "median-of-two-sorted-arrays", "Hard"],
  ];
  for (const [day, title, slug, diff] of slugs) {
    const id = uid();
    store.challenges.set(id, {
      id, dayNumber: day, title, slug, leetcodeUrl: `https://leetcode.com/problems/${slug}/`,
      difficulty: diff, topics: ["Array"], state: day === 1 ? "ACTIVE" : "SCHEDULED",
      publishAt: new Date(Date.now() - (day === 1 ? 3600 : -86400) * 1000).toISOString(),
      archiveAt: null, activePoints: 100, archivedPoints: 25,
      publishedAt: day === 1 ? nowIso() : null, archivedAt: null, createdAt: nowIso(), updatedAt: nowIso(),
    });
    store.challengesByDay.set(day, id); store.challengesBySlug.set(slug, id);
  }
  console.log("Seeded DEMO data (admin@rvce.edu.in / Password123!). Participants:", p1 ? "ok" : "?");
  process.exit(0);
}
main();
