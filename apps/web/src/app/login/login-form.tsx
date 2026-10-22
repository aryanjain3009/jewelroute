"use client";
/**
 * Sign in. Two ways in, both obvious:
 *  - the demo: two people, two devices — Rahul Verma (field agent, built for a phone) and Priya Mehta
 *    (manager, built for a laptop). Each is one large button with a live miniature of the screen it
 *    opens (the landing page's sample frames), what you can do there, and its own loading state;
 *  - your work email and password (unchanged behaviour: same API call, same ?next= handling, same
 *    error copy, the labels the auth E2E specs use).
 * Desktop: demo on the left (sunken panel), form on the right. Phones: heading, the two people as
 * compact rows, then the form. Motion: press scale .98–.99 (150 ms), colour on hover; nothing else.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon, LaptopIcon, Loader2, SmartphoneIcon } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/jr/logo";
import { Avatar } from "@/components/app/chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ManagerView, PhoneToday } from "@/components/marketing/views";
import { api, ApiError } from "@/lib/api";
import { destination } from "@/lib/auth-redirect";
import { qk } from "@/lib/sync";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

const DEMO = [
  {
    key: "rahul", email: "rahul@aurum.test", password: "Rahul@2026", name: "Rahul Verma", first: "Rahul", role: "Field agent",
    device: "Built for a phone", icon: SmartphoneIcon, opens: "Opens on Today",
    does: ["Today's route and his bag", "GPS check-in and arrival photo", "Orders and memos at the counter"],
  },
  {
    key: "priya", email: "admin@aurum.test", password: "Aurum@2026", name: "Priya Mehta", first: "Priya", role: "Manager",
    device: "Built for a laptop", icon: LaptopIcon, opens: "Opens on Home",
    does: ["Needs attention and live activity", "Approvals with the credit position", "Every sample's custody"],
  },
] as const;
type Demo = (typeof DEMO)[number];

/** Live miniature of the screen each demo account lands on (inert sample frames, scaled). */
function Preview({ d }: { d: Demo }) {
  if (d.key === "rahul") return (
    <div className="flex h-full items-start justify-center overflow-hidden pt-9">
      <div className="h-[600px] w-[320px] shrink-0 origin-top scale-[0.47]"><PhoneToday /></div>
    </div>
  );
  return (
    <div className="flex h-full items-start justify-center overflow-hidden pt-9">
      <div className="h-[640px] w-[1080px] shrink-0 origin-top scale-[0.27] overflow-hidden rounded-[22px] border-[3px] border-[#d9d9db] bg-white"><ManagerView highlight="a2" /></div>
    </div>
  );
}

function PersonaCard({ d, busy, onPick }: { d: Demo; busy: string | null; onPick: () => void }) {
  const mine = busy === d.key;
  // The preview holds the app's own (inert) buttons, so the card is not a <button>: one transparent
  // button stretched over the whole card takes the click, the focus ring and the accessible name.
  return (
    <div
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-line-strong bg-white",
        "transition-[border-color,box-shadow,scale,opacity] duration-150 ease-out has-[button:active:enabled]:scale-[0.99]",
        "[@media(hover:hover)_and_(pointer:fine)]:has-[button:hover:enabled]:border-[#cfcfd2] [@media(hover:hover)_and_(pointer:fine)]:has-[button:hover:enabled]:shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_-16px_rgb(28_29_31/0.18)]",
        busy && !mine && "opacity-50",
      )}
    >
      <div className="relative h-[196px] border-b border-line bg-sunken" aria-hidden inert>
        <Preview d={d} />
        <span className="absolute top-2.5 left-3 inline-flex h-6 items-center gap-1.5 text-[12px] font-medium text-ink-2"><d.icon className="size-3.5" strokeWidth={1.75} />{d.device}</span>
      </div>
      <div className="flex flex-1 flex-col px-4 pt-3.5 pb-4">
        <div className="flex items-center gap-2.5">
          <Avatar name={d.name} size={32} />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-ink">{d.name}</div>
            <div className="text-[13px] text-ink-2">{d.role} · {d.opens}</div>
          </div>
        </div>
        <ul id={`demo-${d.key}-desc`} className="mt-3 space-y-1 text-[13px] text-ink-2">
          {d.does.map((x) => <li key={x} className="flex gap-2"><span className="mt-[9px] h-px w-2 shrink-0 bg-ink-3" aria-hidden />{x}</li>)}
        </ul>
        <span aria-hidden className="mt-4 flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-line-strong bg-white text-[14px] font-medium text-ink transition-colors duration-150 group-has-[button:hover:enabled]:border-ink group-has-[button:hover:enabled]:bg-ink group-has-[button:hover:enabled]:text-white">
          {mine ? <><Loader2 className="size-4 animate-spin" />Opening {d.first}&apos;s workspace</> : <>Continue as {d.first}</>}
        </span>
      </div>
      <button
        type="button"
        onClick={onPick}
        disabled={!!busy}
        aria-label={`Continue as ${d.name}, ${d.role.toLowerCase()}`}
        aria-describedby={`demo-${d.key}-desc`}
        className="absolute inset-0 z-10 rounded-[14px] outline-none focus-visible:ring-[3px] focus-visible:ring-blue/35 disabled:cursor-default"
      >
        {mine && <span className="sr-only" role="status">Signing in as {d.name}</span>}
      </button>
    </div>
  );
}

