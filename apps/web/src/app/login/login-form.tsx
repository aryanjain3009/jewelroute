"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/jr/logo";
import { Avatar } from "@/components/app/chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/sync";
import type { User } from "@/lib/types";

const DEMO = [
  { key: "rahul", email: "rahul@aurum.test", password: "Rahul@2026", title: "Sign in as Rahul", role: "Field agent", note: "Today's route, check-in, catalog, memo" },
  { key: "priya", email: "admin@aurum.test", password: "Aurum@2026", title: "Sign in as Priya", role: "Manager", note: "Command center, approvals, custody" },
] as const;

function destination(user: User, next: string | null) {
  const home = user.role === "ADMIN" ? "/admin" : "/field/today";
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) return home;
  // Only honour ?next= inside the area this role can use.
  const area = user.role === "ADMIN" ? "/admin" : "/field";
  return next.startsWith(area) ? next : home;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: string, p: string, who: string) {
    setBusy(who); setError(null);
    try {
      const { user } = await api<{ user: User; accessToken: string }>("/auth/login", { body: { email: e, password: p } });
      qc.setQueryData(qk.me, user);
      router.replace(destination(user, params.get("next")));
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.status === 401 || err.code === "INVALID_CREDENTIALS" ? "That email and password don't match. Check them and try again." : err.message
        : "Can't reach JewelRoute right now. Check your connection and try again.";
      setError(msg);
      if (who !== "form") toast.error(msg);
      setBusy(null);
    }
  }

  return (
    <main className="min-h-dvh bg-paper lg:grid lg:grid-cols-[1fr_minmax(440px,520px)]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-sunken lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Logo />
        <div className="max-w-md">
          <p className="font-display text-[48px] leading-[1.05] tracking-[-0.02em] text-ink">
            Know where every salesman went, what they sold, and where every piece is.
          </p>
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-ink-2">
            Route, GPS-verified visits, live gold-rate pricing and sample custody for jewellery makers who sell through retailers.
          </p>
        </div>
        <p className="text-xs text-ink-3">Aurum Jewels sample workspace</p>
      </aside>

      <section className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center px-5 py-10">
        <Logo className="mb-10 lg:hidden" />
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Sign in to JewelRoute</h1>
        <p className="mt-1 text-[14px] text-ink-2">Use your work email.</p>

        <form
          className="mt-8 space-y-4"
          onSubmit={(ev) => { ev.preventDefault(); if (!busy) signIn(email.trim(), password, "form"); }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" inputMode="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} className="h-11 px-3 text-[15px]" placeholder="you@company.in" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} className="h-11 px-3 text-[15px]" />
          </div>
          {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">{error}</p>}
          <Button type="submit" className="h-11 w-full text-[15px]" disabled={!!busy}>
            {busy === "form" && <Loader2 className="animate-spin" />}Sign in
          </Button>
        </form>

        <div className="mt-10">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs text-ink-3">Demo accounts</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="mt-4 space-y-2">
            {DEMO.map((d) => (
              <button
                key={d.key}
                type="button"
                disabled={!!busy}
                onClick={() => signIn(d.email, d.password, d.key)}
                className="group flex min-h-14 w-full items-center gap-3 rounded-lg border border-line-strong px-3.5 py-2.5 text-left transition-colors hover:bg-hover disabled:opacity-60"
              >
                <Avatar name={d.title.replace("Sign in as ", "")} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-ink">{d.title} <span className="font-normal text-ink-2">({d.role.toLowerCase()})</span></span>
                  <span className="block truncate text-[13px] text-ink-3">{d.note}</span>
                </span>
                {busy === d.key && <Loader2 className="size-4 animate-spin text-ink-3" />}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
            Demo accounts sign in to sample data for Aurum Jewels. Nothing here is a real retailer or a real order.
          </p>
        </div>
      </section>
    </main>
  );
}
