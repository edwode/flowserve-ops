import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { User, MapPin } from "lucide-react";

interface StaffLocation {
  id: string;
  user_id: string;
  x_coordinate: number;
  y_coordinate: number;
  floor_level: number;
  last_seen: string;
  status: string;
  profiles: {
    full_name: string | null;
  };
  user_roles: Array<{
    role: string;
  }>;
}

interface FloorMapProps {
  eventId: string;
  tenantId: string;
}

export const FloorMap = ({ eventId, tenantId }: FloorMapProps) => {
  const [staffLocations, setStaffLocations] = useState<StaffLocation[]>([]);

  useEffect(() => {
    fetchStaffLocations();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('staff-locations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_locations',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          fetchStaffLocations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const fetchStaffLocations = async () => {
    const { data, error } = await supabase
      .from('staff_locations')
      .select(`
        *,
        profiles!staff_locations_user_id_fkey(full_name),
        user_roles!inner(role)
      `)
      .eq('event_id', eventId)
      .eq('tenant_id', tenantId)
      .gte('last_seen', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // Last 5 minutes

    if (data && !error) {
      setStaffLocations(data as any);
    }
  };

  const getRoleColor = (role: string) => {
    const colors: { [key: string]: string } = {
      waiter: 'bg-blue-500',
      cashier: 'bg-green-500',
      bar_staff: 'bg-purple-500',
      drink_dispenser: 'bg-orange-500',
      meal_dispenser: 'bg-red-500',
      mixologist: 'bg-pink-500',
      event_manager: 'bg-cyan-500',
    };
    return colors[role] || 'bg-gray-500';
  };

  return (
    <div className="relative w-full h-[500px] bg-muted rounded-lg border-2 border-border overflow-hidden">
      {/* Floor Map Grid */}
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Staff Markers */}
      {staffLocations.map((location) => {
        const role = location.user_roles?.[0]?.role || 'staff';
        const name = location.profiles?.full_name || 'Unknown';
        
        return (
          <div
            key={location.id}
            className="absolute transition-all duration-500 ease-out animate-fade-in"
            style={{
              left: `${location.x_coordinate}%`,
              top: `${location.y_coordinate}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="relative group">
              {/* Ping Animation */}
              <span className="absolute inset-0 animate-ping opacity-75">
                <MapPin className="w-6 h-6 text-primary" />
              </span>
              
              {/* Main Marker */}
              <div className={`relative ${getRoleColor(role)} rounded-full p-2 border-2 border-background shadow-lg`}>
                <User className="w-4 h-4 text-white" />
              </div>

              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                <div className="bg-popover border border-border rounded-lg shadow-xl p-2 whitespace-nowrap">
                  <p className="font-semibold text-sm">{name}</p>
                  <Badge variant="secondary" className="text-xs mt-1">
                    {role.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg">
        <p className="text-xs font-semibold mb-2 text-muted-foreground">Staff Roles</p>
        <div className="space-y-1">
          {['waiter', 'cashier', 'bar_staff', 'drink_dispenser'].map((role) => (
            <div key={role} className="flex items-center gap-2 text-xs">
              <div className={`w-3 h-3 rounded-full ${getRoleColor(role)}`} />
              <span className="text-foreground/80">{role.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Active Staff Count */}
      <div className="absolute top-4 right-4 bg-background/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-lg">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">{staffLocations.length} Active</span>
        </div>
      </div>
    </div>
  );
};
