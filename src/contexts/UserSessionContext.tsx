"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export interface UserProfile {
  id: string;
  full_name: string;
  role: string;
  email?: string;
  [key: string]: any;
}

export interface UserSessionContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const defaultContext: UserSessionContextType = {
  user: null,
  profile: null,
  loading: true,
  refresh: async () => {},
};

const UserSessionContext = createContext<UserSessionContextType>(defaultContext);

export function UserSessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("agency_cached_profile");
        if (cached) return JSON.parse(cached);
      } catch (e) {
        // Ignore JSON parse error
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const persistProfile = useCallback((newProfile: UserProfile | null) => {
    setProfile(newProfile);
    if (typeof window !== "undefined") {
      try {
        if (newProfile) {
          localStorage.setItem("agency_cached_profile", JSON.stringify(newProfile));
          localStorage.setItem("agency_user_role", newProfile.role);
          document.cookie = `agency_cached_role=${newProfile.role}; path=/; max-age=31536000; SameSite=Lax`;
        } else {
          localStorage.removeItem("agency_cached_profile");
          localStorage.removeItem("agency_user_role");
          document.cookie = "agency_cached_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        }
      } catch (e) {
        // Ignore storage error
      }
    }
  }, []);

  const fetchSessionAndProfile = useCallback(async () => {
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        setUser(null);
        persistProfile(null);
        setLoading(false);
        return;
      }

      setUser(authUser);

      // Fast-path: Check session JWT user metadata
      const metaRole =
        (authUser.user_metadata?.role as string) ||
        (authUser.app_metadata?.role as string);
      const metaName =
        (authUser.user_metadata?.full_name as string) ||
        authUser.email?.split("@")[0] ||
        "Operator";

      if (metaRole) {
        persistProfile({
          id: authUser.id,
          full_name: metaName,
          role: metaRole,
          email: authUser.email,
        });
        setLoading(false);
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", authUser.id)
        .maybeSingle();

      if (profileData) {
        persistProfile({
          id: profileData.id,
          full_name: profileData.full_name || metaName,
          role: profileData.role || metaRole || "admin",
          email: authUser.email,
        });
      } else if (!metaRole) {
        persistProfile({
          id: authUser.id,
          full_name: metaName,
          role: "admin",
          email: authUser.email,
        });
      }
    } catch (err) {
      console.warn("Failed to fetch user session in UserSessionProvider:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, persistProfile]);

  useEffect(() => {
    fetchSessionAndProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        persistProfile(null);
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (session?.user) {
          fetchSessionAndProfile();
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchSessionAndProfile, supabase, persistProfile]);

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      refresh: fetchSessionAndProfile,
    }),
    [user, profile, loading, fetchSessionAndProfile]
  );

  return (
    <UserSessionContext.Provider value={value}>
      {children}
    </UserSessionContext.Provider>
  );
}

export function useUserSession(): UserSessionContextType {
  return useContext(UserSessionContext);
}
