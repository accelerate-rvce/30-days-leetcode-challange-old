import { describe, it, expect } from "vitest";
import { mockProvider, httpProvider } from "../lib/verification.js";

describe("verification providers", () => {
  it("mock is explicitly marked mock", () => {
    expect(mockProvider.mock).toBe(true);
    expect(mockProvider.name).toBe("mock");
  });
  it("mock matches solved-* usernames, queues others for review", async () => {
    const hit = await mockProvider.lookup({ username: "solved-two-sum", slug: "two-sum" });
    expect(hit.matched).toBe(true);
    const miss = await mockProvider.lookup({ username: "fresh-user", slug: "two-sum" });
    expect(miss.matched).toBe(false);
    expect(miss.conclusive).toBe(false); // not proof of non-solving
  });
  it("http provider without config returns non-conclusive review state", async () => {
    const r = await httpProvider.lookup({ username: "anyone", slug: "two-sum" });
    expect(r.matched).toBe(false);
    expect(r.conclusive).toBe(false);
  });
});
