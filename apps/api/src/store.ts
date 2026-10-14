import { randomUUID, createHash } from "node:crypto";

export type Role = "PARTICIPANT" | "ADMIN" | "SUPERADMIN";
export type AccountStatus = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";
export type WaitlistStatus = "PENDING" | "EMAIL_VERIFIED" | "APPROVED" | "REJECTED" | "INVITED";
export type ChallengeState = "DRAFT" | "SCHEDULED" | "ACTIVE" | "ARCHIVED";
export type ClaimStatus = "PENDING" | "VERIFIED" | "NOT_VERIFIED" | "MANUAL_REVIEW";

export interface User {
  id: string; email: string; emailNorm: string; name: string; displayName: string;
  leetcodeUsername: string; passwordHash: string; role: Role; status: AccountStatus;
  emailVerifiedAt: string | null; createdAt: string; updatedAt: string;
}
export interface WaitlistEntry {
  id: string; email: string; emailNorm: string; name: string; leetcodeUsername: string;
  consent: boolean; status: WaitlistStatus; invitedAt: string | null;
  decidedAt: string | null; decidedBy: string | null; createdAt: string; updatedAt: string;
}
export interface Challenge {
  id: string; dayNumber: number; title: string; slug: string; leetcodeUrl: string;
  difficulty: string; topics: string[]; state: ChallengeState;
  publishAt: string | null; archiveAt: string | null;
  activePoints: number; archivedPoints: number;
  publishedAt: string | null; archivedAt: string | null;
  createdAt: string; updatedAt: string;
}
export interface Completion {
  id: string; userId: string; challengeId: string; status: ClaimStatus;
  points: number; evidence: string; failReason: string; attempts: number;
  verifiedAt: string | null; solveTime: string | null; createdAt: string; updatedAt: string;
}
export interface LedgerEntry { id: string; userId: string; challengeId: string | null; delta: number; reason: string; actorId: string | null; createdAt: string; }
export interface Session { id: string; userId: string; tokenHash: string; expiresAt: string; revokedAt: string | null; ip: string; userAgent: string; createdAt: string; }
export interface EmailToken { id: string; purpose: string; emailNorm: string; userId: string | null; tokenHash: string; expiresAt: string; usedAt: string | null; createdAt: string; }
export interface AuditLog { id: string; actorId: string | null; action: string; entity: string; entityId: string; detail: string; createdAt: string; }
export interface ChallengeHistory { id: string; challengeId: string; actorId: string | null; action: string; detail: string; createdAt: string; }
export interface EventSettings {
  eventName: string; description: string; startDate: string | null; endDate: string | null;
  timezone: string; registrationMode: "WAITLIST" | "OPEN" | "CLOSED";
  activePoints: number; archivedPoints: number;
}
export interface JobRun { id: string; job: string; status: string; detail: string; createdAt: string; }

const now = () => new Date().toISOString();
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function createStore() {
  const users = new Map<string, User>();
  const usersByNorm = new Map<string, string>();
  const waitlist = new Map<string, WaitlistEntry>();
  const waitlistByNorm = new Map<string, string>();
  const challenges = new Map<string, Challenge>();
  const challengesByDay = new Map<number, string>();
  const challengesBySlug = new Map<string, string>();
  const completions = new Map<string, Completion>();
  const completionKey = new Map<string, string>(); // userId:challengeId -> id
  const ledger: LedgerEntry[] = [];
  const sessions = new Map<string, Session>(); // by id
  const sessionsByHash = new Map<string, string>();
  const emailTokens = new Map<string, EmailToken>(); // by tokenHash
  const audit: AuditLog[] = [];
  const history: ChallengeHistory[] = [];
  const jobs: JobRun[] = [];
  let settings: EventSettings = {
    eventName: "30 Days of LeetCode", description: "A 30-day competitive programming challenge by Accelerate, the Computer Science Club of RVCE.",
    startDate: null, endDate: null, timezone: "Asia/Kolkata",
    registrationMode: (process.env.REGISTRATION_MODE as EventSettings["registrationMode"]) || "WAITLIST",
    activePoints: 100, archivedPoints: 25,
  };

  return {
    users, usersByNorm, waitlist, waitlistByNorm, challenges, challengesByDay,
    challengesBySlug, completions, completionKey, ledger, sessions, sessionsByHash,
    emailTokens, audit, history, jobs,
    get settings() { return settings; },
    setSettings(s: EventSettings) { settings = s; },
  };
}

export type Store = ReturnType<typeof createStore>;
export const uid = () => randomUUID();
export const nowIso = now;
