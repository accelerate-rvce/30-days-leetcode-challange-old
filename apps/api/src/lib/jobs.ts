import type { Store } from "../store.js";
import { nowIso, uid } from "../store.js";

/**
 * Publication + archival reconciliation. IDEMPOTENT: safe to run repeatedly.
 * - Publishes SCHEDULED challenges whose publishAt <= now (one ACTIVE at a time; latest day wins).
 * - Archives ACTIVE challenges whose archiveAt <= now.
 * Designed to be invoked by an external scheduler (Render cron / GitHub Actions) via
 * POST /api/v1/jobs/run, AND on server startup. Never relies solely on in-memory timers.
 */
export function reconcile(store: Store, actor = "scheduler"): { published: string[]; archived: string[] } {
  const t = Date.now();
  const published: string[] = [];
  const archived: string[] = [];
  const due = [...store.challenges.values()]
    .filter((c) => c.state === "SCHEDULED" && c.publishAt && new Date(c.publishAt).getTime() <= t)
    .sort((a, b) => a.dayNumber - b.dayNumber);
  for (const c of due) {
    for (const o of store.challenges.values()) {
      if (o.state === "ACTIVE" && o.id !== c.id) { o.state = "ARCHIVED"; o.archivedAt = nowIso(); archived.push(o.id); }
    }
    c.state = "ACTIVE"; c.publishedAt = nowIso(); c.updatedAt = nowIso();
    store.history.push({ id: uid(), challengeId: c.id, actorId: null, action: "auto-published", detail: `by ${actor}`, createdAt: nowIso() });
    published.push(c.id);
  }
  for (const c of [...store.challenges.values()]) {
    if (c.state === "ACTIVE" && c.archiveAt && new Date(c.archiveAt).getTime() <= t) {
      c.state = "ARCHIVED"; c.archivedAt = nowIso(); c.updatedAt = nowIso();
      store.history.push({ id: uid(), challengeId: c.id, actorId: null, action: "auto-archived", detail: `by ${actor}`, createdAt: nowIso() });
      archived.push(c.id);
    }
  }
  return { published, archived };
}

export function recordJob(store: Store, job: string, status: string, detail: string) {
  const run = { id: uid(), job, status, detail, createdAt: nowIso() };
  store.jobs.push(run);
  return run;
}