/** 56 px crop of the screen each account opens: the phone's Today, the laptop's Home. */
function Thumb({ d }: { d: Demo }) {
  return (
    <span aria-hidden inert className="relative block size-14 shrink-0 overflow-hidden rounded-[10px] border border-line bg-sunken">
      {d.key === "rahul"
        ? <span className="absolute top-1.5 left-1/2 block h-[600px] w-[320px] -translate-x-1/2 origin-top scale-[0.16]"><PhoneToday /></span>
        : (
          // A drawn miniature of Home (no app buttons inside this <button>): sidebar, four numbers, rows.
          <span className="absolute inset-x-1.5 top-2.5 bottom-0 flex overflow-hidden rounded-t-[5px] border border-b-0 border-[#d9d9db] bg-white">
            <span className="w-3 shrink-0 border-r border-line bg-sidebar-bg" />
            <span className="flex-1 p-1">
              <span className="grid grid-cols-2 gap-0.5">
                <span className="h-2.5 rounded-[2px] border border-line" /><span className="h-2.5 rounded-[2px] border border-line" />
                <span className="h-2.5 rounded-[2px] border border-gold/40 bg-gold-soft" /><span className="h-2.5 rounded-[2px] border border-danger/30 bg-danger-soft" />
              </span>
              <span className="mt-1 block h-1 w-4/5 rounded-full bg-line-strong" />
              <span className="mt-0.5 block h-1 w-3/5 rounded-full bg-line" />
              <span className="mt-0.5 block h-1 w-2/3 rounded-full bg-line" />
            </span>
          </span>
        )}
    </span>
  );
}

/** Phones and tablets: the same choice as two rows, each with a thumbnail of its screen. */
function PersonaRow({ d, busy, onPick }: { d: Demo; busy: string | null; onPick: () => void }) {
  const mine = busy === d.key;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!!busy}
      aria-label={`Continue as ${d.name}, ${d.role.toLowerCase()}`}
      className={cn(
        "flex min-h-[68px] w-full items-center gap-3 rounded-[12px] border border-line-strong bg-white px-3.5 py-3 text-left outline-none",
        "transition-[background-color,scale,opacity] duration-150 ease-out active:scale-[0.98] active:bg-hover focus-visible:ring-[3px] focus-visible:ring-blue/30",
        busy && !mine && "opacity-50",
      )}
    >
      <Thumb d={d} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{d.name}</span>
        <span className="flex items-center gap-1.5 truncate text-[13px] text-ink-2">{d.role}<span className="text-ink-3">·</span><d.icon className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />{d.key === "rahul" ? "Phone" : "Laptop"}</span>
      </span>
      {mine ? <Loader2 className="size-5 shrink-0 animate-spin text-ink-2" /> : <ChevronRightIcon className="size-5 shrink-0 text-ink-3" />}
    </button>
  );
}

