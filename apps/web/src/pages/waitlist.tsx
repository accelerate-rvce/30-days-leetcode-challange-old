import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Button, Card, Field, inputCls } from "../components/ui";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.string().trim().toLowerCase().regex(/^[^\s@]+@rvce\.edu\.in$/, "Use your @rvce.edu.in address"),
  leetcodeUsername: z.string().trim().min(1, "Required").max(64).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, _ and - only"),
  consent: z.literal(true, { errorMap: () => ({ message: "Privacy consent is required" }) }),
});
type Form = z.infer<typeof schema>;

export function Waitlist() {
  const [params] = useSearchParams();
  const [statusEmail, setStatusEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { email: params.get("email") ?? "" } });
  const join = useMutation({
    mutationFn: (v: Form) => api.post<{ ok: boolean; status: string; emailSent?: boolean; emailError?: string }>("/waitlist", v),
  });
  return (
    <div className="max-w-xl mx-auto px-4 py-14">
      <h1 className="font-disp text-3xl font-bold">Join the Waitlist</h1>
      <p className="text-mut text-sm mt-2">RVCE email only. We'll verify ownership with a single-use expiring link — we store only what's needed to run the event.</p>
      <Card className="p-5 mt-6">
        <form className="space-y-4" onSubmit={handleSubmit((v) => join.mutate(v))}>
          <Field label="Full name" error={errors.name?.message}><input className={inputCls} {...register("name")} placeholder="Aarav Sharma" /></Field>
          <Field label="RVCE email" error={errors.email?.message}><input className={inputCls} {...register("email")} placeholder="you@rvce.edu.in" inputMode="email" /></Field>
          <Field label="LeetCode username" error={errors.leetcodeUsername?.message}><input className={inputCls} {...register("leetcodeUsername")} placeholder="your-handle" /></Field>
          <label className="flex items-start gap-2 text-sm text-gray-300">
            <input type="checkbox" className="mt-1" {...register("consent")} />
            <span>I consent to Accelerate storing my name, RVCE email, and LeetCode username to operate this event, per the published privacy notice.</span>
          </label>
          {errors.consent && <p className="text-xs text-red-400">{errors.consent.message}</p>}
          {join.isError && <p className="text-sm text-red-300">{(join.error as ApiError).message}</p>}
          {join.isSuccess && (
            <div className="border border-emerald-500/40 bg-emerald-500/10 rounded-md p-3 text-sm text-emerald-200">
              You're on the list ({join.data.status}).{" "}
              {join.data.emailSent === false && <span className="text-amber-200">Email delivery isn't configured right now — your spot is saved and an organizer will confirm it.</span>}
              {join.data.emailSent !== false && <span>Check your inbox for the verification link.</span>}
            </div>
          )}
          <Button disabled={join.isPending}>{join.isPending ? "Joining…" : "Join the Waitlist"}</Button>
        </form>
      </Card>
      <Card className="p-5 mt-4">
        <p className="font-medium text-sm">Already joined? Check your status</p>
        <div className="flex gap-2 mt-2">
          <input className={inputCls} value={statusEmail} onChange={(e) => setStatusEmail(e.target.value)} placeholder="you@rvce.edu.in" />
          <Button variant="ghost" onClick={async () => {
            try { const r = await api.get<{ status: string }>(`/waitlist/status?email=${encodeURIComponent(statusEmail)}`); setStatus(r.status); }
            catch { setStatus("NOT_FOUND"); }
          }}>Check</Button>
        </div>
        {status && <p className="text-sm mt-2 text-gray-300">Status: <strong>{status.replace(/_/g, " ")}</strong> {status === "APPROVED" || status === "INVITED" ? <>— you can <Link to="/register" className="text-cy underline">register</Link>.</> : null}</p>}
      </Card>
    </div>
  );
}

export function WaitlistVerify() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <h1 className="font-disp text-2xl font-bold">Confirm waitlist email</h1>
      <Card className="p-5 mt-4 space-y-3">
        {!done ? (<>
          <p className="text-sm text-mut">Click below to verify ownership of your RVCE address.</p>
          <Button onClick={async () => {
            try { const r = await api.post<{ status: string }>("/waitlist/verify", { token }); setDone(`Verified — status: ${r.status}`); }
            catch (e) { setDone(`Failed: ${(e as ApiError).message}`); }
          }}>Verify email</Button>
        </>) : <p className="text-sm">{done}</p>}
        <Link to="/register" className="text-sm text-cy underline">Continue to registration →</Link>
      </Card>
    </div>
  );
}
