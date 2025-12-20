import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        
        // Check if user has a tenant assigned
        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id, user_roles(role)')
          .eq('id', session.user.id)
          .single();

        if (!profile?.tenant_id) {
          // No tenant assigned yet - redirect to setup
          navigate('/setup');
        } else if (profile.user_roles && profile.user_roles.length > 0) {
          // Route based on role
          const role = (profile.user_roles as any[])[0].role;
          switch (role) {
            case 'waiter':
              navigate('/waiter');
              break;
            case 'cashier':
              navigate('/cashier');
              break;
            case 'drink_dispenser':
            case 'meal_dispenser':
            case 'mixologist':
              navigate('/station');
              break;
            case 'bar_staff':
              navigate('/bar');
              break;
            case 'event_manager':
              navigate('/manager');
              break;
            case 'tenant_admin':
              navigate('/admin');
              break;
            default:
              navigate('/setup');
          }
        } else {
          navigate('/setup');
        }
      } else {
        navigate('/auth');
      }
      setLoading(false);
    };

    getUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        navigate('/auth');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return null;
};

export default Dashboard;
