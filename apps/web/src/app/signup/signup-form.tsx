"use client";
/**
 * Self-serve workspace: one form, one API call (POST /auth/signup). The API creates the tenant and its
 * owner and sets the same cookies as sign-in, so success goes straight to Home, where the onboarding
 * checklist takes over. Desktop: what happens next on the left (sunken panel), the form on the right.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/jr/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/sync";
import type { User } from "@/lib/types";

const NEXT = [
  "Set today's gold rate",
  "Add a design and tag its sample pieces",
  "Add a retailer shop with its geofence and credit limit",
  "Create a field agent and issue them pieces",
  "Plan their first visit",
];

export function SignupForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const [f, setF] = useState({ workspaceName: "", name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ msg: string; signIn?: boolean } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const { user } = await api<{ user: User }>("/auth/signup", { body: { ...f, workspaceName: f.workspaceName.trim(), name: f.name.trim(), email: f.email.trim() } });
      qc.setQueryData(qk.me, user);
      router.replace("/admin");
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_TAKEN") setError({ msg: "An account with this email already exists.", signIn: true });
      else if (err instanceof ApiError && err.status === 400) setError({ msg: "Check the fields: the business name needs 2 characters and the password 8." });
      else if (err instanceof ApiError && err.status === 429) setError({ msg: "Too many attempts. Wait a minute, then try again." });
      else setError({ msg: err instanceof ApiError ? err.message : "Can't reach JewelRoute right now. Check your connection and try again." });
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,1fr)]">
      <section aria-labelledby="next-title" className="hidden flex-col border-r border-line bg-sunken px-10 py-10 lg:flex xl:px-16">
        <Link href="/" aria-label="JewelRoute home" className="-m-1 self-start rounded-[8px] p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-blue/30"><Logo /></Link>
        <div className="mt-[110px] w-full max-w-[460px] self-center">
          <h2 id="next-title" className="text-[15px] font-semibold text-ink">After you create the workspace</h2>
          <p className="mt-1 text-[14px] text-ink-2">Home walks you through the setup, one step at a time:</p>
          <ol className="mt-5 space-y-3">
            {NEXT.map((s, i) => (
              <li key={s} className="flex items-start gap-3 text-[14px] text-ink">
                <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong bg-white text-[12px] font-medium text-ink-2">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-6 text-[13px] text-ink-3">Your data is visible only to people you add to this workspace.</p>
        </div>
      </section>

      <section className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-5 py-10 lg:max-w-[400px] lg:justify-start lg:px-0 lg:pt-[178px]">
        <Link href="/" aria-label="JewelRoute home" className="-m-1 mb-10 self-start rounded-[8px] p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-blue/30 lg:hidden"><Logo /></Link>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">Create your workspace</h1>
        <p className="mt-1 text-[14px] text-ink-2">For jewellery manufacturers and wholesalers. You&apos;ll be the owner.</p>

        <form className="mt-8 space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="workspaceName">Business name</Label>
            <Input id="workspaceName" required minLength={2} maxLength={80} autoComplete="organization" value={f.workspaceName} onChange={set("workspaceName")} className="h-11 px-3 text-[15px]" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" required maxLength={200} autoComplete="name" value={f.name} onChange={set("name")} className="h-11 px-3 text-[15px]" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" required autoComplete="email" inputMode="email" value={f.email} onChange={set("email")} className="h-11 px-3 text-[15px]" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={set("password")} className="h-11 px-3 text-[15px]" aria-describedby="pw-hint" />
            <p id="pw-hint" className="text-[12.5px] text-ink-3">At least 8 characters.</p>
          </div>
          {error && (
            <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13.5px] text-danger">
              {error.msg}{error.signIn && <> <Link href="/login" className="font-medium underline underline-offset-2">Sign in instead</Link></>}
            </p>
          )}
          <Button type="submit" className="h-11 w-full text-[15px] transition-[scale,background-color] duration-150 ease-out active:scale-[0.98]" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}Create workspace
          </Button>
        </form>
        <p className="mt-6 text-[13.5px] text-ink-2">Already have an account? <Link href="/login" className="font-medium text-ink underline-offset-2 hover:underline">Sign in</Link></p>
      </section>
    </main>
  );
}
