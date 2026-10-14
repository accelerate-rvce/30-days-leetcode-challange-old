import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { config } from "./config.js";
import { createStore, type Store } from "./store.js";
import { withStore, csrf } from "./middleware.js";
import { hashToken } from "./lib/crypto.js";
import { authRouter } from "./routes/auth.js";
import { waitlistRouter } from "./routes/waitlist.js";
import { challengeRouter } from "./routes/challenges.js";
import { completionRouter } from "./routes/completions.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { adminRouter, superRouter } from "./routes/admin.js";
import { publicRouter } from "./routes/public.js";
import { reconcile, recordJob } from "./lib/jobs.js";
import { openapiDoc } from "./openapi.js";

export function createApp(store: Store = createStore()) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParser());
  app.use(withStore(store));
  app.use(csrf);
  // best-effort optional auth: attaches req.user when a valid session exists, never rejects
  app.use((req, _res, next) => {
    const raw = req.cookies?.["acc_session"] ?? (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined);
    if (raw && !req.user) {
      const sid = store.sessionsByHash.get(hashToken(raw));
      const s = sid ? store.sessions.get(sid) : undefined;
      if (s && !s.revokedAt && new Date(s.expiresAt).getTime() > Date.now()) {
        const u = store.users.get(s.userId);
        if (u && u.status !== "SUSPENDED") { req.user = u; req.sessionId = s.id; }
      }
    }
    next();
  });

  app.get("/health", (_req, res) => res.json({ ok: true, service: "accelerate-api", time: new Date().toISOString() }));
  app.get("/ready", (_req, res) => res.json({ ok: true, store: "ok", database: config.store === "prisma" ? (config.databaseUrl ? "configured" : "missing-DATABASE_URL") : "memory", time: new Date().toISOString() }));
  app.get("/api/v1/openapi.json", (_req, res) => res.json(openapiDoc));

  const v1 = express.Router();
  v1.use("/auth", authRouter);
  v1.use("/waitlist", waitlistRouter);
  v1.use("/challenges", challengeRouter);
  v1.use("/completions", completionRouter);
  v1.use("/leaderboard", leaderboardRouter);
  v1.use("/admin", adminRouter);
  v1.use("/super", superRouter);
  v1.use("/", publicRouter);

  // Protected job endpoint for external scheduler (Render cron / GH Actions).
  v1.post("/jobs/run", (req, res) => {
    if (req.headers["x-job-secret"] !== config.jobSecret) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Invalid job secret" } }); return;
    }
    const r = reconcile(store, "cron");
    recordJob(store, "publish-archive", "ok", JSON.stringify(r));
    res.json({ ok: true, ...r, at: new Date().toISOString() });
  });
  v1.get("/jobs", (req, res) => {
    if (!req.user || (req.user.role !== "ADMIN" && req.user.role !== "SUPERADMIN")) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Admins only" } }); return;
    }
    res.json({ data: store.jobs.slice(-50).reverse() });
  });

  app.use("/api/v1", v1);
  // 404 + error handlers
  app.use((_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong" } });
  });
  return { app, store };
}
