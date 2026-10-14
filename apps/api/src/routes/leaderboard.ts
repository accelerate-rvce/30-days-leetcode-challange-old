import { Router } from "express";
import { buildLeaderboard } from "../lib/scoring.js";

export const leaderboardRouter = Router();

function paginate<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), totalPages);
  return { data: rows.slice((p - 1) * pageSize, p * pageSize), page: p, pageSize, total, totalPages };
}

leaderboardRouter.get("/", (req, res) => {
  const store = req.store!;
  const page = Number(req.query.page ?? 1);
  const pageSize = Math.min(Number(req.query.pageSize ?? 20), 100);
  const q = String(req.query.q ?? "").trim().toLowerCase();
  let rows = buildLeaderboard(store).map(({ userId, ...pub }) => pub);
  if (q) rows = rows.filter((r) => r.displayName.toLowerCase().includes(q) || r.leetcodeUsername.toLowerCase().includes(q));
  res.json(paginate(rows, page, pageSize));
});

// Signed-in user's own rank (attaches best-effort)
leaderboardRouter.get("/me", (req, res) => {
  const store = req.store!;
  if (!req.user) { res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Sign in required" } }); return; }
  const rows = buildLeaderboard(store);
  const mine = rows.find((r) => r.userId === req.user!.id) ?? null;
  res.json({ rank: mine });
});

// Public participant profile + challenge history (no private data)
leaderboardRouter.get("/users/:username", (req, res) => {
  const store = req.store!;
  const uname = String(req.params.username).toLowerCase();
  const u = [...store.users.values()].find((x) => x.leetcodeUsername.toLowerCase() === uname && x.role === "PARTICIPANT");
  if (!u) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Participant not found" } }); return; }
  const rows = buildLeaderboard(store);
  const rank = rows.find((r) => r.userId === u.id) ?? null;
  const history = [...store.completions.values()]
    .filter((c) => c.userId === u.id && c.status === "VERIFIED")
    .map((c) => { const ch = store.challenges.get(c.challengeId); return ch ? { dayNumber: ch.dayNumber, title: ch.title, difficulty: ch.difficulty, points: c.points, verifiedAt: c.verifiedAt } : null; })
    .filter(Boolean)
    .sort((a, b) => (a!.dayNumber - b!.dayNumber));
  res.json({ profile: { displayName: u.displayName, leetcodeUsername: u.leetcodeUsername, createdAt: u.createdAt }, rank, history });
});
