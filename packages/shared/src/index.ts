import { z } from "zod";

export const RVCE_DOMAIN = "rvce.edu.in";
export const EVENT_TIMEZONE = "Asia/Kolkata";

/** Normalize email: trim + lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isRvceEmail(email: string): boolean {
  const n = normalizeEmail(email);
  return /^[^\s@]+@rvce\.edu\.in$/.test(n);
}

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .transform((s) => s.toLowerCase())
  .refine((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), "Invalid email address");

export const rvceEmailSchema = emailSchema.refine((s) => s.endsWith(`@${RVCE_DOMAIN}`), {
  message: `Email must end with @${RVCE_DOMAIN}`,
});

export const leetcodeUsernameSchema = z
  .string()
  .trim()
  .min(1, "LeetCode username is required")
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, _ and - only");

export const waitlistSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(120),
  email: rvceEmailSchema,
  leetcodeUsername: leetcodeUsernameSchema,
  consent: z.literal(true, { errorMap: () => ({ message: "Privacy consent is required" }) }),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: rvceEmailSchema,
  leetcodeUsername: leetcodeUsernameSchema,
  password: z.string().min(10, "Password must be at least 10 characters").max(128),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(10).max(128),
});
export const verifyEmailSchema = z.object({ token: z.string().min(10) });

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  leetcodeUsername: leetcodeUsernameSchema.optional(),
});

export type Role = "PARTICIPANT" | "ADMIN" | "SUPERADMIN";
export type RegistrationMode = "WAITLIST" | "OPEN" | "CLOSED";
export type ChallengeState = "DRAFT" | "SCHEDULED" | "ACTIVE" | "ARCHIVED";
export type Difficulty = "Easy" | "Medium" | "Hard";
export type ClaimStatus = "PENDING" | "VERIFIED" | "NOT_VERIFIED" | "MANUAL_REVIEW";

export const difficultySchema = z.enum(["Easy", "Medium", "Hard"]);

export const challengeInputSchema = z.object({
  dayNumber: z.number().int().min(1).max(30),
  title: z.string().trim().min(2).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, hyphens")
    .optional(),
  leetcodeUrl: z.string().trim().url("Enter a valid LeetCode URL"),
  difficulty: difficultySchema,
  topics: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  publishAt: z.string().datetime({ offset: true }),
  archiveAt: z.string().datetime({ offset: true }).optional(),
  activePoints: z.number().int().min(0).max(1000).default(100),
  archivedPoints: z.number().int().min(0).max(1000).default(25),
});

export const claimSchema = z.object({
  challengeId: z.string().min(1),
});

export const reviewClaimSchema = z.object({
  decision: z.enum(["VERIFIED", "NOT_VERIFIED"]),
  reason: z.string().trim().min(3).max(500),
  awardPoints: z.number().int().min(0).max(1000).optional(),
});

export const adjustPointsSchema = z.object({
  userId: z.string().min(1),
  delta: z.number().int().min(-10000).max(10000),
  reason: z.string().trim().min(3).max(500),
});

export const scoringConfigSchema = z.object({
  activePoints: z.number().int().min(0).max(1000),
  archivedPoints: z.number().int().min(0).max(1000),
});

export const eventSettingsSchema = z.object({
  eventName: z.string().min(2).max(120),
  description: z.string().max(2000).optional().default(""),
  startDate: z.string().datetime({ offset: true }).nullable().optional(),
  endDate: z.string().datetime({ offset: true }).nullable().optional(),
  timezone: z.string().min(2).max(64).default(EVENT_TIMEZONE),
  registrationMode: z.enum(["WAITLIST", "OPEN", "CLOSED"]).default("WAITLIST"),
  activePoints: z.number().int().min(0).max(1000).default(100),
  archivedPoints: z.number().int().min(0).max(1000).default(25),
});

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const SCORING_DEFAULTS = { activePoints: 100, archivedPoints: 25 } as const;

/** Tie-break order: totalPoints desc, verifiedCount desc, longestStreak desc, earliestLastSolve asc, name asc. */
export const TIE_BREAK_DOC =
  "totalPoints DESC, verifiedCount DESC, longestStreak DESC, earliestVerifiedAt ASC, displayName ASC";

/**
 * Extract canonical LeetCode problem slug from a URL.
 * Supports /problems/<slug>/ forms; returns null when not derivable.
 */
export function leetcodeSlugFromUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!/leetcode\.(com|cn)$/.test(u.hostname.replace(/^www\./, ""))) return null;
    const m = u.pathname.match(/\/problems\/([a-z0-9-]+)\/?/i);
    if (!m) return null;
    return m[1].toLowerCase();
  } catch {
    return null;
  }
}

export function canonicalLeetcodeUrl(slug: string): string {
  return `https://leetcode.com/problems/${slug}/`;
}
