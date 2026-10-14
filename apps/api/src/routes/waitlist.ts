import { Router } from "express";
import { z } from "zod";
import { normalizeEmail, isRvceEmail, leetcodeUsernameSchema } from "@accelerate/shared";
import { newToken, hashToken } from "../lib/crypto.js";
import { sendEmail } from "../lib/email.js";
import { rateLimit, validate, audit } from "../middleware.js";
import { config } from "../config.js";
import { nowIso, uid } from "../store.js";

export const waitlistRouter = Router();

const joinSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().min(3).max(254),
  leetcodeUsername: leetcodeUsernameSchema,
  consent: z.literal(true),
});

// POST /waitlist — join. Generic success to resist enumeration; 403 when registration CLOSED.
waitlistRouter.post("/", rateLimit(15, 60_000), validate(joinSchema), async (req, res) => {
  const store = req.store!;
  if (store.settings.registrationMode === "CLOSED") {
    res.status(403).json({ error: { code: "REGISTRATION_CLOSED", message: "Registration is currently closed" } }); return;
  }
  const b = req.body as z.infer<typeof joinSchema>;
  const emailNorm = normalizeEmail(b.email);
  if (!isRvceEmail(emailNorm)) { res.status(400).json({ error: { code: "DOMAIN", message: "Only @rvce.edu.in addresses are accepted" } }); return; }
  if (store.usersByNorm.has(emailNorm)) {
    // Do not reveal account existence beyond what register already does; return ok + status hint.
    res.status(201).json({ ok: true, status: "ACCOUNT_EXISTS", message: "You're already registered — try signing in." }); return;
  }
  const existingId = store.waitlistByNorm.get(emailNorm);
  if (existingId) {
    const w = store.waitlist.get(existingId)!;
    res.status(201).json({ ok: true, status: w.status, message: "You're on the list.", id: w.id }); return;
  }
  const id = uid();
  store.waitlist.set(id, { id, email: emailNorm, emailNorm, name: b.name.trim(), leetcodeUsername: b.leetcodeUsername.trim(), consent: true, status: "PENDING", invitedAt: null, decidedAt: null, decidedBy: null, createdAt: nowIso(), updatedAt: nowIso() });
  store.waitlistByNorm.set(emailNorm, id);
  // ownership verification token (single-use, 48h, hashed)
  const raw = newToken();
  store.emailTokens.set(hashToken(raw), { id: uid(), purpose: "waitlist-verify", emailNorm, userId: null, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(), usedAt: null, createdAt: nowIso() });
  const link = `${config.webOrigin}/#/waitlist/verify?token=${raw}`;
  const r = await sendEmail(emailNorm, "Confirm your Accelerate waitlist spot", `Hi ${b.name.trim()},\n\nConfirm your waitlist registration:\n${link}\n\nExpires in 48 hours, single use.\n\n— Accelerate, RVCE`);
  audit(store, null, "waitlist.join", "waitlist", id, emailNorm);
  res.status(201).json({ ok: true, status: "PENDING", id, emailSent: r.sent, emailError: r.sent ? undefined : "Email delivery is not configured — your spot is saved; an organizer will confirm." });
});

// POST /waitlist/verify
waitlistRouter.post("/verify", rateLimit(30, 60_000), validate(z.object({ token: z.string().min(10) })), (req, res) => {
  const store = req.store!;
  const h = hashToken(String(req.body.token));
  const t = store.emailTokens.get(h);
  if (!t || t.purpose !== "waitlist-verify" || t.usedAt || new Date(t.expiresAt).getTime() < Date.now()) {
    res.status(400).json({ error: { code: "INVALID_TOKEN", message: "Verification link is invalid or expired" } }); return;
  }
  t.usedAt = nowIso();
  const wid = store.waitlistByNorm.get(t.emailNorm);
  if (!wid) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Waitlist entry not found" } }); return; }
  const w = store.waitlist.get(wid)!;
  if (w.status === "PENDING") { w.status = "EMAIL_VERIFIED"; w.updatedAt = nowIso(); }
  audit(store, null, "waitlist.verify", "waitlist", wid, t.emailNorm);
  res.json({ ok: true, status: w.status });
});

// GET /waitlist/status?email= — rate-limited status lookup
waitlistRouter.get("/status", rateLimit(20, 60_000), (req, res) => {
  const store = req.store!;
  const emailNorm = normalizeEmail(String(req.query.email ?? ""));
  if (!emailNorm || !emailNorm.includes("@")) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Provide ?email=" } }); return; }
  if (store.usersByNorm.has(emailNorm)) { res.json({ status: "ACCOUNT_EXISTS", email: emailNorm }); return; }
  const wid = store.waitlistByNorm.get(emailNorm);
  if (!wid) { res.json({ status: "NOT_FOUND", email: emailNorm }); return; }
  const w = store.waitlist.get(wid)!;
  res.json({ status: w.status, email: w.email, name: w.name, updatedAt: w.updatedAt });
});
