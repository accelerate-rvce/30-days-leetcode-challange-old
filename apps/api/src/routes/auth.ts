import { Router } from "express";
import { z } from "zod";
import { normalizeEmail, isRvceEmail, leetcodeUsernameSchema } from "@accelerate/shared";
import { hashPassword, verifyPassword, newToken, hashToken } from "../lib/crypto.js";
import { sendEmail } from "../lib/email.js";
import { auth, rateLimit, validate } from "../middleware.js";
import { audit } from "../middleware.js";
import { config } from "../config.js";
import { nowIso, sha256, uid } from "../store.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().min(3).max(254),
  leetcodeUsername: leetcodeUsernameSchema,
  password: z.string().min(10).max(128),
});

function setSessionCookie(res: Parameters<typeof auth>[1], raw: string) {
  res.cookie("acc_session", raw, {
    httpOnly: true, secure: config.cookieSecure || config.isProd,
    sameSite: config.cookieSameSite, path: "/", maxAge: config.sessionTtlHours * 3600 * 1000,
  });
}

function createSession(req: Parameters<typeof auth>[0], userId: string): string {
  const store = req.store!;
  const raw = newToken();
  const id = uid();
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000).toISOString();
  const s = { id, userId, tokenHash: hashToken(raw), expiresAt, revokedAt: null as string | null, ip: req.ip ?? "", userAgent: String(req.headers["user-agent"] ?? ""), createdAt: nowIso() };
  store.sessions.set(id, s);
  store.sessionsByHash.set(s.tokenHash, id);
  return raw;
}

// POST /auth/register
authRouter.post("/register", rateLimit(20, 60_000), validate(registerSchema), async (req, res) => {
  const store = req.store!;
  const { name, leetcodeUsername, password } = req.body as z.infer<typeof registerSchema>;
  const emailNorm = normalizeEmail(String(req.body.email));
  if (!isRvceEmail(emailNorm)) { res.status(400).json({ error: { code: "DOMAIN", message: "Only @rvce.edu.in addresses are accepted" } }); return; }
  const mode = store.settings.registrationMode;
  if (mode === "CLOSED") { res.status(403).json({ error: { code: "REGISTRATION_CLOSED", message: "Registration is closed" } }); return; }
  if (mode === "WAITLIST") {
    const wid = store.waitlistByNorm.get(emailNorm);
    const w = wid ? store.waitlist.get(wid) : undefined;
    if (!w || (w.status !== "APPROVED" && w.status !== "INVITED" && w.status !== "EMAIL_VERIFIED")) {
      res.status(403).json({ error: { code: "WAITLIST_ONLY", message: "Registration is waitlist-only. Join the waitlist first." } }); return;
    }
  }
  if (store.usersByNorm.has(emailNorm)) { res.status(409).json({ error: { code: "EMAIL_TAKEN", message: "An account with this email already exists" } }); return; }
  const passwordHash = await hashPassword(password);
  const id = uid();
  const displayName = name.trim();
  store.users.set(id, { id, email: emailNorm, emailNorm, name: displayName, displayName, leetcodeUsername: leetcodeUsername.trim(), passwordHash, role: "PARTICIPANT", status: "PENDING_VERIFICATION", emailVerifiedAt: null, createdAt: nowIso(), updatedAt: nowIso() });
  store.usersByNorm.set(emailNorm, id);
  // email verification token (single-use, expiring, hashed)
  const raw = newToken();
  store.emailTokens.set(hashToken(raw), { id: uid(), purpose: "verify-email", emailNorm, userId: id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), usedAt: null, createdAt: nowIso() });
  const link = `${config.webOrigin}/#/verify-email?token=${raw}`;
  const r = await sendEmail(emailNorm, "Verify your Accelerate account", `Hi ${displayName},\n\nVerify your email to continue:\n${link}\n\nThis link expires in 24 hours and can be used once.\n\n— Accelerate, RVCE`);
  audit(store, id, "auth.register", "user", id, emailNorm);
  res.status(201).json({ id, email: emailNorm, emailSent: r.sent, emailError: r.sent ? undefined : (r.error ?? "Email delivery not configured — ask an organizer for your verification link.") });
});

// POST /auth/verify-email
authRouter.post("/verify-email", rateLimit(30, 60_000), validate(z.object({ token: z.string().min(10) })), (req, res) => {
  const store = req.store!;
  const h = hashToken(String(req.body.token));
  const t = store.emailTokens.get(h);
  if (!t || t.purpose !== "verify-email" || t.usedAt || new Date(t.expiresAt).getTime() < Date.now()) {
    res.status(400).json({ error: { code: "INVALID_TOKEN", message: "Verification link is invalid or expired" } }); return;
  }
  t.usedAt = nowIso();
  const u = t.userId ? store.users.get(t.userId) : undefined;
  if (u) { u.emailVerifiedAt = nowIso(); if (u.status === "PENDING_VERIFICATION") u.status = "ACTIVE"; u.updatedAt = nowIso(); }
  // promote linked waitlist entry
  const wid = store.waitlistByNorm.get(t.emailNorm);
  if (wid) { const w = store.waitlist.get(wid)!; if (w.status === "PENDING" || w.status === "INVITED") { w.status = "EMAIL_VERIFIED"; w.updatedAt = nowIso(); } }
  audit(store, u?.id ?? null, "auth.verify-email", "user", u?.id ?? "", t.emailNorm);
  res.json({ ok: true });
});

