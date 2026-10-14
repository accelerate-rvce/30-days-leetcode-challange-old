-- Accelerate initial migration (PostgreSQL)
CREATE TYPE "Role" AS ENUM ('PARTICIPANT','ADMIN','SUPERADMIN');
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_VERIFICATION','ACTIVE','SUSPENDED');
CREATE TYPE "WaitlistStatus" AS ENUM ('PENDING','EMAIL_VERIFIED','APPROVED','REJECTED','INVITED');
CREATE TYPE "ChallengeState" AS ENUM ('DRAFT','SCHEDULED','ACTIVE','ARCHIVED');
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING','VERIFIED','NOT_VERIFIED','MANUAL_REVIEW');

CREATE TABLE "User" (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, "emailNorm" TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL, "displayName" TEXT NOT NULL, "leetcodeUsername" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL, role "Role" NOT NULL DEFAULT 'PARTICIPANT',
  status "AccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "emailVerifiedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_role_status ON "User"(role, status);
CREATE INDEX user_leetcode ON "User"("leetcodeUsername");

CREATE TABLE "WaitlistEntry" (
  id TEXT PRIMARY KEY, email TEXT NOT NULL, "emailNorm" TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL, "leetcodeUsername" TEXT NOT NULL, consent BOOLEAN NOT NULL DEFAULT false,
  status "WaitlistStatus" NOT NULL DEFAULT 'PENDING',
  "invitedAt" TIMESTAMPTZ, "decidedAt" TIMESTAMPTZ, "decidedBy" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX waitlist_status ON "WaitlistEntry"(status, "createdAt");

CREATE TABLE "Challenge" (
  id TEXT PRIMARY KEY, "dayNumber" INTEGER UNIQUE NOT NULL, title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, "leetcodeUrl" TEXT NOT NULL, difficulty TEXT NOT NULL,
  topics TEXT[] NOT NULL DEFAULT '{}', state "ChallengeState" NOT NULL DEFAULT 'DRAFT',
  "publishAt" TIMESTAMPTZ, "archiveAt" TIMESTAMPTZ, "activePoints" INTEGER NOT NULL DEFAULT 100,
  "archivedPoints" INTEGER NOT NULL DEFAULT 25,
  "publishedAt" TIMESTAMPTZ, "archivedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX challenge_state_day ON "Challenge"(state, "dayNumber");

CREATE TABLE "ChallengeHistory" (
  id TEXT PRIMARY KEY, "challengeId" TEXT NOT NULL REFERENCES "Challenge"(id) ON DELETE CASCADE,
  "actorId" TEXT, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "Completion" (
  id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "challengeId" TEXT NOT NULL REFERENCES "Challenge"(id) ON DELETE CASCADE,
  status "ClaimStatus" NOT NULL DEFAULT 'PENDING', points INTEGER NOT NULL DEFAULT 0,
  evidence TEXT NOT NULL DEFAULT '', "failReason" TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 1,
  "verifiedAt" TIMESTAMPTZ, "solveTime" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("userId","challengeId")
);
CREATE INDEX completion_status ON "Completion"(status, "updatedAt");

CREATE TABLE "ScoreLedger" (
  id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "challengeId" TEXT, delta INTEGER NOT NULL, reason TEXT NOT NULL, "actorId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_user ON "ScoreLedger"("userId", "createdAt");

CREATE TABLE "Session" (
  id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "tokenHash" TEXT UNIQUE NOT NULL, "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ, ip TEXT NOT NULL DEFAULT '', "userAgent" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "EmailToken" (
  id TEXT PRIMARY KEY, purpose TEXT NOT NULL, "emailNorm" TEXT NOT NULL, "userId" TEXT,
  "tokenHash" TEXT UNIQUE NOT NULL, "expiresAt" TIMESTAMPTZ NOT NULL, "usedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX emailtoken_lookup ON "EmailToken"("emailNorm", purpose);

CREATE TABLE "AuditLog" (
  id TEXT PRIMARY KEY, "actorId" TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  action TEXT NOT NULL, entity TEXT NOT NULL DEFAULT '', "entityId" TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "EventSettings" (
  id TEXT PRIMARY KEY, "eventName" TEXT NOT NULL DEFAULT '30 Days of LeetCode',
  description TEXT NOT NULL DEFAULT '', "startDate" TIMESTAMPTZ, "endDate" TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata', "registrationMode" TEXT NOT NULL DEFAULT 'WAITLIST',
  "activePoints" INTEGER NOT NULL DEFAULT 100, "archivedPoints" INTEGER NOT NULL DEFAULT 25,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO "EventSettings"(id) VALUES ('singleton') ON CONFLICT DO NOTHING;

CREATE TABLE "JobRun" (
  id TEXT PRIMARY KEY, job TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
