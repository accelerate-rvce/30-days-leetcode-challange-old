import type { PrismaClient } from "@prisma/client";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { reconcile, recordJob } from "./lib/jobs.js";
import { ensureBootstrapAdmin, seedDemo } from "./lib/init.js";

const { app, store } = createApp();

// Postgres persistence (STORE=prisma): serve from memory, snapshot to the DB.
// Load first so the rows below only fill gaps (idempotent).
let prisma: PrismaClient | null = null;
if (config.store === "prisma") {
  if (!config.databaseUrl) {
    console.error("STORE=prisma but DATABASE_URL is empty.");
    process.exit(1);
  }
  const { createPrisma, loadSnapshot } = await import("./lib/persist.js");
  prisma = await createPrisma();
  const counts = await loadSnapshot(prisma, store);
  console.log("Loaded snapshot from Postgres:", JSON.stringify(counts));
  const everyMs = Number(process.env.SNAPSHOT_INTERVAL_SEC ?? "60") * 1000;
  setInterval(async () => {
    try {
      await (await import("./lib/persist.js")).saveSnapshot(prisma!, store);
    } catch (e) {
      console.error("Snapshot save failed:", e);
    }
  }, everyMs);
  console.log(`Snapshotting to Postgres every ${everyMs / 1000}s (+ on shutdown).`);
}

if (config.isProd && process.env.SEED_DEMO === "1") {
  console.error("Refusing to start: SEED_DEMO=1 is not allowed in production.");
  process.exit(1);
}

// Demo data must live in the SERVER's own store: with STORE=memory each
// process has an isolated store, so seeding/creating users in a separate
// `npm run db:seed` / `npm run bootstrap` process can never affect the server.
if (process.env.SEED_DEMO === "1") {
  const r = await seedDemo(store);
  console.log(`Demo seed loaded: ${r.users} users, ${r.challenges} challenges (dev only — DEMO credentials, never production).`);
}

const boot = await ensureBootstrapAdmin(store);
if (boot === "created") console.log(`Bootstrap SUPERADMIN ready: ${config.bootstrapAdmin.email.trim().toLowerCase()}`);

// Reconcile overdue scheduled events on startup (Render may sleep/restart).
try {
  const r = reconcile(store, "startup");
  recordJob(store, "startup-reconcile", "ok", JSON.stringify(r));
  if (r.published.length || r.archived.length) console.log("Startup reconcile:", r);
} catch (e) {
  console.error("Startup reconcile failed:", e);
}

const server = app.listen(config.port, () => {
  console.log(`accelerate-api listening on :${config.port} (env=${config.env}, store=${config.store})`);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Shutting down…");
  if (prisma) {
    try {
      const { saveSnapshot } = await import("./lib/persist.js");
      await saveSnapshot(prisma, store);
      console.log("Final snapshot saved to Postgres.");
    } catch (e) {
      console.error("Final snapshot save failed:", e);
    }
    await prisma.$disconnect().catch(() => undefined);
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
