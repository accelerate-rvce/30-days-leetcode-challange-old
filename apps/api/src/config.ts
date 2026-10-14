import dotenv from "dotenv";

// Load .env regardless of whether the process starts in the repo root
// (`npm run dev:api`) or inside the workspace (`npm run -w apps/api dev`).
// Real environment variables always take precedence over .env files.
dotenv.config({ path: ["apps/api/.env", ".env"] });

function req(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  env: req("NODE_ENV", "development"),
  isProd: req("NODE_ENV") === "production",
  port: Number(req("PORT", "4000")),
  store: req("STORE", "memory") as "memory" | "prisma",
  databaseUrl: req("DATABASE_URL", ""),
  sessionSecret: req("SESSION_SECRET", "dev-secret-change-me-32-chars-min!!"),
  sessionTtlHours: Number(req("SESSION_TTL_HOURS", "168")),
  cookieSecure: req("COOKIE_SECURE", "false") === "true",
  cookieSameSite: req("COOKIE_SAMESITE", "lax") as "lax" | "strict" | "none",
  webOrigin: req("WEB_ORIGIN", "http://localhost:5173"),
  corsOrigins: req("WEB_ORIGIN", "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  registrationMode: req("REGISTRATION_MODE", "WAITLIST") as "WAITLIST" | "OPEN" | "CLOSED",
  eventTimezone: req("EVENT_TIMEZONE", "Asia/Kolkata"),
  emailProvider: req("EMAIL_PROVIDER", "log"),
  emailFrom: req("EMAIL_FROM", "Accelerate <noreply@accelerate.rvce.edu.in>"),
  smtp: {
    host: req("SMTP_HOST", ""),
    port: Number(req("SMTP_PORT", "587")),
    user: req("SMTP_USER", ""),
    pass: req("SMTP_PASS", ""),
  },
  verificationProvider: req("VERIFICATION_PROVIDER", "mock") as "mock" | "http" | "disabled",
  leetcodeGraphqlUrl: req("LEETCODE_GRAPHQL_URL", ""),
  verificationMaxRecent: Number(req("VERIFICATION_MAX_RECENT", "50")),
  jobSecret: req("JOB_SECRET", "dev-job-secret"),
  bootstrapAdmin: {
    email: req("BOOTSTRAP_ADMIN_EMAIL", ""),
    password: req("BOOTSTRAP_ADMIN_PASSWORD", ""),
    name: req("BOOTSTRAP_ADMIN_NAME", "Accelerate Admin"),
  },
};
