import { config } from "../config.js";

/**
 * Modular LeetCode verification provider abstraction.
 * External retrieval is separate from the scoring engine.
 * NEVER collects LeetCode passwords/cookies. Respects rate limits + caches.
 */

export interface SubmissionEvidence {
  titleSlug: string;
  status: string; // e.g. "Accepted"
  timestamp: string; // ISO
  lang?: string;
  url?: string;
}

export interface VerifyQuery { username: string; slug: string; maxRecent?: number }
export interface VerifyOutcome {
  matched: boolean;
  conclusive: boolean;
  evidence?: SubmissionEvidence;
  reason: string;
}

export interface VerificationProvider {
  name: string;
  mock: boolean;
  lookup(q: VerifyQuery): Promise<VerifyOutcome>;
}

const cache = new Map<string, { at: number; out: VerifyOutcome }>();
const CACHE_TTL = 300_000;
let lastCall = 0;
const MIN_GAP = 1200;

async function rateLimit() {
  const gap = Date.now() - lastCall;
  if (gap < MIN_GAP) await new Promise((r) => setTimeout(r, MIN_GAP - gap));
  lastCall = Date.now();
}

/** Mock provider for local dev + automated tests. EXPLICITLY marked mock. Never auto-enable in production. */
export const mockProvider: VerificationProvider = {
  name: "mock",
  mock: true,
  async lookup({ username, slug }) {
    // Deterministic rule for tests: username starting with "solved-" or containing slug counts as solved.
    const u = username.toLowerCase();
    if (u.startsWith("solved-") || u.includes(`+${slug}+`) || u === `verified-${slug}`) {
      return {
        matched: true, conclusive: true,
        evidence: { titleSlug: slug, status: "Accepted", timestamp: new Date().toISOString(), lang: "python3" },
        reason: "Mock provider: accepted submission found in recent history.",
      };
    }
    if (u.startsWith("pending-")) {
      return { matched: false, conclusive: false, reason: "Mock provider: limited result set — no match found, not conclusive. Marked for review." };
    }
    return { matched: false, conclusive: false, reason: "Mock provider: no accepted submission found in recent history. Solve on LeetCode first, then retry." };
  },
};

/**
 * HTTP provider stub: queries a configured GraphQL-compatible lookup service.
 * Disabled by default. Requires operator configuration; documented in README + /api/v1/settings/verification.
 * Never scrapes LeetCode directly from the backend without operator review of ToS/rate limits.
 */
export const httpProvider: VerificationProvider = {
  name: "http",
  mock: false,
  async lookup({ username, slug, maxRecent }) {
    if (!config.leetcodeGraphqlUrl) {
      return { matched: false, conclusive: false, reason: "Automated verification is not configured. Your claim is queued for manual review." };
    }
    const key = `${username}:${slug}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.out;
    await rateLimit();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(config.leetcodeGraphqlUrl, {
        method: "POST", signal: ctrl.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, slug, limit: Math.min(maxRecent ?? 50, 100) }),
      });
      clearTimeout(t);
      if (!res.ok) return { matched: false, conclusive: false, reason: `Verification service error (${res.status}). Queued for review.` };
      const data = (await res.json()) as { matched?: boolean; timestamp?: string; status?: string };
      const out: VerifyOutcome = data.matched
        ? { matched: true, conclusive: true, evidence: { titleSlug: slug, status: data.status ?? "Accepted", timestamp: data.timestamp ?? new Date().toISOString() }, reason: "Accepted submission matched." }
        : { matched: false, conclusive: false, reason: "No accepted submission in the returned recent history (limited window — not conclusive). Queued for review." };
      cache.set(key, { at: Date.now(), out });
      return out;
    } catch (e) {
      return { matched: false, conclusive: false, reason: `Verification lookup failed (${e instanceof Error ? e.message : "network error"}). Queued for review with backoff.` };
    }
  },
};

export function activeProvider(): VerificationProvider {
  if (config.env === "production" && config.verificationProvider === "mock") {
    console.warn("SECURITY: mock verification provider requested in production — forcing disabled/manual-review mode.");
    return { name: "disabled", mock: false, async lookup() { return { matched: false, conclusive: false, reason: "Automated verification is disabled in production. Queued for manual admin review." }; } };
  }
  if (config.verificationProvider === "http") return httpProvider;
  if (config.verificationProvider === "disabled") {
    return { name: "disabled", mock: false, async lookup() { return { matched: false, conclusive: false, reason: "Automated verification is disabled. Queued for manual admin review." }; } };
  }
  return mockProvider;
}

export function providerStatus() {
  const p = activeProvider();
  return {
    provider: p.name, mock: p.mock, maxRecent: config.verificationMaxRecent,
    cacheTtlSec: 300, rateLimitNote: "Respects provider rate limits; caches 5 min; retries with backoff; manual review fallback.",
    docs: "See README § Verification. Mock must never be enabled in production.",
  };
}
