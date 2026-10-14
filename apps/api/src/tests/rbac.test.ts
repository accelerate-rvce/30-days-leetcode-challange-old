import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import type { Store } from "../store.js";
import { hashPassword } from "../lib/crypto.js";
import { nowIso, uid } from "../store.js";

let store: Store; let app: ReturnType<typeof createApp>["app"];
beforeEach(() => { const c = createApp(); store = c.store; app = c.app; });

async function user(email: string, role: "PARTICIPANT" | "ADMIN" | "SUPERADMIN" = "PARTICIPANT") {
  const id = uid();
  store.users.set(id, { id, email, emailNorm: email, name: "N", displayName: "N", leetcodeUsername: "lc", passwordHash: await hashPassword("Password123!"), role, status: "ACTIVE", emailVerifiedAt: nowIso(), createdAt: nowIso(), updatedAt: nowIso() });
  store.usersByNorm.set(email, id);
  return id;
}
async function login(email: string) {
  const r = await request(app).post("/api/v1/auth/login").send({ email, password: "Password123!" });
  return r.headers["set-cookie"] as unknown as string[];
}

describe("RBAC", () => {
  it("denies admin endpoints to participants + anonymous", async () => {
    await user("p@rvce.edu.in");
    const anon = await request(app).get("/api/v1/admin/overview");
    expect(anon.status).toBe(401);
    const pc = await login("p@rvce.edu.in");
    const denied = await request(app).get("/api/v1/admin/overview").set("Cookie", pc);
    expect(denied.status).toBe(403);
  });
  it("allows admins; super-only grant is enforced", async () => {
    await user("a@rvce.edu.in", "ADMIN");
    await user("s@rvce.edu.in", "SUPERADMIN");
    await user("p@rvce.edu.in");
    const ac = await login("a@rvce.edu.in");
    const ok = await request(app).get("/api/v1/admin/overview").set("Cookie", ac);
    expect(ok.status).toBe(200);
    const pid = store.usersByNorm.get("p@rvce.edu.in")!;
    const grantDenied = await request(app).post(`/api/v1/super/users/${pid}/grant-admin`).set("Cookie", ac);
    expect(grantDenied.status).toBe(403);
    const sc = await login("s@rvce.edu.in");
    const grant = await request(app).post(`/api/v1/super/users/${pid}/grant-admin`).set("Cookie", sc);
    expect(grant.status).toBe(200);
  });
  it("public registration can never create an admin", async () => {
    store.settings.registrationMode = "OPEN";
    const r = await request(app).post("/api/v1/auth/register").send({ name: "X Y", email: "x@rvce.edu.in", leetcodeUsername: "x", password: "Password123!", role: "ADMIN" });
    expect(r.status).toBe(201);
    const id = store.usersByNorm.get("x@rvce.edu.in")!;
    expect(store.users.get(id)!.role).toBe("PARTICIPANT");
  });
});
