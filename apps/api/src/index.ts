import { config } from "./config.js";
import { createApp } from "./app.js";
import { reconcile, recordJob } from "./lib/jobs.js";

const { app, store } = createApp();

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
