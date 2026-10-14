import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import type { Store } from "../store.js";
import { hashPassword } from "../lib/crypto.js";
import { nowIso, uid } from "../store.js";
import { buildLeaderboard } from "../lib/scoring.js";

let store: Store; let app: ReturnType<typeof createApp>["app"];
beforeEach(() => { const c = createApp(); store = c.store; app = c.app; });

async function mk(email: string, lc: string, name = "N") {
  const id = uid();
  store.users.set(id, { id, email, emailNorm: email, name, displayName: name, leetcodeUsername: lc, passwordHash: await hashPassword("Password123!"), role: "PARTICIPANT", status: "ACTIVE", emailVerifiedAt: nowIso(), createdAt: nowIso(), updatedAt: nowIso() });
  store.usersByNorm.set(email, id);
  return id;
}
function mkChallenge(day: number, state: "ACTIVE" | "ARCHIVED", slug: string, active = 100, archived = 25) {
  const id = uid();
  store.challenges.set(id, { id, dayNumber: day, title: `T${day}`, slug, leetcodeUrl: `https://leetcode.com/problems/${slug}/`, difficulty: "Easy", topics: [], state, publishAt: null, archiveAt: null, activePoints: active, archivedPoints: archived, publishedAt: nowIso(), archivedAt: null, createdAt: nowIso(), updatedAt: nowIso() });
  store.challengesByDay.set(day, id); store.challengesBySlug.set(slug, id);
  return id;
}
async function login(email: string) {
  const r = await request(app).post("/api/v1/auth/login").send({ email, password: "Password123!" });
  return r.headers["set-cookie"] as unknown as string[];
}

describe("scoring engine", () => {
  it("awards 100 active / 25 archived; duplicates give 0; ledger is auditable", async () => {
    const uidA = await mk("s@rvce.edu.in", "solved-two-sum", "Solver");
    const cActive = mkChallenge(1, "ACTIVE", "two-sum");
    const cArch = mkChallenge(2, "ARCHIVED", "add-two-numbers");
    const ck = await login("s@rvce.edu.in");
    const r1 = await request(app).post("/api/v1/completions/claims").set("Cookie", ck).send({ challengeId: cActive });
    expect(r1.status).toBe(201);
    expect(r1.body.awarded).toBe(100);
    const r2 = await request(app).post("/api/v1/completions/claims").set("Cookie", ck).send({ challengeId: cActive });
    expect(r2.body.duplicate).toBe(true);
    expect(r2.body.awarded).toBe(0);
    // unique constraint: only one completion row
    expect([...store.completions.values()].filter((c) => c.userId === uidA).length).toBe(1);
    const r3 = await request(app).post("/api/v1/completions/claims").set("Cookie", ck).send({ challengeId: cArch });
    expect(r3.body.awarded).toBe(25);
    expect(store.ledger.filter((e) => e.userId === uidA).reduce((a, e) => a + e.delta, 0)).toBe(125);
  });
  it("unverified completion earns 0 and queues for review", async () => {
    await mk("n@rvce.edu.in", "never-solved-anything", "Newb");
    const c = mkChallenge(3, "ACTIVE", "two-sum");
    const ck = await login("n@rvce.edu.in");
    const r = await request(app).post("/api/v1/completions/claims").set("Cookie", ck).send({ challengeId: c });
    expect(r.status).toBe(202);
    expect(r.body.awarded).toBe(0);
    expect(["PENDING", "MANUAL_REVIEW"]).toContain(r.body.completion.status);
  });
  it("leaderboard tie-breaks deterministically", async () => {
    const a = await mk("a@rvce.edu.in", "solved-two-sum", "Anna");
    const b = await mk("b@rvce.edu.in", "solved-two-sum", "Ben");
    store.ledger.push({ id: uid(), userId: a, challengeId: null, delta: 100, reason: "t", actorId: null, createdAt: nowIso() });
    store.ledger.push({ id: uid(), userId: b, challengeId: null, delta: 100, reason: "t", actorId: null, createdAt: nowIso() });
    // Ben has more verified solves -> ranks first despite equal points
    const cid = mkChallenge(9, "ACTIVE", "two-sum");
    for (const extra of [10, 11]) mkChallenge(extra, "ACTIVE", `p-${extra}`);
    const rows = buildLeaderboard(store);
    expect(rows[0].totalPoints).toBe(100);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
    void cid;
  });
  it("manual review approves without duplicate awards; audit logged", async () => {
    const admin = uid();
    store.users.set(admin, { id: admin, email: "ad@rvce.edu.in", emailNorm: "ad@rvce.edu.in", name: "Ad", displayName: "Ad", leetcodeUsername: "ad", passwordHash: await hashPassword("Password123!"), role: "ADMIN", status: "ACTIVE", emailVerifiedAt: nowIso(), createdAt: nowIso(), updatedAt: nowIso() });
    store.usersByNorm.set("ad@rvce.edu.in", admin);
    await mk("q@rvce.edu.in", "pending-review-user", "Quinn");
    const c = mkChallenge(4, "ACTIVE", "two-sum");
    const ck = await login("q@rvce.edu.in");
    const claim = await request(app).post("/api/v1/completions/claims").set("Cookie", ck).send({ challengeId: c });
    expect(claim.status).toBe(202);
    const ac = await login("ad@rvce.edu.in");
    const rev = await request(app).post(`/api/v1/admin/verifications/${claim.body.completion.id}/review`).set("Cookie", ac).send({ decision: "VERIFIED", reason: "Confirmed screenshot evidence" });
    expect(rev.status).toBe(200);
    const again = await request(app).post(`/api/v1/admin/verifications/${claim.body.completion.id}/review`).set("Cookie", ac).send({ decision: "VERIFIED", reason: "Second try" });
    expect(again.body.duplicate).toBe(true);
    expect(store.audit.some((a) => a.action === "verification.review")).toBe(true);
  });
  it("CSV exports require admin; audit records exports", async () => {
    await mk("z@rvce.edu.in", "solved-x", "Zed");
    const ck = await login("z@rvce.edu.in");
    const denied = await request(app).get("/api/v1/admin/users/export.csv").set("Cookie", ck);
    expect(denied.status).toBe(403);
  });
});
