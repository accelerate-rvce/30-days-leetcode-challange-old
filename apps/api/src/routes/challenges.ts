import { Router } from "express";
export const challengeRouter = Router();

// Public/participant challenge listing. Drafts & scheduled-future hidden from non-admins.
challengeRouter.get("/", (req, res) => {
  const store = req.store!;
  const isAdmin = req.user && (req.user.role === "ADMIN" || req.user.role === "SUPERADMIN");
  // attach optional auth (do not require)
  const all = [...store.challenges.values()].sort((a, b) => a.dayNumber - b.dayNumber);
  const visible = isAdmin ? all : all.filter((c) => c.state === "ACTIVE" || c.state === "ARCHIVED");
  res.json({
    data: visible.map((c) => ({
      id: c.id, dayNumber: c.dayNumber, title: c.title, slug: c.slug, leetcodeUrl: c.leetcodeUrl,
      difficulty: c.difficulty, topics: c.topics, state: c.state,
      publishAt: c.publishAt, archiveAt: c.archiveAt,
      activePoints: c.activePoints, archivedPoints: c.archivedPoints,
    })),
  });
});

// Today's challenge — selected by BACKEND time/state, never browser clock.
challengeRouter.get("/today", (req, res) => {
  const store = req.store!;
  const active = [...store.challenges.values()].filter((c) => c.state === "ACTIVE").sort((a, b) => a.dayNumber - b.dayNumber);
  const today = active.length ? active[active.length - 1] : null;
  const upcoming = [...store.challenges.values()]
    .filter((c) => c.state === "SCHEDULED" && c.publishAt && new Date(c.publishAt).getTime() > Date.now())
    .sort((a, b) => +new Date(a.publishAt!) - +new Date(b.publishAt!))[0] ?? null;
  let myStatus: string | null = null;
  if (req.user && today) {
    const key = store.completionKey.get(`${req.user.id}:${today.id}`);
    myStatus = key ? store.completions.get(key)!.status : "Not Started";
  }
  res.json({ today, upcoming, myStatus, serverTime: new Date().toISOString(), timezone: store.settings.timezone });
});

challengeRouter.get("/day/:n", (req, res) => {
  const store = req.store!;
  const n = Number(req.params.n);
  const id = store.challengesByDay.get(n);
  const c = id ? store.challenges.get(id) : undefined;
  if (!c) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Challenge not found" } }); return; }
  const isAdmin = req.user && (req.user.role === "ADMIN" || req.user.role === "SUPERADMIN");
  if (!isAdmin && (c.state === "DRAFT" || c.state === "SCHEDULED")) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Challenge not found" } }); return;
  }
  let mine = null;
  if (req.user) {
    const key = store.completionKey.get(`${req.user.id}:${c.id}`);
    if (key) { const cc = store.completions.get(key)!; mine = { status: cc.status, points: cc.points, attempts: cc.attempts, verifiedAt: cc.verifiedAt, failReason: cc.failReason }; }
    else mine = { status: "Not Started", points: 0, attempts: 0, verifiedAt: null, failReason: "" };
  }
  res.json({ challenge: c, mine });
});
