export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:4000/api/v1";

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    // Custom header doubles as the CSRF signal the API checks for cookie
    // sessions (see csrf middleware): a cross-site form can never set this.
    headers: { "content-type": "application/json", "x-requested-with": "XMLHttpRequest", ...(opts.headers || {}) },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body?.error?.message || `Request failed (${res.status})`, res.status, body);
  return body as T;
}

export class ApiError extends Error {
  status: number; body: unknown;
  constructor(message: string, status: number, body: unknown) { super(message); this.status = status; this.body = body; }
}

export const api = {
  get: <T>(p: string) => req<T>(p),
  post: <T>(p: string, data?: unknown) => req<T>(p, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) }),
  put: <T>(p: string, data?: unknown) => req<T>(p, { method: "PUT", body: JSON.stringify(data) }),
};

export interface EventInfo {
  eventName: string; description: string; startDate: string | null; endDate: string | null;
  timezone: string; registrationMode: "WAITLIST" | "OPEN" | "CLOSED"; phase: string;
  serverTime: string; activePoints: number; archivedPoints: number;
}
export interface Challenge {
  id: string; dayNumber: number; title: string; slug: string; leetcodeUrl: string;
  difficulty: string; topics: string[]; state: string; publishAt: string | null;
  activePoints: number; archivedPoints: number;
}
