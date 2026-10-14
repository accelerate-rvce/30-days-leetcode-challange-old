import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Card, Field, inputCls } from "../components/ui";

const loginSchema = z.object({ email: z.string().trim().min(3), password: z.string().min(1, "Required") });
const regSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().regex(/^[^\s@]+@rvce\.edu\.in$/, "Use your @rvce.edu.in address"),
  leetcodeUsername: z.string().trim().min(1).max(64),
  password: z.string().min(10, "At least 10 characters").max(128),
});

export function Login() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const m = useMutation({
    mutationFn: (v: z.infer<typeof loginSchema>) => api.post("/auth/login", v),
    onSuccess: () => { refresh(); nav("/dashboard"); },
  });
  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <h1 className="font-disp text-3xl font-bold">Sign in</h1>
      <Card className="p-5 mt-5">
        <form className="space-y-4" onSubmit={handleSubmit((v) => m.mutate(v))}>
          <Field label="Email" error={errors.email?.message}><input className={inputCls} {...register("email")} placeholder="you@rvce.edu.in" /></Field>
          <Field label="Password" error={errors.password?.message}><input type="password" className={inputCls} {...register("password")} /></Field>
          {m.isError && <p className="text-sm text-red-300">{(m.error as ApiError).message}</p>}
          <Button disabled={m.isPending}>{m.isPending ? "Signing in…" : "Sign in"}</Button>
          <p className="text-sm text-mut"><Link to="/forgot-password" className="text-cy underline">Forgot password?</Link> · <Link to="/register" className="text-cy underline">Create account</Link></p>
        </form>
      </Card>
    </div>
  );
}

export function Register() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof regSchema>>({ resolver: zodResolver(regSchema), defaultValues: { email: params.get("email") ?? "" } });
  const m = useMutation({
    mutationFn: (v: z.infer<typeof regSchema>) => api.post<{ emailSent?: boolean; emailError?: string }>("/auth/register", v),
    onSuccess: () => nav("/login"),
  });
  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <h1 className="font-disp text-3xl font-bold">Create account</h1>
      <p className="text-sm text-mut mt-1">In WAITLIST mode you must be approved/invited first. <Link to="/waitlist" className="text-cy underline">Join the waitlist</Link>.</p>
      <Card className="p-5 mt-5">
        <form className="space-y-4" onSubmit={handleSubmit((v) => m.mutate(v))}>
          <Field label="Full name" error={errors.name?.message}><input className={inputCls} {...register("name")} /></Field>
          <Field label="RVCE email" error={errors.email?.message}><input className={inputCls} {...register("email")} /></Field>
          <Field label="LeetCode username" error={errors.leetcodeUsername?.message}><input className={inputCls} {...register("leetcodeUsername")} /></Field>
          <Field label="Password (10+ characters)" error={errors.password?.message}><input type="password" className={inputCls} {...register("password")} /></Field>
          {m.isError && <p className="text-sm text-red-300">{(m.error as ApiError).message}</p>}
          {m.isSuccess && !m.data.emailSent && <p className="text-sm text-amber-200">{m.data.emailError}</p>}
          <Button disabled={m.isPending}>{m.isPending ? "Creating…" : "Create account"}</Button>
        </form>
      </Card>
    </div>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const m = useMutation({ mutationFn: () => api.post("/auth/verify-email", { token: params.get("token") ?? "" }), onSuccess: () => setTimeout(() => nav("/login"), 1200) });
  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <h1 className="font-disp text-2xl font-bold">Verify email</h1>
      <Card className="p-5 mt-4 space-y-3">
        <Button onClick={() => m.mutate()} disabled={m.isPending}>Verify my email</Button>
        {m.isError && <p className="text-sm text-red-300">{(m.error as ApiError).message}</p>}
        {m.isSuccess && <p className="text-sm text-emerald-300">Verified! Redirecting to sign in…</p>}
      </Card>
    </div>
  );
}

export function Forgot() {
  const { register, handleSubmit } = useForm<{ email: string }>();
  const m = useMutation({ mutationFn: (v: { email: string }) => api.post("/auth/forgot-password", v) });
  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <h1 className="font-disp text-2xl font-bold">Forgot password</h1>
      <Card className="p-5 mt-4">
        <form className="space-y-4" onSubmit={handleSubmit((v) => m.mutate(v))}>
          <Field label="Account email"><input className={inputCls} {...register("email")} placeholder="you@rvce.edu.in" /></Field>
          {m.isSuccess && <p className="text-sm text-emerald-300">If an account exists for this email, a reset link has been sent.</p>}
          <Button disabled={m.isPending}>Send reset link</Button>
        </form>
      </Card>
    </div>
  );
}

export function Reset() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { register, handleSubmit } = useForm<{ password: string }>();
  const m = useMutation({
    mutationFn: (v: { password: string }) => api.post("/auth/reset-password", { token: params.get("token") ?? "", password: v.password }),
    onSuccess: () => setTimeout(() => nav("/login"), 1200),
  });
  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <h1 className="font-disp text-2xl font-bold">Set a new password</h1>
      <Card className="p-5 mt-4">
        <form className="space-y-4" onSubmit={handleSubmit((v) => m.mutate(v))}>
          <Field label="New password (10+ characters)"><input type="password" className={inputCls} {...register("password")} /></Field>
          {m.isError && <p className="text-sm text-red-300">{(m.error as ApiError).message}</p>}
          {m.isSuccess && <p className="text-sm text-emerald-300">Password updated. Redirecting…</p>}
          <Button disabled={m.isPending}>Reset password</Button>
        </form>
      </Card>
    </div>
  );
}
