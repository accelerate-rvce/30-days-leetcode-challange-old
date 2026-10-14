import { hashPassword } from "./lib/crypto.js";
import { createApp } from "./app.js";
import { nowIso, uid } from "./store.js";
import { config } from "./config.js";

/** Secure bootstrap: seeds the SUPERADMIN only from env credentials. Never hardcodes passwords. */
async function main() {
  const { store } = createApp();
  const { email, password, name } = config.bootstrapAdmin;
  if (!email || !password) {
    console.error("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD env vars.");
    process.exit(1);
  }
  const emailNorm = email.trim().toLowerCase();
  const existing = store.usersByNorm.get(emailNorm);
  if (existing) { console.log("Bootstrap admin already exists."); process.exit(0); }
  const id = uid();
  store.users.set(id, {
    id, email: emailNorm, emailNorm, name, displayName: name, leetcodeUsername: "admin",
    passwordHash: await hashPassword(password), role: "SUPERADMIN", status: "ACTIVE",
    emailVerifiedAt: nowIso(), createdAt: nowIso(), updatedAt: nowIso(),
  });
  store.usersByNorm.set(emailNorm, id);
  console.log(`Superadmin created: ${emailNorm}`);
  process.exit(0);
}
main();
