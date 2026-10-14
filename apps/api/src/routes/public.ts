import { Router } from "express";
import { providerStatus } from "../lib/verification.js";
import { emailStatus } from "../lib/email.js";

export const publicRouter = Router();

// Public event settings (safe subset) + countdown support
publicRouter.get("/event", (req, res) => {
  const store = req.store!;
  const s = store.settings;
  const nowT = Date.now();
  const start = s.startDate ? new Date(s.startDate).getTime() : null;
  const end = s.endDate ? new Date(s.endDate).getTime() : null;
  const phase = start && nowT < start ? "UPCOMING" : end && nowT > end ? "ENDED" : start ? "LIVE" : "TBA";
  res.json({
    eventName: s.eventName, description: s.description,
    startDate: s.startDate, endDate: s.endDate, timezone: s.timezone,
    registrationMode: s.registrationMode, phase, serverTime: new Date().toISOString(),
    activePoints: s.activePoints, archivedPoints: s.archivedPoints,
  });
});

publicRouter.get("/verification", (_req, res) => {
  res.json({ ...providerStatus(), email: emailStatus() });
});

// Participant profile (own private data only)
publicRouter.get("/profile", (req, res) => {
  if (!req.user) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in required" } }); return; }
  const u = req.user;
  res.json({ profile: { id: u.id, email: u.email, name: u.name, displayName: u.displayName, leetcodeUsername: u.leetcodeUsername, role: u.role, status: u.status } });
});

publicRouter.put("/profile", async (req, res) => {
  const store = req.store!;
  if (!req.user) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in required" } }); return; }
  const { updateProfileSchema } = await import("@accelerate/shared");
  const r = updateProfileSchema.safeParse(req.body);
  if (!r.success) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid profile", details: r.error.flatten() } }); return; }
  const u = store.users.get(req.user.id)!;
  if (r.data.name) { u.name = r.data.name; u.displayName = r.data.name; }
  if (r.data.leetcodeUsername) u.leetcodeUsername = r.data.leetcodeUsername;
  u.updatedAt = new Date().toISOString();
  res.json({ profile: { id: u.id, email: u.email, name: u.name, displayName: u.displayName, leetcodeUsername: u.leetcodeUsername } });
});
