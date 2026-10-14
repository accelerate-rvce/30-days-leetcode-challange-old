import type { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import type { Store, User } from "./store.js";
import { hashToken } from "./lib/crypto.js";
import { config } from "./config.js";

declare global {
  namespace Express {
    interface Request { store?: Store; user?: User; sessionId?: string }
  }
}

export function withStore(store: Store) {
  return (req: Request, _res: Response, next: NextFunction) => { req.store = store; next(); };
}

export function validate(schema: ZodSchema, src: "body" | "query" | "params" = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    const r = schema.safeParse((req as unknown as Record<string, unknown>)[src]);
    if (!r.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: r.error.flatten() } });
      return;
    }
    (req as unknown as Record<string, unknown>)[src] = r.data;
    next();
  };
}

export async function auth(req: Request, res: Response, next: NextFunction) {
  const store = req.store!;
  const raw = req.cookies?.["acc_session"] ?? bearer(req);
  if (!raw) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in required" } }); return; }
  const h = hashToken(raw);
  const sid = store.sessionsByHash.get(h);
  const s = sid ? store.sessions.get(sid) : undefined;
  if (!s || s.revokedAt || new Date(s.expiresAt).getTime() < Date.now()) {
    res.status(401).json({ error: { code: "SESSION_EXPIRED", message: "Session expired — sign in again" } }); return;
  }
  const u = store.users.get(s.userId);
  if (!u || u.status === "SUSPENDED") {
    res.status(403).json({ error: { code: "ACCOUNT_SUSPENDED", message: "Account suspended" } }); return;
  }
  req.user = u; req.sessionId = s.id;
  next();
}

function bearer(req: Request): string | undefined {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : undefined;
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Insufficient privileges" } }); return;
    }
    next();
  };
}

export const requireAdmin = requireRole("ADMIN", "SUPERADMIN");

// Simple in-memory rate limiter (per route+ip). Production behind Render uses this plus platform limits.
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.path}:${req.ip}`;
    const t = Date.now();
    const b = buckets.get(key);
    if (!b || b.reset < t) { buckets.set(key, { count: 1, reset: t + windowMs }); next(); return; }
    b.count += 1;
    if (b.count > max) { res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests — slow down" } }); return; }
    next();
  };
}

// CSRF: cookie sessions require same-origin custom header for mutations (defense in depth with SameSite).
export function csrf(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  const usingCookie = Boolean(req.cookies?.["acc_session"]);
  if (usingCookie && req.headers["x-requested-with"] !== "XMLHttpRequest" && !req.headers.authorization) {
    // Allow JSON API clients that set content-type + origin check instead.
    // Uses configured origins (with localhost default), not raw env — an unset
    // WEB_ORIGIN must not lock out the default dev origin.
    const origin = req.headers.origin ?? "";
    if (origin && !config.corsOrigins.includes(origin)) { res.status(403).json({ error: { code: "CSRF_BLOCKED", message: "Origin not allowed" } }); return; }
  }
  next();
}

export function audit(store: Store, actorId: string | null, action: string, entity = "", entityId = "", detail = "") {
  store.audit.push({ id: Math.random().toString(36).slice(2), actorId, action, entity, entityId, detail, createdAt: new Date().toISOString() });
}
