import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  const navigateTo = useCallback((path: string) => {
    setRedirecting(true);
    // Use setTimeout to ensure iOS Safari processes the navigation
    setTimeout(() => {
      navigate(path, { replace: true });
    }, 0);
  }, [navigate]);

  useEffect(() => {
    let isMounted = true;

    const getUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!isMounted) return;

        if (session?.user) {
          setUser(session.user);
          
          // Check if user has a tenant assigned
          const { data: profile } = await supabase
            .from('profiles')
            .select('tenant_id, user_roles(role)')
            .eq('id', session.user.id)
            .single();

          if (!isMounted) return;

          if (!profile?.tenant_id) {
            // No tenant assigned yet - redirect to setup
            navigateTo('/setup');
          } else if (profile.user_roles && profile.user_roles.length > 0) {
            // Route based on role
            const role = (profile.user_roles as any[])[0].role;
            switch (role) {
              case 'waiter':
                navigateTo('/waiter');
                break;
              case 'cashier':
                navigateTo('/cashier');
                break;
              case 'drink_dispenser':
              case 'meal_dispenser':
              case 'mixologist':
                navigateTo('/station');
                break;
              case 'bar_staff':
                navigateTo('/bar');
                break;
              case 'event_manager':
                navigateTo('/manager');
                break;
              case 'tenant_admin':
                navigateTo('/admin');
                break;
              default:
                navigateTo('/setup');
            }
          } else {
            navigateTo('/setup');
          }
        } else {
          navigateTo('/auth');
        }
      } catch (error) {
        console.error('Dashboard auth error:', error);
        if (isMounted) {
          navigateTo('/auth');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    getUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        navigateTo('/auth');
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [navigateTo]);

  // Always show loading spinner - never return null
  // This prevents white screen on iOS
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        {redirecting && (
          <p className="text-sm text-muted-foreground">Redirecting...</p>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
