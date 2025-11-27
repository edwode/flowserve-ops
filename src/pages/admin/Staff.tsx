import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface StaffMember {
  id: string;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  user_roles: Array<{
    role: string;
  }>;
}

export function AdminStaff() {
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (!profile?.tenant_id) throw new Error("No tenant found");

      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          phone,
          is_active,
          user_roles!inner (role)
        `)
        .eq('tenant_id', profile.tenant_id)
        .eq('user_roles.tenant_id', profile.tenant_id);

      if (error) throw error;
      setStaff(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading staff",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      'tenant_admin': 'bg-purple-500/20 text-purple-700',
      'event_manager': 'bg-blue-500/20 text-blue-700',
      'waiter': 'bg-green-500/20 text-green-700',
      'cashier': 'bg-yellow-500/20 text-yellow-700',
      'drink_dispenser': 'bg-cyan-500/20 text-cyan-700',
      'meal_dispenser': 'bg-orange-500/20 text-orange-700',
      'mixologist': 'bg-pink-500/20 text-pink-700',
      'bar_staff': 'bg-indigo-500/20 text-indigo-700',
    };
    return colors[role] || 'bg-secondary';
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Staff & Roles</h2>
        <p className="text-muted-foreground">Manage your team members and their roles</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {staff.map((member) => (
          <Card key={member.id} className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{member.full_name || 'Unknown'}</h3>
                  {member.phone && (
                    <p className="text-sm text-muted-foreground">{member.phone}</p>
                  )}
                </div>
                <Badge variant={member.is_active ? "default" : "secondary"}>
                  {member.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                {member.user_roles.map((ur, idx) => (
                  <Badge
                    key={idx}
                    variant="secondary"
                    className={getRoleBadgeColor(ur.role)}
                  >
                    {ur.role.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {staff.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No staff members yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Staff members will appear here once they sign up and are assigned roles
          </p>
        </Card>
      )}
    </div>
  );
}
