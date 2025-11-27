import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        navigate('/dashboard');
      }
    };
    checkAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-background p-4">
      <div className="text-center space-y-8 max-w-3xl">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
            <span className="text-primary-foreground font-bold text-2xl">EX</span>
          </div>
        </div>
        
        <div className="space-y-4">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            EventOpsX
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
            High-performance event operations platform for managing 1,000+ guest events in real-time
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
          <Button
            size="lg"
            className="text-lg px-8"
            onClick={() => navigate('/auth')}
          >
            Get Started
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="text-lg px-8"
            onClick={() => navigate('/auth')}
          >
            Sign In
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16">
          <div className="p-6 rounded-lg bg-card border border-border">
            <div className="text-4xl mb-3">⚡</div>
            <h3 className="font-semibold mb-2">Lightning Fast</h3>
            <p className="text-sm text-muted-foreground">
              Optimized for speed with real-time updates across all stations
            </p>
          </div>
          <div className="p-6 rounded-lg bg-card border border-border">
            <div className="text-4xl mb-3">🎯</div>
            <h3 className="font-semibold mb-2">Multi-Tenant</h3>
            <p className="text-sm text-muted-foreground">
              Complete tenant isolation with SaaS-ready architecture
            </p>
          </div>
          <div className="p-6 rounded-lg bg-card border border-border">
            <div className="text-4xl mb-3">📱</div>
            <h3 className="font-semibold mb-2">Mobile First</h3>
            <p className="text-sm text-muted-foreground">
              Optimized waiter interfaces for on-the-go order management
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
