import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "tecnico";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  fullName: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const [{ data: roleRow }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).order("role").limit(1).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    ]);
    setRole((roleRow?.role as AppRole) ?? "tecnico");
    setFullName(profile?.full_name ?? null);
  };

  useEffect(() => {
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const markPresence = async (userId: string, isOnline = true) => {
      await (supabase.from("user_presence" as never) as any).upsert({
        user_id: userId,
        is_online: isOnline,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    };

    const startPresence = (userId: string) => {
      markPresence(userId, true);
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => markPresence(userId, true), 30000);
    };

    const stopPresence = (userId?: string) => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      if (userId) markPresence(userId, false);
    };

    const handleBeforeUnload = () => {
      const currentUserId = supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user?.id) markPresence(data.session.user.id, false);
      });
      void currentUserId;
    };

    const handleVisibility = () => {
      supabase.auth.getSession().then(({ data }) => {
        const userId = data.session?.user?.id;
        if (!userId) return;
        markPresence(userId, document.visibilityState === "visible");
      });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
        startPresence(s.user.id);
      } else {
        stopPresence(session?.user?.id);
        setRole(null);
        setFullName(null);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        await loadProfile(data.session.user.id);
        startPresence(data.session.user.id);
      }
      setLoading(false);
    });

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      subscription.unsubscribe();
      stopPresence(session?.user?.id);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    role,
    fullName,
    loading,
    signOut: async () => {
      if (session?.user?.id) {
        await (supabase.from("user_presence" as never) as any).upsert({
          user_id: session.user.id,
          is_online: false,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      }
      await supabase.auth.signOut();
    },
    refreshRole: async () => { if (session?.user) await loadProfile(session.user.id); },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
