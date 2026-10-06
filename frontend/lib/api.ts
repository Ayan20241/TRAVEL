import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export async function getSession() {
  const store = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => store.get(n)?.value } }
  );
  const { data } = await supabase.auth.getSession();
  return data.session;
}

type Opts = { method?: string; body?: unknown; token?: string };

export async function api(path: string, { method = "GET", body, token }: Opts = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let t = token;
  if (!t) {
    const s = await getSession();
    t = s?.access_token;
  }
  if (t) headers["Authorization"] = `Bearer ${t}`;
  const res = await fetch(`${BACKEND}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err?.error?.message || `Request failed (${res.status})`, err);
  }
  if (res.status === 204) return null;
  return res.json();
}

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export const BACKEND_URL = BACKEND;
