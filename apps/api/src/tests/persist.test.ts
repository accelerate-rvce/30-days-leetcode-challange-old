import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createStore } from "../store.js";
import { loadSnapshot, saveSnapshot } from "../lib/persist.js";
import { seedDemo } from "../lib/init.js";

function mockDb(seed: Record<string, unknown[]> = {}) {
  const calls: { model: string; op: string; args?: unknown }[] = [];
  const table = (model: string) => ({
    findMany: vi.fn(async () => seed[model] ?? []),
    deleteMany: vi.fn(async () => { calls.push({ model, op: "deleteMany" }); return { count: 0 }; }),
    createMany: vi.fn(async (args: unknown) => { calls.push({ model, op: "createMany", args }); return { count: 0 }; }),
    create: vi.fn(async (args: unknown) => { calls.push({ model, op: "create", args }); return args; }),
  });
  const db = {
    user: table("user"), waitlistEntry: table("waitlistEntry"), challenge: table("challenge"),
    challengeHistory: table("challengeHistory"), completion: table("completion"),
    scoreLedger: table("scoreLedger"), session: table("session"), emailToken: table("emailToken"),
    auditLog: table("auditLog"), jobRun: table("jobRun"), eventSettings: table("eventSettings"),
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  return { db: db as unknown as PrismaClient, calls, raw: db };
}

const D = (s: string) => new Date(s);

describe("snapshot persistence", () => {
  it("saves the memory store (children cleared first, empty tables skipped)", async () => {
    const store = createStore();
    await seedDemo(store);
    const { db, calls, raw } = mockDb();

    await saveSnapshot(db, store);

    const ops = calls.map((c) => `${c.model}.${c.op}`);
    // deletes run before creates
    expect(ops.indexOf("completion.deleteMany")).toBeLessThan(ops.indexOf("user.createMany"));
    expect(ops).toContain("user.deleteMany");
    expect(ops).toContain("challenge.deleteMany");
    expect(ops).toContain("eventSettings.deleteMany");
    // seedDemo creates no completions/sessions → createMany skipped, delete still runs
    expect(ops).not.toContain("completion.createMany");
    expect(ops).not.toContain("session.createMany");
    expect(raw.user.createMany).toHaveBeenCalledOnce();
    const users = (raw.user.createMany.mock.calls[0][0] as { data: { email: string; role: string }[] }).data;
    expect(users.map((u) => u.email).sort()).toEqual(["aarav@rvce.edu.in", "admin@rvce.edu.in", "diya@rvce.edu.in"]);
    expect(users.find((u) => u.email === "admin@rvce.edu.in")!.role).toBe("ADMIN");
    const settings = raw.eventSettings.create.mock.calls[0][0] as { data: { id: string } };
    expect(settings.data.id).toBe("singleton");
  });

  it("loads a snapshot back with indexes and settings intact", async () => {
    const { db } = mockDb({
      user: [{ id: "u1", email: "a@rvce.edu.in", emailNorm: "a@rvce.edu.in", name: "A", displayName: "A", leetcodeUsername: "lc", passwordHash: "h", role: "PARTICIPANT", status: "ACTIVE", emailVerifiedAt: D("2026-01-01T00:00:00.000Z"), createdAt: D("2026-01-01T00:00:00.000Z"), updatedAt: D("2026-01-02T00:00:00.000Z") }],
      challenge: [{ id: "c1", dayNumber: 1, title: "Two Sum", slug: "two-sum", leetcodeUrl: "https://leetcode.com/problems/two-sum/", difficulty: "Easy", topics: ["Array"], state: "ACTIVE", publishAt: null, archiveAt: null, activePoints: 100, archivedPoints: 25, publishedAt: D("2026-01-01T00:00:00.000Z"), archivedAt: null, createdAt: D("2026-01-01T00:00:00.000Z"), updatedAt: D("2026-01-01T00:00:00.000Z") }],
      completion: [{ id: "k1", userId: "u1", challengeId: "c1", status: "VERIFIED", points: 100, evidence: "", failReason: "", attempts: 1, verifiedAt: D("2026-01-03T00:00:00.000Z"), solveTime: null, createdAt: D("2026-01-03T00:00:00.000Z"), updatedAt: D("2026-01-03T00:00:00.000Z") }],
      session: [{ id: "s1", userId: "u1", tokenHash: "tok", expiresAt: D("2026-02-01T00:00:00.000Z"), revokedAt: null, ip: "", userAgent: "", createdAt: D("2026-01-01T00:00:00.000Z") }],
      eventSettings: [{ id: "singleton", eventName: "E", description: "", startDate: null, endDate: null, timezone: "Asia/Kolkata", registrationMode: "OPEN", activePoints: 100, archivedPoints: 25, updatedAt: D("2026-01-01T00:00:00.000Z") }],
    });
    const store = createStore();

    const counts = await loadSnapshot(db, store);

    expect(counts.users).toBe(1);
    expect(store.usersByNorm.get("a@rvce.edu.in")).toBe("u1");
    expect(store.users.get("u1")!.emailVerifiedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(store.challengesByDay.get(1)).toBe("c1");
    expect(store.challengesBySlug.get("two-sum")).toBe("c1");
    expect(store.completionKey.get("u1:c1")).toBe("k1");
    expect(store.sessionsByHash.get("tok")).toBe("s1");
    expect(store.settings.registrationMode).toBe("OPEN");
  });
});
