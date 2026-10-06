"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Profile } from "@/lib/client-api";
import { useAuth } from "@/components/AuthProvider";
import { Button, Card, Input, Label, Badge, Spinner, ErrorState, PageHeader } from "@/components/ui";

export default function ProfilePage() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError("");
    try {
      const p = await api<Profile>("/api/v1/me");
      setProfile(p);
      setFullName(p.full_name || "");
      setPhone(p.phone || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile.");
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const p = await api<Profile>("/api/v1/me", {
        method: "PATCH",
        body: { full_name: fullName.trim() || null, phone: phone.trim() || null },
      });
      setProfile(p);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      setBusy(false);
    }
  };

  const doSignOut = async () => {
    await signOut();
    router.push("/");
  };

  if (error && !profile) return <ErrorState message={error} onRetry={load} />;
  if (!profile) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Profile" subtitle="Manage your account details." />
      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {saved && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Profile saved successfully ✓
        </div>
      )}
      <Card>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
            {(profile.full_name || profile.email).charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-ink-900">{profile.full_name || "Traveler"}</p>
            <p className="text-sm text-ink-500">{profile.email}</p>
          </div>
          <span className="ml-auto"><Badge value={profile.role} /></span>
        </div>
        <div className="space-y-4">
          <div>
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div>
            <Label>Email (managed by Supabase Auth)</Label>
            <Input value={profile.email} disabled className="opacity-60" />
          </div>
          <div className="flex gap-3">
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
            <Button onClick={doSignOut} className="!bg-slate-200 !text-ink-700 hover:!bg-slate-300">Sign out</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
