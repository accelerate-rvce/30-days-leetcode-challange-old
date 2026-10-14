import { Router } from "express";
import { z } from "zod";
import { auth, rateLimit, validate } from "../middleware.js";
import { audit } from "../middleware.js";
import { awardVerification } from "../lib/scoring.js";
import { activeProvider } from "../lib/verification.js";
import { config } from "../config.js";
import { nowIso, uid } from "../store.js";

export const completionRouter = Router();
completionRouter.use(auth);

/** Submit a verification claim. One completion per user+challenge (unique constraint). Idempotent on retry. */
completionRouter.post("/claims", rateLimit(20, 60_000), validate(z.object({ challengeId: z.string().min(1) })), async (req, res) => {
  const store = req.store!;
  const user = req.user!;
  const ch = store.challenges.get(String(req.body.challengeId));
  if (!ch || (ch.state !== "ACTIVE" && ch.state !== "ARCHIVED")) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Challenge is not open for verification" } }); return;
  }
  const key = `${user.id}:${ch.id}`;
  let c = store.completionKey.has(key) ? store.completions.get(store.completionKey.get(key)!)! : null;
  if (c?.status === "VERIFIED") {
    res.json({ completion: c, awarded: 0, duplicate: true, message: "Already verified — no additional points." }); return;
  }
  if (!c) {
    c = { id: uid(), userId: user.id, challengeId: ch.id, status: "PENDING", points: 0, evidence: "", failReason: "", attempts: 0, verifiedAt: null, solveTime: null, createdAt: nowIso(), updatedAt: nowIso() };
    store.completions.set(c.id, c);
    store.completionKey.set(key, c.id);
  }
  c.attempts += 1;
  c.updatedAt = nowIso();

  const provider = activeProvider();
  let outcome;
  try {
    outcome = await provider.lookup({ username: user.leetcodeUsername, slug: ch.slug, maxRecent: config.verificationMaxRecent });
  } catch (e) {
    outcome = { matched: false, conclusive: false, reason: `Provider error (${e instanceof Error ? e.message : "unknown"}). Queued for review.` };
  }

  if (outcome.matched && outcome.evidence) {
    c.evidence = JSON.stringify({ provider: provider.name, ...outcome.evidence });
    c.failReason = "";
    const { awarded } = awardVerification(store, user.id, ch, c, outcome.evidence.timestamp ?? null);
    audit(store, user.id, "completion.verified", "completion", c.id, `day ${ch.dayNumber} +${awarded}`);
    res.status(201).json({ completion: c, awarded, duplicate: false });
    return;
  }
  // No conclusive match: PENDING/MANUAL_REVIEW with useful reason — never award.
  c.status = "MANUAL_REVIEW";
  c.failReason = outcome.reason;
  c.updatedAt = nowIso();
  audit(store, user.id, "completion.claimed", "completion", c.id, `day ${ch.dayNumber}: ${outcome.reason}`);
  res.status(202).json({ completion: c, awarded: 0, duplicate: false, message: outcome.reason });
});

/** Retry a pending/review claim (backoff-friendly). */
completionRouter.post("/claims/:id/retry", rateLimit(10, 60_000), async (req, res) => {
  const store = req.store!;
  const user = req.user!;
  const c = store.completions.get(req.params.id);
  if (!c || c.userId !== user.id) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Claim not found" } }); return; }
  if (c.status === "VERIFIED") { res.json({ completion: c, awarded: 0, duplicate: true }); return; }
  const ch = store.challenges.get(c.challengeId)!;
  c.attempts += 1; c.updatedAt = nowIso();
  const provider = activeProvider();
  const outcome = await provider.lookup({ username: user.leetcodeUsername, slug: ch.slug, maxRecent: config.verificationMaxRecent });
  if (outcome.matched && outcome.evidence) {
    c.evidence = JSON.stringify({ provider: provider.name, ...outcome.evidence });
    c.failReason = "";
    const { awarded } = awardVerification(store, user.id, ch, c, outcome.evidence.timestamp ?? null);
    audit(store, user.id, "completion.verified", "completion", c.id, `retry day ${ch.dayNumber} +${awarded}`);
    res.json({ completion: c, awarded, duplicate: false });
    return;
  }
  c.status = "MANUAL_REVIEW"; c.failReason = outcome.reason; c.updatedAt = nowIso();
  res.status(202).json({ completion: c, awarded: 0, message: outcome.reason });
});

/** My completion history + stats. */
completionRouter.get("/mine", (req, res) => {
  const store = req.store!;
  const user = req.user!;
  const mine = [...store.completions.values()].filter((c) => c.userId === user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const withTitles = mine.map((c) => ({ ...c, challenge: store.challenges.get(c.challengeId) ?? null }));
  res.json({ data: withTitles });
});
