"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";
import { api, type Profile } from "@/lib/client-api";
import { Button, Card, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) throw new Error(authErr.message);
      let dest = "/traveler";
      try {
        const profile = await api<Profile>("/api/v1/me");
        if (profile.role === "OPERATOR" || profile.role === "ADMIN") dest = "/operator";
      } catch {
        /* profile fetch failed (e.g. backend down) — default to traveler home */
      }
      router.push(dest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-ink-900">
          TourFlow <span className="text-brand-600">AI</span>
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-ink-900">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-500">Log in to plan, book, and adapt your trips.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </div>
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <Button type="submit" disabled={busy} className="w-full py-3">
            {busy ? "Logging in…" : "Log in"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-ink-500">
          New to TourFlow?{" "}
          <Link href="/register" className="font-semibold text-brand-600 hover:underline">Create an account</Link>
        </p>
      </Card>
    </div>
  );
}
