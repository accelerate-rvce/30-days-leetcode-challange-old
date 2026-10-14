import { describe, it, expect } from "vitest";
import { normalizeEmail, isRvceEmail, leetcodeSlugFromUrl } from "@accelerate/shared";

describe("email-domain validation", () => {
  it("normalizes case + whitespace", () => {
    expect(normalizeEmail("  Aarav@RVCE.edu.in ")).toBe("aarav@rvce.edu.in");
  });
  it("accepts only @rvce.edu.in", () => {
    expect(isRvceEmail("a@rvce.edu.in")).toBe(true);
    expect(isRvceEmail("a@gmail.com")).toBe(false);
    expect(isRvceEmail("a@rvce.edu.in.evil.com")).toBe(false);
    expect(isRvceEmail("a@fake-rvce.edu.in")).toBe(false);
  });
});

describe("leetcode slug parsing", () => {
  it("derives canonical slug", () => {
    expect(leetcodeSlugFromUrl("https://leetcode.com/problems/two-sum/")).toBe("two-sum");
    expect(leetcodeSlugFromUrl("https://leetcode.com/problems/Two-Sum/description/")).toBe("two-sum");
    expect(leetcodeSlugFromUrl("https://example.com/problems/x/")).toBeNull();
    expect(leetcodeSlugFromUrl("not a url")).toBeNull();
  });
});
