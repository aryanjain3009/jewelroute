"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { qk } from "./sync";
import type { User } from "./types";
export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => api<User>("/auth/me"), staleTime: 5 * 60_000, retry: false });
}
export async function logout() {
  await api("/auth/logout", { method: "POST" }).catch(() => {});
  location.href = "/login";
}
