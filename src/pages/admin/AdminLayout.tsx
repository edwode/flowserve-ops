import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { Button } from "@/components/ui/button";
import { LogOut, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function AdminLayout() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    console.log('[AdminLayout] Starting checkAdminAccess');
    try {
      console.log('[AdminLayout] Getting user...');
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      console.log('[AdminLayout] User result:', { user: user?.id, error: userError });
      
      if (!user) {
        console.log('[AdminLayout] No user, redirecting to auth');
        navigate('/auth', { replace: true });
        return;
      }

      console.log('[AdminLayout] Fetching profile...');
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();
      console.log('[AdminLayout] Profile result:', { profile, error: profileError });

      if (!profile?.tenant_id) {
        console.log('[AdminLayout] No tenant_id, redirecting to setup');
        navigate('/setup', { replace: true });
        return;
      }

      console.log('[AdminLayout] Fetching user role...');
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('tenant_id', profile.tenant_id)
        .single();
      console.log('[AdminLayout] Role result:', { userRole, error: roleError });

      if (!userRole || userRole.role !== 'tenant_admin') {
        console.log('[AdminLayout] Not admin, redirecting to dashboard');
        toast({
          title: "Access denied",
          description: "Only tenant admins can access this area",
          variant: "destructive",
        });
        navigate('/dashboard', { replace: true });
        return;
      }
      
      console.log('[AdminLayout] Access granted');
      setHasAccess(true);
    } catch (error: any) {
      console.error('[AdminLayout] Error:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      navigate('/dashboard', { replace: true });
    } finally {
      console.log('[AdminLayout] Setting loading to false');
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    navigate('/auth');
  };

  // Show loading spinner while checking access
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render admin content if user doesn't have access
  if (!hasAccess) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex w-full" style={{ minHeight: '-webkit-fill-available' }}>
        <AdminSidebar />
        
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="sticky top-0 z-10 h-14 border-b bg-card flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <h1 className="text-lg font-semibold">Admin Panel</h1>
            </div>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
