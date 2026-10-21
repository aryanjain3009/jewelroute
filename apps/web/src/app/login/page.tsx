import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Only probe /auth/me when a session cookie exists; without one it can only answer 401.
  const jar = await cookies();
  const hasSession = jar.has("jr_rt") || jar.has("jr_at");
  return (
    <Suspense>
      <LoginForm hasSession={hasSession} />
    </Suspense>
  );
}
