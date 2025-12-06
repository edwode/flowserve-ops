import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";

interface UseAuthGuardResult {
  user: User | null;
  session: Session | null;
  loading: boolean;
  tenantId: string | null;
}

export const useAuthGuard = (): UseAuthGuardResult => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        // Handle sign out - show toast if session was previously active
        if (event === 'SIGNED_OUT' || (!currentSession && hasInitialized.current)) {
          setTenantId(null);
          toast({
            title: "Session expired",
            description: "Please sign in again to continue",
            variant: "destructive",
          });
          navigate('/auth');
          return;
        }

        // Defer profile fetch to avoid Supabase deadlock
        if (currentSession?.user) {
          setTimeout(() => {
            fetchTenantId(currentSession.user.id);
          }, 0);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);

      if (!existingSession) {
        setLoading(false);
        navigate('/auth');
        return;
      }

      hasInitialized.current = true;
      fetchTenantId(existingSession.user.id);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchTenantId = async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', userId)
        .single();

      if (error || !profile?.tenant_id) {
        navigate('/setup');
        return;
      }

      setTenantId(profile.tenant_id);
    } catch {
      navigate('/setup');
    } finally {
      setLoading(false);
    }
  };

  return { user, session, loading, tenantId };
};