export function LoginForm({ hasSession = true }: { hasSession?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Already signed in with only a refresh cookie (the middleware redirects when the access token is live):
  // /auth/me refreshes once; a user means go home (or to a valid ?next=), a 401 means show the form.
  useEffect(() => {
    if (!hasSession) return;
    let live = true;
    api<User>("/auth/me").then((user) => {
      if (!live) return;
      qc.setQueryData(qk.me, user);
      router.replace(destination(user.role, params.get("next")));
    }, () => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(e: string, p: string, who: string) {
    setBusy(who); setError(null);
    try {
      const { user } = await api<{ user: User; accessToken: string }>("/auth/login", { body: { email: e, password: p } });
      qc.setQueryData(qk.me, user);
      router.replace(destination(user.role, params.get("next")));
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.status === 401 || err.code === "INVALID_CREDENTIALS" ? "That email and password don't match. Check them and try again."
          : err.status === 429 ? "Too many sign-in attempts. Wait a minute, then try again." : err.message
        : "Can't reach JewelRoute right now. Check your connection and try again.";
      setError(msg);
      if (who !== "form") toast.error(msg);
      setBusy(null);
    }
  }

  const disabledNotice = !error && params.get("reason") === "disabled";

  return (
    <main className="min-h-dvh bg-white lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(420px,1fr)]">
      {/* Demo workspace: who do you want to be? (desktop) */}
      <section aria-labelledby="demo-title" className="relative hidden flex-col border-r border-line bg-sunken px-10 py-10 lg:flex xl:px-16">
        <Link href="/" aria-label="JewelRoute home" className="-m-1 self-start rounded-[8px] p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-blue/30"><Logo /></Link>
        <div className="mt-[88px] w-full max-w-[680px] self-center pb-10">
          <p className="text-[13px] font-medium text-ink-2">Demo workspace · Aurum Jewels</p>
          <h2 id="demo-title" className="mt-2 text-balance text-[30px] leading-[1.15] font-semibold tracking-[-0.02em] text-ink">Explore JewelRoute as Rahul or Priya.</h2>
          <p className="mt-3 max-w-[540px] text-[15px] leading-relaxed text-ink-2">Two real accounts on sample data. Rahul works from a phone in the shops; Priya runs the team from a laptop. Sign out any time to switch.</p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            {DEMO.map((d) => <PersonaCard key={d.key} d={d} busy={busy} onPick={() => signIn(d.email, d.password, d.key)} />)}
          </div>
          <p className="mt-5 text-[12.5px] text-ink-3">Sample data only: nothing in the demo is a real retailer, piece or order.</p>
        </div>
      </section>

      {/* Sign in */}
      <section className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-5 py-10 lg:max-w-[400px] lg:justify-start lg:px-0 lg:pt-[178px]">
        <Link href="/" aria-label="JewelRoute home" className="-m-1 mb-10 self-start rounded-[8px] p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-blue/30 lg:hidden"><Logo /></Link>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">Sign in to JewelRoute</h1>
        <p className="mt-1 text-[14px] text-ink-2"><span className="lg:hidden">Try the demo in one tap, or use your work email.</span><span className="max-lg:hidden">Use your work email and password.</span></p>

        {/* Phones and tablets: the demo choice first */}
        <div className="mt-6 lg:hidden" role="group" aria-label="Demo accounts">
          <div className="space-y-2">
            {DEMO.map((d) => <PersonaRow key={d.key} d={d} busy={busy} onPick={() => signIn(d.email, d.password, d.key)} />)}
          </div>
          <div className="mt-7 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[12.5px] text-ink-3">or with your work email</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </div>

        <form
          className="mt-6 space-y-4 lg:mt-8"
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
          {disabledNotice && <p role="alert" className="rounded-[10px] bg-warn-soft px-3 py-2.5 text-[13.5px] text-warn">Your account is no longer active, so you were signed out. Ask your manager to reactivate it.</p>}
          {error && <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13.5px] text-danger">{error}</p>}
          <Button type="submit" className="h-11 w-full text-[15px] transition-[scale,background-color] duration-150 ease-out active:scale-[0.98]" disabled={!!busy}>
            {busy === "form" && <Loader2 className="animate-spin" />}Sign in
          </Button>
        </form>
        <p className="mt-2 text-center text-[14px] text-ink-2">
          New to JewelRoute?{" "}
          <Link href="/signup" className="inline-block rounded-[4px] py-3 font-medium text-ink underline decoration-line-strong underline-offset-[3px] outline-none transition-colors duration-150 ease-out hover:decoration-ink focus-visible:ring-[3px] focus-visible:ring-blue/30">Create a workspace</Link>
        </p>
        <p className="mt-6 text-[12.5px] leading-relaxed text-ink-3 lg:hidden">Demo accounts sign in to sample data for Aurum Jewels. Nothing here is a real retailer or a real order.</p>
      </section>
    </main>
  );
}
