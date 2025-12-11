import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Loader2, Eye, EyeOff, MoreVertical, Pencil, Key, UserX, Trash2, UserCheck, MapPin, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Zone {
  id: string;
  name: string;
  color: string;
  event_id: string;
}

interface Event {
  id: string;
  name: string;
}

interface ZoneRoleAssignment {
  id: string;
  user_id: string;
  zone_id: string;
  role: string;
  zone?: Zone;
}

interface ZoneTable {
  id: string;
  table_number: string;
  is_adhoc: boolean;
  assigned_waiter_id: string | null;
  assigned_waiter_name?: string | null;
}

interface StaffMember {
  id: string;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  zone_id: string | null;
  event_id: string | null;
  zone?: { id: string; name: string; color: string } | null;
  event?: Event | null;
  user_roles: Array<{
    role: string;
  }>;
  zone_assignments?: ZoneRoleAssignment[];
}

const ROLES = [
  { value: 'tenant_admin', label: 'Tenant Admin', description: 'Full admin access' },
  { value: 'event_manager', label: 'Event Manager', description: 'Manages events and analytics' },
  { value: 'waiter', label: 'Waiter', description: 'Takes orders and serves tables' },
  { value: 'cashier', label: 'Cashier', description: 'Processes payments' },
  { value: 'drink_dispenser', label: 'Drink Dispenser', description: 'Handles drink orders' },
  { value: 'meal_dispenser', label: 'Meal Dispenser', description: 'Handles food orders' },
  { value: 'mixologist', label: 'Mixologist', description: 'Prepares cocktails' },
  { value: 'bar_staff', label: 'Bar Staff', description: 'Handles bar orders' },
  { value: 'read_only_partner', label: 'Read-Only Partner', description: 'View-only access' },
];

const ASSIGNABLE_ROLES = ROLES.filter(r => r.value !== 'tenant_admin');

// Station roles that support multi-zone assignment
const STATION_ROLES = ['cashier', 'bar_staff', 'mixologist', 'drink_dispenser', 'meal_dispenser'];

