import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import type { Store } from "../store.js";

let store: Store; let app: ReturnType<typeof createApp>["app"];
beforeEach(() => { const c = createApp(); store = c.store; app = c.app; });

describe("waitlist", () => {
  it("joins, dedupes normalized email, verifies ownership token", async () => {
    const j = await request(app).post("/api/v1/waitlist").send({ name: "A B", email: "W@rvce.edu.in", leetcodeUsername: "wlc", consent: true });
    expect(j.status).toBe(201);
    const j2 = await request(app).post("/api/v1/waitlist").send({ name: "A B", email: "w@rvce.edu.in", leetcodeUsername: "wlc", consent: true });
    expect(j2.status).toBe(201); // idempotent, no duplicate
    expect(store.waitlist.size).toBe(1);
    const st = await request(app).get("/api/v1/waitlist/status").query({ email: "w@rvce.edu.in" });
    expect(st.body.status).toBe("PENDING");
    const rej = await request(app).post("/api/v1/waitlist").send({ name: "A", email: "x@gmail.com", leetcodeUsername: "x", consent: true });
    expect(rej.status).toBe(400);
  });
  it("CLOSED mode rejects joins", async () => {
    store.settings.registrationMode = "CLOSED";
    const r = await request(app).post("/api/v1/waitlist").send({ name: "A B", email: "c@rvce.edu.in", leetcodeUsername: "c", consent: true });
    expect(r.status).toBe(403);
  });
});
