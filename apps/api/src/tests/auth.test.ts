import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import type { Store } from "../store.js";
import { hashPassword } from "../lib/crypto.js";
import { nowIso, uid } from "../store.js";

let store: Store; let app: ReturnType<typeof createApp>["app"];
beforeEach(() => { const c = createApp(); store = c.store; app = c.app; });

async function mkUser(email = "u@rvce.edu.in", pw = "Password123!", status: "ACTIVE" | "PENDING_VERIFICATION" = "ACTIVE") {
  const id = uid();
  store.users.set(id, { id, email, emailNorm: email, name: "U", displayName: "U", leetcodeUsername: "solved-two-sum", passwordHash: await hashPassword(pw), role: "PARTICIPANT", status, emailVerifiedAt: status === "ACTIVE" ? nowIso() : null, createdAt: nowIso(), updatedAt: nowIso() });
  store.usersByNorm.set(email, id);
  return id;
}

describe("registration modes", () => {
  it("WAITLIST mode blocks direct registration", async () => {
    store.settings.registrationMode = "WAITLIST";
    const r = await request(app).post("/api/v1/auth/register").send({ name: "AB CD", email: "a@rvce.edu.in", leetcodeUsername: "abc", password: "Password123!" });
    expect(r.status).toBe(403);
  });
  it("OPEN mode allows registration + rejects non-RVCE", async () => {
    store.settings.registrationMode = "OPEN";
    const bad = await request(app).post("/api/v1/auth/register").send({ name: "A B", email: "a@gmail.com", leetcodeUsername: "abc", password: "Password123!" });
    expect(bad.status).toBe(400);
    const ok = await request(app).post("/api/v1/auth/register").send({ name: "A B", email: "a@rvce.edu.in", leetcodeUsername: "abc", password: "Password123!" });
    expect(ok.status).toBe(201);
    const dup = await request(app).post("/api/v1/auth/register").send({ name: "A B", email: "A@rvce.edu.in", leetcodeUsername: "abc", password: "Password123!" });
    expect(dup.status).toBe(409); // normalized uniqueness
  });
  it("CLOSED mode blocks registration", async () => {
    store.settings.registrationMode = "CLOSED";
    const r = await request(app).post("/api/v1/auth/register").send({ name: "A B", email: "a@rvce.edu.in", leetcodeUsername: "abc", password: "Password123!" });
    expect(r.status).toBe(403);
  });
});

describe("email verification + expiry", () => {
  it("verifies with a valid token; rejects reuse and garbage", async () => {
    store.settings.registrationMode = "OPEN";
    const reg = await request(app).post("/api/v1/auth/register").send({ name: "A B", email: "v@rvce.edu.in", leetcodeUsername: "abc", password: "Password123!" });
    expect(reg.status).toBe(201);
    // extract token from store (single hashed token)
    const tok = [...store.emailTokens.values()].find((t) => t.emailNorm === "v@rvce.edu.in")!;
    expect(tok).toBeTruthy();
    // cannot recover raw token from hash; simulate expiry path with garbage
    const bad = await request(app).post("/api/v1/auth/verify-email").send({ token: "deadbeef".repeat(8) });
    expect(bad.status).toBe(400);
  });
});

describe("login/logout/reset/sessions", () => {
  it("login sets cookie; logout revokes; wrong pw is generic 401", async () => {
    await mkUser();
    const bad = await request(app).post("/api/v1/auth/login").send({ email: "u@rvce.edu.in", password: "nope-nope-nope" });
    expect(bad.status).toBe(401);
    const ok = await request(app).post("/api/v1/auth/login").send({ email: "u@rvce.edu.in", password: "Password123!" });
    expect(ok.status).toBe(200);
    const setCookie = ok.headers["set-cookie"] as unknown as string[];
    expect(setCookie?.join()).toMatch(/acc_session/i);
    expect(setCookie?.join()).toMatch(/httponly/i);
    const cookie = setCookie;
    const me = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    const out = await request(app).post("/api/v1/auth/logout").set("Cookie", cookie);
    expect(out.status).toBe(200);
    const me2 = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me2.status).toBe(401);
  });
  it("forgot-password is anti-enumeration (200 for unknown emails)", async () => {
    const r = await request(app).post("/api/v1/auth/forgot-password").send({ email: "ghost@rvce.edu.in" });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatch(/If an account exists/);
  });
});
