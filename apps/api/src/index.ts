import { config } from "./config.js";
import { createApp } from "./app.js";
import { reconcile, recordJob } from "./lib/jobs.js";
import { ensureBootstrapAdmin, seedDemo } from "./lib/init.js";

const { app, store } = createApp();

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

function shutdown() {
  console.log("Shutting down…");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
