"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

type Profile = { id: string; email: string; full_name?: string; role: string } | null;

const Ctx = createContext<{
  user: { id: string; email?: string } | null;
  profile: Profile;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}>({ user: null, profile: null, loading: true, signOut: async () => {}, refreshProfile: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [loading, setLoading] = useState(true);
  const supabase = supabaseBrowser();

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setProfile(null);
      return;
    }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setProfile(await res.json());
    } catch {
      /* backend may be down; auth still works */
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      if (session?.user) refreshProfile();
      else setProfile(null);
    });
    refreshProfile();
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return <Ctx.Provider value={{ user, profile, loading, signOut, refreshProfile }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, profile, loading } = useAuth();
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    if (!loading && !user && !redirecting) {
      setRedirecting(true);
      window.location.href = "/login";
    }
  }, [loading, user, redirecting]);
  if (loading) return null;
  if (!user) return null;
  if (roles && profile && !roles.includes(profile.role)) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h1 className="text-xl font-bold">Access denied</h1>
        <p className="mt-2 text-sm text-ink-500">Your role ({profile.role}) cannot view this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}
