import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

const Setup = () => {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Account Setup Required</CardTitle>
          <CardDescription>
            Your account needs to be configured by an administrator.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Please contact your system administrator to:
          </p>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
            <li>Assign you to a tenant organization</li>
            <li>Grant you the appropriate role</li>
            <li>Configure your access permissions</li>
          </ul>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleSignOut}
          >
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Setup;