// POST /auth/login
authRouter.post("/login", rateLimit(30, 60_000), validate(z.object({ email: z.string(), password: z.string() })), async (req, res) => {
  const store = req.store!;
  const emailNorm = normalizeEmail(String(req.body.email));
  const id = store.usersByNorm.get(emailNorm);
  const u = id ? store.users.get(id) : undefined;
  // constant-ish failure path (anti-enumeration: same message either way)
  if (!u || !(await verifyPassword(String(req.body.password), u.passwordHash))) {
    res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } }); return;
  }
  if (u.status === "SUSPENDED") { res.status(403).json({ error: { code: "ACCOUNT_SUSPENDED", message: "Account suspended — contact an organizer" } }); return; }
  const raw = createSession(req, u.id);
  setSessionCookie(res, raw);
  audit(store, u.id, "auth.login", "user", u.id, "");
  res.json({ user: publicUser(u), token: raw });
});

// POST /auth/logout
authRouter.post("/logout", auth, (req, res) => {
  const store = req.store!;
  if (req.sessionId) {
    const s = store.sessions.get(req.sessionId);
    if (s) { s.revokedAt = nowIso(); store.sessionsByHash.delete(s.tokenHash); }
  }
  res.clearCookie("acc_session", { path: "/" });
  res.json({ ok: true });
});

// GET /auth/me
authRouter.get("/me", auth, (req, res) => { res.json({ user: publicUser(req.user!) }); });

// POST /auth/forgot-password — always generic 200 (anti-enumeration)
authRouter.post("/forgot-password", rateLimit(10, 60_000), validate(z.object({ email: z.string() })), async (req, res) => {
  const store = req.store!;
  const emailNorm = normalizeEmail(String(req.body.email));
  const id = store.usersByNorm.get(emailNorm);
  if (id) {
    const raw = newToken();
    store.emailTokens.set(hashToken(raw), { id: uid(), purpose: "password-reset", emailNorm, userId: id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), usedAt: null, createdAt: nowIso() });
    const link = `${config.webOrigin}/#/reset-password?token=${raw}`;
    await sendEmail(emailNorm, "Reset your Accelerate password", `Reset your password (expires in 1 hour, single use):\n${link}\n\nIf you did not request this, ignore this email.\n\n— Accelerate, RVCE`);
    audit(store, id, "auth.forgot-password", "user", id, "");
  }
  res.json({ ok: true, message: "If an account exists for this email, a reset link has been sent." });
});

// POST /auth/reset-password
authRouter.post("/reset-password", rateLimit(20, 60_000), validate(z.object({ token: z.string().min(10), password: z.string().min(10).max(128) })), async (req, res) => {
  const store = req.store!;
  const h = hashToken(String(req.body.token));
  const t = store.emailTokens.get(h);
  if (!t || t.purpose !== "password-reset" || t.usedAt || new Date(t.expiresAt).getTime() < Date.now() || !t.userId) {
    res.status(400).json({ error: { code: "INVALID_TOKEN", message: "Reset link is invalid or expired" } }); return;
  }
  const u = store.users.get(t.userId);
  if (!u) { res.status(400).json({ error: { code: "INVALID_TOKEN", message: "Reset link is invalid or expired" } }); return; }
  t.usedAt = nowIso();
  u.passwordHash = await hashPassword(String(req.body.password));
  u.updatedAt = nowIso();
  // revoke all sessions for safety
  for (const s of store.sessions.values()) if (s.userId === u.id && !s.revokedAt) { s.revokedAt = nowIso(); store.sessionsByHash.delete(s.tokenHash); }
  audit(store, u.id, "auth.reset-password", "user", u.id, "sessions revoked");
  res.json({ ok: true });
});

// POST /auth/sessions/revoke-all
authRouter.post("/sessions/revoke-all", auth, (req, res) => {
  const store = req.store!;
  let n = 0;
  for (const s of store.sessions.values()) if (s.userId === req.user!.id && !s.revokedAt) { s.revokedAt = nowIso(); store.sessionsByHash.delete(s.tokenHash); n++; }
  res.clearCookie("acc_session", { path: "/" });
  res.json({ ok: true, revoked: n });
});

function publicUser(u: { id: string; email: string; name: string; displayName: string; leetcodeUsername: string; role: string; status: string; emailVerifiedAt: string | null; createdAt: string }) {
  return { id: u.id, email: u.email, name: u.name, displayName: u.displayName, leetcodeUsername: u.leetcodeUsername, role: u.role, status: u.status, emailVerifiedAt: u.emailVerifiedAt, createdAt: u.createdAt };
}
export { sha256 };
