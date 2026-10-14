import { describe, it, expect } from "vitest";
import { normalizeEmail, isRvceEmail, leetcodeSlugFromUrl, waitlistSchema } from "./index.js";

describe("shared contracts", () => {
  it("validates waitlist payloads", () => {
    expect(waitlistSchema.safeParse({ name: "A B", email: "a@rvce.edu.in", leetcodeUsername: "abc", consent: true }).success).toBe(true);
    expect(waitlistSchema.safeParse({ name: "A", email: "a@gmail.com", leetcodeUsername: "abc", consent: true }).success).toBe(false);
  });
  it("helpers", () => {
    expect(normalizeEmail(" X@RVCE.edu.in")).toBe("x@rvce.edu.in");
    expect(isRvceEmail("x@rvce.edu.in")).toBe(true);
    expect(leetcodeSlugFromUrl("https://leetcode.com/problems/two-sum/")).toBe("two-sum");
  });
});
