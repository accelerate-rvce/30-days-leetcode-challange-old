import { createApp } from "./app.js";
import { ensureBootstrapAdmin } from "./lib/init.js";
import { config } from "./config.js";

/**
 * Secure bootstrap: seeds the SUPERADMIN from env credentials only.
 * Never hardcodes passwords.
 *
 * NOTE: with STORE=memory (default) every process owns an isolated store,
 * so a user created here vanishes when this process exits. For local dev,
 * set BOOTSTRAP_ADMIN_EMAIL/PASSWORD when STARTING the server instead —
 * index.ts runs this same bootstrap at boot. This script remains useful as
 * a credential check and for a future persistent backend.
 */
async function main() {
  const { email } = config.bootstrapAdmin;
  if (!email || !config.bootstrapAdmin.password) {
    console.error("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD env vars.");
    process.exit(1);
  }
  const { store } = createApp();
  const r = await ensureBootstrapAdmin(store);
  if (r === "exists") console.log("Bootstrap admin already exists.");
  else console.log(`Superadmin created: ${email.trim().toLowerCase()}`);
  if (config.store === "memory") {
    console.log("NOTE: STORE=memory — this account exists only in this exited process.");
    console.log("Start the server with the same env vars so the bootstrap runs at boot:");
    console.log("  BOOTSTRAP_ADMIN_EMAIL=you@rvce.edu.in BOOTSTRAP_ADMIN_PASSWORD='<strong>' npm run dev:api");
  }
  process.exit(0);
}
main();
