import type { ReactNode, ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { Link } from "react-router-dom";

export function cx(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(" "); }

export function Button({ asChild, variant = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean; variant?: "primary" | "ghost" | "danger" }) {
  const C: "button" | typeof Slot = asChild ? Slot : "button";
  const v = variant === "primary"
    ? "bg-gradient-to-r from-cy via-blu to-pur text-white font-semibold hover:opacity-90"
    : variant === "danger" ? "bg-red-600/90 text-white hover:bg-red-600" : "border border-line text-gray-200 hover:border-cy/60";
  return <C className={cx("inline-flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-md transition disabled:opacity-50", v, className)} {...p} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("bg-panel border border-line rounded-lg", className)}>{children}</div>;
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-gray-300">{label}</span>
      {children}
      {error && <span className="block text-xs text-red-400">{error}</span>}
    </label>
  );
}

export const inputCls = "w-full bg-ink border border-line rounded-md px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-cy/70 focus:outline-none";

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    VERIFIED: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
    ACTIVE: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
    PENDING: "text-amber-300 border-amber-500/40 bg-amber-500/10",
    MANUAL_REVIEW: "text-amber-300 border-amber-500/40 bg-amber-500/10",
    "Not Started": "text-gray-300 border-line bg-white/5",
    NOT_VERIFIED: "text-red-300 border-red-500/40 bg-red-500/10",
    ARCHIVED: "text-purple-300 border-pur/40 bg-pur/10",
    DRAFT: "text-gray-400 border-line bg-white/5",
    SCHEDULED: "text-cy border-cy/40 bg-cy/10",
  };
  const label = status === "MANUAL_REVIEW" ? "Pending Verification" : status.replace(/_/g, " ");
  return <span className={cx("inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded", map[status] ?? "text-gray-300 border-line bg-white/5")}>{label}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse bg-white/5 rounded", className)} />;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return <div className="border border-dashed border-line rounded-lg p-8 text-center"><p className="font-medium text-gray-200">{title}</p>{hint && <p className="text-sm text-mut mt-1">{hint}</p>}</div>;
}

export function Err({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="border border-red-500/40 bg-red-500/10 rounded-lg p-4 text-sm text-red-200">{message}{retry && <button onClick={retry} className="ml-3 underline">Retry</button>}</div>;
}

export function NavLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="text-sm text-gray-300 hover:text-white transition">{children}</Link>;
}