export function AdminStaff() {
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  
  // Create form state
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    phone: '',
    role: '',
    tempPassword: '',
  });

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [editForm, setEditForm] = useState({ fullName: '', phone: '', role: '', zoneId: '', eventId: '' });
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [allZoneAssignments, setAllZoneAssignments] = useState<ZoneRoleAssignment[]>([]);
  
  // Waiter table assignment state
  const [zoneTables, setZoneTables] = useState<ZoneTable[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);

  // Password reset dialog state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordMember, setPasswordMember] = useState<StaffMember | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    fetchStaff();
    fetchZones();
    fetchEvents();
  }, []);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (!profile?.tenant_id) throw new Error("No tenant found");
      setTenantId(profile.tenant_id);

      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          phone,
          is_active,
          zone_id,
          event_id,
          zones (id, name, color),
          user_roles!inner (role)
        `)
        .eq('tenant_id', profile.tenant_id)
        .eq('user_roles.tenant_id', profile.tenant_id);

      if (error) throw error;
      
      // Fetch events separately to avoid ambiguous relationship issue
      const eventIds = (data || []).map(d => d.event_id).filter(Boolean) as string[];
      let eventsMap: Record<string, Event> = {};
      
      if (eventIds.length > 0) {
        const { data: eventsData } = await supabase
          .from('events')
          .select('id, name')
          .in('id', eventIds);
        
        eventsMap = (eventsData || []).reduce((acc, e) => {
          acc[e.id] = e;
          return acc;
        }, {} as Record<string, Event>);
      }

      // Fetch zone role assignments for all staff
      const userIds = (data || []).map(d => d.id);
      let zoneAssignmentsMap: Record<string, ZoneRoleAssignment[]> = {};
      
      // Fetch all zone role assignments for the tenant (not just for current staff)
      const { data: allAssignments } = await supabase
        .from('zone_role_assignments')
        .select(`
          id,
          user_id,
          zone_id,
          role,
          zones (id, name, color)
        `)
        .eq('tenant_id', profile.tenant_id);
      
      setAllZoneAssignments((allAssignments || []).map(za => ({
        ...za,
        zone: za.zones as Zone
      })));
      
      if (userIds.length > 0) {
        zoneAssignmentsMap = (allAssignments || []).reduce((acc, za) => {
          if (userIds.includes(za.user_id)) {
            if (!acc[za.user_id]) acc[za.user_id] = [];
            acc[za.user_id].push({
              ...za,
              zone: za.zones as Zone
            });
          }
          return acc;
        }, {} as Record<string, ZoneRoleAssignment[]>);
      }
      
      // Map the response to expected format
      const mappedData = (data || []).map(item => ({
        ...item,
        zone: item.zones,
        event: item.event_id ? eventsMap[item.event_id] || null : null,
        zone_assignments: zoneAssignmentsMap[item.id] || [],
      }));
      setStaff(mappedData as StaffMember[]);
    } catch (error: any) {
      toast({
        title: "Error loading staff",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchZones = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (!profile?.tenant_id) return;

      const { data, error } = await supabase
        .from('zones')
        .select('id, name, color, event_id')
        .eq('tenant_id', profile.tenant_id)
        .order('name');

      if (error) throw error;
      setZones(data || []);
    } catch (error: any) {
      console.error("Error fetching zones:", error);
    }
  };

  // Filter zones by selected event
  const filteredZones = editForm.eventId && editForm.eventId !== 'none'
    ? zones.filter(z => z.event_id === editForm.eventId)
    : zones;

  const fetchEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (!profile?.tenant_id) return;

      const { data, error } = await supabase
        .from('events')
        .select('id, name')
        .eq('tenant_id', profile.tenant_id)
        .eq('is_active', true)
        .order('event_date', { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (error: any) {
      console.error("Error fetching events:", error);
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.role || !formData.tempPassword) {
      toast({
        title: "Missing fields",
        description: "Email, role, and temporary password are required",
        variant: "destructive",
      });
      return;
    }

    if (formData.tempPassword.length < 6) {
      toast({
        title: "Password too short",
        description: "Temporary password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    try {
      setCreating(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke('create-staff', {
        body: {
          email: formData.email,
          fullName: formData.fullName,
          phone: formData.phone,
          role: formData.role,
          tempPassword: formData.tempPassword,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to create staff');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({
        title: "Staff member created",
        description: `${formData.email} has been added as ${formData.role.replace(/_/g, ' ')}`,
      });

      setFormData({ email: '', fullName: '', phone: '', role: '', tempPassword: '' });
      setDialogOpen(false);
      fetchStaff();
      
    } catch (error: any) {
      toast({
        title: "Error creating staff",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleManageStaff = async (action: string, userId: string, payload: Record<string, any> = {}) => {
    try {
      setActionLoading(userId);
      
      const response = await supabase.functions.invoke('manage-staff', {
        body: { action, userId, ...payload },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Action failed');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return true;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return false;
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditSubmit = async () => {
    if (!editingMember || !tenantId) return;

    setActionLoading(editingMember.id);

    try {
      const profileSuccess = await handleManageStaff('update_profile', editingMember.id, {
        fullName: editForm.fullName,
        phone: editForm.phone,
        zoneId: editForm.zoneId === 'none' ? null : editForm.zoneId || null,
        eventId: editForm.eventId === 'none' ? null : editForm.eventId || null,
      });

      if (profileSuccess && editForm.role && editForm.role !== editingMember.user_roles[0]?.role) {
        await handleManageStaff('update_role', editingMember.id, { role: editForm.role });
      }

      // Handle table assignments for waiters
      if (editForm.role === 'waiter' && editForm.zoneId && editForm.zoneId !== 'none') {
        // First, unassign all tables currently assigned to this waiter in the zone
        const { error: unassignError } = await supabase
          .from('tables')
          .update({ assigned_waiter_id: null })
          .eq('assigned_waiter_id', editingMember.id)
          .eq('zone_id', editForm.zoneId);
        
        if (unassignError) console.error("Error unassigning tables:", unassignError);
        
        // Then assign selected tables to this waiter
        if (selectedTableIds.length > 0) {
          const { error: assignError } = await supabase
            .from('tables')
            .update({ assigned_waiter_id: editingMember.id })
            .in('id', selectedTableIds);
          
          if (assignError) throw assignError;
        }
      } else if (editForm.role === 'waiter') {
        // If waiter has no zone, unassign all their tables
        const { error: unassignError } = await supabase
          .from('tables')
          .update({ assigned_waiter_id: null })
          .eq('assigned_waiter_id', editingMember.id);
        
        if (unassignError) console.error("Error unassigning tables:", unassignError);
      }

      // Handle zone assignments for station roles
      if (STATION_ROLES.includes(editForm.role)) {
        // Get current zone assignments
        const currentZoneIds = (editingMember.zone_assignments || []).map(za => za.zone_id);
        
        // Zones to add
        const zonesToAdd = selectedZones.filter(zId => !currentZoneIds.includes(zId));
        // Zones to remove
        const zonesToRemove = currentZoneIds.filter(zId => !selectedZones.includes(zId));

        // Remove old assignments
        if (zonesToRemove.length > 0) {
          const { error: deleteError } = await supabase
            .from('zone_role_assignments')
            .delete()
            .eq('user_id', editingMember.id)
            .in('zone_id', zonesToRemove);
          
          if (deleteError) throw deleteError;
        }

        // Add new assignments
        for (const zoneId of zonesToAdd) {
          const { error: insertError } = await supabase
            .from('zone_role_assignments')
            .insert({
              user_id: editingMember.id,
              zone_id: zoneId,
              tenant_id: tenantId,
              role: editForm.role as any,
            });
          
          if (insertError) {
            // Check if it's a unique constraint violation (another user already has this role in this zone)
            if (insertError.code === '23505') {
              const zone = zones.find(z => z.id === zoneId);
              toast({
                title: "Zone assignment conflict",
                description: `Another ${editForm.role.replace(/_/g, ' ')} is already assigned to ${zone?.name || 'this zone'}`,
                variant: "destructive",
              });
            } else {
              throw insertError;
            }
          }
        }
      } else {
        // If not a station role, remove any existing zone assignments
        const { error: deleteError } = await supabase
          .from('zone_role_assignments')
          .delete()
          .eq('user_id', editingMember.id);
        
        if (deleteError) console.error("Error removing zone assignments:", deleteError);
      }

      toast({ title: "Staff updated successfully" });
      setEditDialogOpen(false);
      setEditingMember(null);
      fetchStaff();
    } catch (error: any) {
      toast({
        title: "Error updating staff",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePasswordReset = async () => {
    if (!passwordMember || !newPassword) return;

    const success = await handleManageStaff('reset_password', passwordMember.id, { newPassword });
    if (success) {
      toast({ title: "Password reset successfully" });
      setPasswordDialogOpen(false);
      setPasswordMember(null);
      setNewPassword('');
    }
  };

  const handleToggleActive = async (member: StaffMember) => {
    const success = await handleManageStaff('toggle_active', member.id, { isActive: !member.is_active });
    if (success) {
      toast({ title: member.is_active ? "Staff deactivated" : "Staff activated" });
      fetchStaff();
    }
  };

  const handleDeleteStaff = async (member: StaffMember) => {
    const success = await handleManageStaff('delete', member.id);
    if (success) {
      toast({ title: "Staff removed from organization" });
      fetchStaff();
    }
  };

  // Fetch tables for a specific zone
  const fetchTablesForZone = async (zoneId: string) => {
    if (!zoneId || zoneId === 'none') {
      setZoneTables([]);
      return;
    }
    
    setLoadingTables(true);
    try {
      const { data, error } = await supabase
        .from('tables')
        .select(`
          id,
          table_number,
          is_adhoc,
          assigned_waiter_id,
          profiles:assigned_waiter_id (full_name)
        `)
        .eq('zone_id', zoneId)
        .order('table_number');
      
      if (error) throw error;
      
      setZoneTables((data || []).map(t => ({
        id: t.id,
        table_number: t.table_number,
        is_adhoc: t.is_adhoc,
        assigned_waiter_id: t.assigned_waiter_id,
        assigned_waiter_name: t.profiles?.full_name || null,
      })));
    } catch (error: any) {
      console.error("Error fetching tables:", error);
      setZoneTables([]);
    } finally {
      setLoadingTables(false);
    }
  };

  const openEditDialog = async (member: StaffMember) => {
    setEditingMember(member);
    const role = member.user_roles[0]?.role || '';
    setEditForm({
      fullName: member.full_name || '',
      phone: member.phone || '',
      role: role,
      zoneId: member.zone_id || 'none',
      eventId: member.event_id || 'none',
    });
    // Set selected zones from existing zone assignments
    setSelectedZones((member.zone_assignments || []).map(za => za.zone_id));
    
    // For waiters, fetch tables and set selected tables
    if (role === 'waiter' && member.zone_id) {
      await fetchTablesForZone(member.zone_id);
      // Fetch tables assigned to this waiter
      const { data: assignedTables } = await supabase
        .from('tables')
        .select('id')
        .eq('assigned_waiter_id', member.id);
      setSelectedTableIds((assignedTables || []).map(t => t.id));
    } else {
      setZoneTables([]);
      setSelectedTableIds([]);
    }
    
    setEditDialogOpen(true);
  };

  // Clear zone selections when event changes (since zones are event-specific)
  const handleEventChange = (eventId: string) => {
    setEditForm({ ...editForm, eventId, zoneId: 'none' });
    setSelectedZones([]);
    setZoneTables([]);
    setSelectedTableIds([]);
  };
  
  // Handle zone change for waiter to fetch tables
  const handleWaiterZoneChange = async (zoneId: string) => {
    setEditForm({ ...editForm, zoneId });
    setSelectedTableIds([]);
    if (zoneId !== 'none') {
      await fetchTablesForZone(zoneId);
    } else {
      setZoneTables([]);
    }
  };
  
  // Toggle table selection for waiter
  const handleTableToggle = (tableId: string) => {
    setSelectedTableIds(prev => 
      prev.includes(tableId) 
        ? prev.filter(id => id !== tableId)
        : [...prev, tableId]
    );
  };
  
  // Get table conflicts (non-adhoc tables assigned to another waiter)
  const getTableConflicts = () => {
    if (!editingMember || editForm.role !== 'waiter') return [];
    
    const conflicts: { tableNumber: string; waiterName: string }[] = [];
    
    selectedTableIds.forEach(tableId => {
      const table = zoneTables.find(t => t.id === tableId);
      if (table && !table.is_adhoc && table.assigned_waiter_id && table.assigned_waiter_id !== editingMember.id) {
        conflicts.push({
          tableNumber: table.table_number,
          waiterName: table.assigned_waiter_name || 'Another waiter',
        });
      }
    });
    
    return conflicts;
  };
  
  const tableConflicts = getTableConflicts();

  const openPasswordDialog = (member: StaffMember) => {
    setPasswordMember(member);
    setNewPassword('');
    setPasswordDialogOpen(true);
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      'tenant_admin': 'bg-purple-500/20 text-purple-700 dark:text-purple-300',
      'event_manager': 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
      'waiter': 'bg-green-500/20 text-green-700 dark:text-green-300',
      'cashier': 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300',
      'drink_dispenser': 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300',
      'meal_dispenser': 'bg-orange-500/20 text-orange-700 dark:text-orange-300',
      'mixologist': 'bg-pink-500/20 text-pink-700 dark:text-pink-300',
      'bar_staff': 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300',
      'read_only_partner': 'bg-gray-500/20 text-gray-700 dark:text-gray-300',
    };
    return colors[role] || 'bg-secondary';
  };

  const isStationRole = (role: string) => STATION_ROLES.includes(role);

  const handleZoneToggle = (zoneId: string) => {
    setSelectedZones(prev => 
      prev.includes(zoneId) 
        ? prev.filter(id => id !== zoneId)
        : [...prev, zoneId]
    );
  };

  // Get zones with conflicts (another user has the same role in that zone)
  const getZoneConflicts = () => {
    if (!editingMember || !isStationRole(editForm.role)) return [];
    
    const conflicts: { zoneName: string; userName: string }[] = [];
    
    selectedZones.forEach(zoneId => {
      const existingAssignment = allZoneAssignments.find(
        za => za.zone_id === zoneId && 
              za.role === editForm.role && 
              za.user_id !== editingMember.id
      );
      
      if (existingAssignment) {
        const zone = zones.find(z => z.id === zoneId);
        const assignedUser = staff.find(s => s.id === existingAssignment.user_id);
        conflicts.push({
          zoneName: zone?.name || 'Unknown Zone',
          userName: assignedUser?.full_name || 'Another user',
        });
      }
    });
    
    return conflicts;
  };

  const zoneConflicts = getZoneConflicts();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Staff & Roles</h2>
          <p className="text-muted-foreground">Manage your team members and their roles</p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Staff
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Staff Member</DialogTitle>
              <DialogDescription>
                Create an account for a new team member. They'll use the temporary password to sign in.
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="staff@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+234 xxx xxx xxxx"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        <div className="flex flex-col">
                          <span>{role.label}</span>
                          <span className="text-xs text-muted-foreground">{role.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tempPassword">Temporary Password *</Label>
                <div className="relative">
                  <Input
                    id="tempPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min 6 characters"
                    value={formData.tempPassword}
                    onChange={(e) => setFormData({ ...formData, tempPassword: e.target.value })}
                    required
                    minLength={6}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share this password with the staff member
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Staff
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {staff.map((member) => (
              <Card key={member.id} className="p-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{member.full_name || 'Unknown'}</h3>
                      {member.phone && (
                        <p className="text-sm text-muted-foreground">{member.phone}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={member.is_active ? "default" : "secondary"}>
                        {member.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={actionLoading === member.id}>
                            {actionLoading === member.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreVertical className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(member)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openPasswordDialog(member)}>
                            <Key className="h-4 w-4 mr-2" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleActive(member)}>
                            {member.is_active ? (
                              <>
                                <UserX className="h-4 w-4 mr-2" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-4 w-4 mr-2" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove from Org
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove staff member?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove {member.full_name || 'this user'} from your organization. They will lose access to all data.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteStaff(member)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {member.user_roles.map((ur, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className={getRoleBadgeColor(ur.role)}
                      >
                        {ur.role.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                    
                    {/* Show single zone for waiters */}
                    {member.zone && !isStationRole(member.user_roles[0]?.role) && (
                      <Badge 
                        variant="outline"
                        style={{ borderColor: member.zone.color, color: member.zone.color }}
                      >
                        {member.zone.name}
                      </Badge>
                    )}
                    
                    {/* Show multiple zones for station roles */}
                    {isStationRole(member.user_roles[0]?.role) && member.zone_assignments && member.zone_assignments.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {member.zone_assignments.map((za) => (
                          <Badge 
                            key={za.id}
                            variant="outline"
                            className="text-xs"
                            style={{ borderColor: za.zone?.color, color: za.zone?.color }}
                          >
                            {za.zone?.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                    
                    {member.event && (
                      <Badge variant="outline" className="border-primary/50 text-primary">
                        {member.event.name}
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {staff.length === 0 && (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No staff members yet</p>
              <p className="text-sm text-muted-foreground mt-2">
                Click "Add Staff" to create accounts for your team members
              </p>
            </Card>
          )}
        </>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
            <DialogDescription>
              Update staff details and role
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editFullName">Full Name</Label>
              <Input
                id="editFullName"
                value={editForm.fullName}
                onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="editPhone">Phone</Label>
              <Input
                id="editPhone"
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="editRole">Role</Label>
              <Select
                value={editForm.role}
                onValueChange={(value) => {
                  setEditForm({ ...editForm, role: value });
                  // Clear zone selections when switching roles
                  if (!STATION_ROLES.includes(value)) {
                    setSelectedZones([]);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Event assignment for waiter and station roles */}
            {(editForm.role === 'waiter' || isStationRole(editForm.role)) && (
              <div className="space-y-2">
                <Label htmlFor="editEvent">Assigned Event</Label>
                <Select
                  value={editForm.eventId}
                  onValueChange={handleEventChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No event assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No event assigned (all events)</SelectItem>
                    {events.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {editForm.role === 'waiter' 
                    ? 'Waiters will only see this event when creating orders'
                    : 'Station staff will only operate within this event'
                  }
                </p>
              </div>
            )}

            {/* Waiter-specific: Single zone assignment */}
            {editForm.role === 'waiter' && (
              <div className="space-y-2">
                <Label htmlFor="editZone">Assigned Zone</Label>
                <Select
                  value={editForm.zoneId}
                  onValueChange={handleWaiterZoneChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No zone assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No zone assigned (all tables)</SelectItem>
                    {filteredZones.map((zone) => (
                      <SelectItem key={zone.id} value={zone.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: zone.color }}
                          />
                          {zone.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {filteredZones.length === 0 && editForm.eventId !== 'none'
                    ? 'No zones available for the selected event'
                    : 'Waiters will only see tables in their assigned zone'
                  }
                </p>
              </div>
            )}
            
            {/* Waiter table assignment */}
            {editForm.role === 'waiter' && editForm.zoneId && editForm.zoneId !== 'none' && (
              <div className="space-y-2">
                <Label>Assigned Tables</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select tables this waiter will be responsible for. Ad-hoc tables can be assigned to multiple waiters.
                </p>
                
                {loadingTables ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : zoneTables.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                    {zoneTables.map((table) => {
                      const isAssignedToOther = !table.is_adhoc && table.assigned_waiter_id && table.assigned_waiter_id !== editingMember?.id;
                      return (
                        <div key={table.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`table-${table.id}`}
                            checked={selectedTableIds.includes(table.id)}
                            onCheckedChange={() => handleTableToggle(table.id)}
                          />
                          <label 
                            htmlFor={`table-${table.id}`}
                            className="flex items-center gap-2 text-sm cursor-pointer flex-1"
                          >
                            <span>{table.table_number}</span>
                            {table.is_adhoc && (
                              <Badge variant="secondary" className="text-xs bg-purple-500/20 text-purple-700 dark:text-purple-300">
                                Ad-hoc
                              </Badge>
                            )}
                            {isAssignedToOther && (
                              <span className="text-xs text-muted-foreground">
                                (assigned to {table.assigned_waiter_name})
                              </span>
                            )}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No tables available in this zone. Create tables in the Tables section first.
                  </p>
                )}
                
                {selectedTableIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedTableIds.length} table{selectedTableIds.length > 1 ? 's' : ''} selected
                  </p>
                )}
                
                {tableConflicts.length > 0 && (
                  <Alert variant="default" className="mt-3 border-amber-500/50 bg-amber-500/10">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <AlertDescription className="text-amber-700 dark:text-amber-300 text-sm">
                      {tableConflicts.length === 1 ? (
                        <>
                          Table <strong>{tableConflicts[0].tableNumber}</strong> is already assigned to <strong>{tableConflicts[0].waiterName}</strong>. 
                          Saving will reassign it to this waiter.
                        </>
                      ) : (
                        <>
                          Tables {tableConflicts.map(c => c.tableNumber).join(', ')} are already assigned to other waiters. 
                          Saving will reassign them to this waiter.
                        </>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Station roles: Multi-zone assignment */}
            {isStationRole(editForm.role) && (
              <div className="space-y-2">
                <Label>Assigned Zones</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select zones where this {editForm.role.replace(/_/g, ' ')} will operate. Only one {editForm.role.replace(/_/g, ' ')} can be assigned per zone.
                </p>
                
                {filteredZones.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                    {filteredZones.map((zone) => (
                      <div key={zone.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`zone-${zone.id}`}
                          checked={selectedZones.includes(zone.id)}
                          onCheckedChange={() => handleZoneToggle(zone.id)}
                        />
                        <label 
                          htmlFor={`zone-${zone.id}`}
                          className="flex items-center gap-2 text-sm cursor-pointer flex-1"
                        >
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: zone.color }}
                          />
                          {zone.name}
                        </label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {editForm.eventId !== 'none' 
                      ? 'No zones available for the selected event. Create zones in the Tables section first.'
                      : 'No zones available. Create zones in the Tables section first.'
                    }
                  </p>
                )}
                
                {selectedZones.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedZones.length} zone{selectedZones.length > 1 ? 's' : ''} selected
                  </p>
                )}
                
                {zoneConflicts.length > 0 && (
                  <Alert variant="default" className="mt-3 border-amber-500/50 bg-amber-500/10">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <AlertDescription className="text-amber-700 dark:text-amber-300 text-sm">
                      {zoneConflicts.length === 1 ? (
                        <>
                          <strong>{zoneConflicts[0].userName}</strong> is already assigned as {editForm.role.replace(/_/g, ' ')} in <strong>{zoneConflicts[0].zoneName}</strong>. 
                          Saving will replace their assignment.
                        </>
                      ) : (
                        <>
                          Other {editForm.role.replace(/_/g, ' ')}s are already assigned in: {zoneConflicts.map(c => c.zoneName).join(', ')}. 
                          Saving will replace their assignments.
                        </>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleEditSubmit} disabled={actionLoading !== null}>
                {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {passwordMember?.full_name || 'this user'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Min 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancel</Button>
              <Button onClick={handlePasswordReset} disabled={!newPassword || newPassword.length < 6 || actionLoading !== null}>
                {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Reset Password
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
