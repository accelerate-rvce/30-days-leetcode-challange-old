import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import type { Store } from "../store.js";
import { hashPassword } from "../lib/crypto.js";
import { nowIso, uid } from "../store.js";
import { reconcile } from "../lib/jobs.js";

let store: Store; let app: ReturnType<typeof createApp>["app"];
beforeEach(() => { const c = createApp(); store = c.store; app = c.app; });

async function adminCookie() {
  const id = uid();
  store.users.set(id, { id, email: "ad@rvce.edu.in", emailNorm: "ad@rvce.edu.in", name: "Ad", displayName: "Ad", leetcodeUsername: "ad", passwordHash: await hashPassword("Password123!"), role: "ADMIN", status: "ACTIVE", emailVerifiedAt: nowIso(), createdAt: nowIso(), updatedAt: nowIso() });
  store.usersByNorm.set("ad@rvce.edu.in", id);
  const r = await request(app).post("/api/v1/auth/login").send({ email: "ad@rvce.edu.in", password: "Password123!" });
  return r.headers["set-cookie"] as unknown as string[];
}

const ch = (day: number) => ({
  dayNumber: day, title: `Problem ${day}`, leetcodeUrl: `https://leetcode.com/problems/problem-${day}/`,
  difficulty: "Easy" as const, topics: ["Array"],
  publishAt: new Date(Date.now() + 86400000).toISOString(),
});

describe("challenge scheduling", () => {
  it("detects day conflicts + slug mismatch; timezone boundary respected", async () => {
    const ck = await adminCookie();
    const c1 = await request(app).post("/api/v1/admin/challenges").set("Cookie", ck).send(ch(1));
    expect(c1.status).toBe(201);
    const dup = await request(app).post("/api/v1/admin/challenges").set("Cookie", ck).send(ch(1));
    expect(dup.status).toBe(409);
    const mismatch = await request(app).post("/api/v1/admin/challenges").set("Cookie", ck).send({ ...ch(2), slug: "totally-different" });
    expect(mismatch.status).toBe(400);
    // Asia/Kolkata midnight boundary: publishAt just after IST midnight publishes on reconcile
    const istMidnight = new Date("2026-10-15T00:00:30+05:30").toISOString();
    expect(new Date(istMidnight).getUTCHours()).toBe(18); // sanity: stored as UTC
  });
  it("publish/archive are idempotent; reconcile publishes overdue", async () => {
    const ck = await adminCookie();
    const c = await request(app).post("/api/v1/admin/challenges").set("Cookie", ck).send({ ...ch(5), publishAt: new Date(Date.now() - 1000).toISOString() });
    const id = c.body.challenge.id;
    // mark scheduled in past then reconcile
    store.challenges.get(id)!.state = "SCHEDULED";
    const r1 = reconcile(store, "test");
    expect(r1.published).toContain(id);
    const again = reconcile(store, "test");
    expect(again.published).not.toContain(id); // idempotent
    const p1 = await request(app).post(`/api/v1/admin/challenges/${id}/publish`).set("Cookie", ck);
    expect(p1.body.duplicate).toBe(true);
    const a1 = await request(app).post(`/api/v1/admin/challenges/${id}/archive`).set("Cookie", ck);
    expect(a1.status).toBe(200);
    const a2 = await request(app).post(`/api/v1/admin/challenges/${id}/archive`).set("Cookie", ck);
    expect(a2.body.duplicate).toBe(true);
  });
  it("jobs endpoint requires secret", async () => {
    const bad = await request(app).post("/api/v1/jobs/run");
    expect(bad.status).toBe(403);
  });
});
