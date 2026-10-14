import { createApp } from "./app.js";
import { seedDemo } from "./lib/init.js";

/**
 * Dev seed: realistic demo data, clearly marked DEMO. Never used in production.
 *
 * NOTE: with STORE=memory (default) every process owns an isolated store,
 * so rows seeded here vanish when this process exits. For local dev, start
 * the server with SEED_DEMO=1 instead — index.ts seeds the server's own
 * store at boot. This script remains useful as a seed smoke check.
 */
async function main() {
  const { store } = createApp();
  const r = await seedDemo(store);
  console.log(`Seeded DEMO data (admin@rvce.edu.in / Password123!): ${r.users} users, ${r.challenges} challenges.`);
  if (process.env.STORE !== "prisma") {
    console.log("NOTE: STORE=memory — these rows exist only in this exited process.");
    console.log("Run the dev server with SEED_DEMO=1 to log in with the demo admin:");
    console.log("  SEED_DEMO=1 npm run dev:api");
  }
  process.exit(0);
}
main();
