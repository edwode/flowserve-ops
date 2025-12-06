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
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Loader2, Eye, EyeOff, MoreVertical, Pencil, Key, UserX, Trash2, UserCheck } from "lucide-react";

interface Zone {
  id: string;
  name: string;
  color: string;
}

interface StaffMember {
  id: string;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  zone_id: string | null;
  zone?: Zone | null;
  user_roles: Array<{
    role: string;
  }>;
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

export function AdminStaff() {
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
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
  const [editForm, setEditForm] = useState({ fullName: '', phone: '', role: '', zoneId: '' });

  // Password reset dialog state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordMember, setPasswordMember] = useState<StaffMember | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    fetchStaff();
    fetchZones();
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

      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          phone,
          is_active,
          zone_id,
          zone:zones (id, name, color),
          user_roles!inner (role)
        `)
        .eq('tenant_id', profile.tenant_id)
        .eq('user_roles.tenant_id', profile.tenant_id);

      if (error) throw error;
      setStaff((data || []) as StaffMember[]);
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
        .select('id, name, color')
        .eq('tenant_id', profile.tenant_id)
        .order('name');

      if (error) throw error;
      setZones(data || []);
    } catch (error: any) {
      console.error("Error fetching zones:", error);
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
    if (!editingMember) return;

    const profileSuccess = await handleManageStaff('update_profile', editingMember.id, {
      fullName: editForm.fullName,
      phone: editForm.phone,
      zoneId: editForm.zoneId || null,
    });

    if (profileSuccess && editForm.role && editForm.role !== editingMember.user_roles[0]?.role) {
      await handleManageStaff('update_role', editingMember.id, { role: editForm.role });
    }

    toast({ title: "Staff updated successfully" });
    setEditDialogOpen(false);
    setEditingMember(null);
    fetchStaff();
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

  const openEditDialog = (member: StaffMember) => {
    setEditingMember(member);
    setEditForm({
      fullName: member.full_name || '',
      phone: member.phone || '',
      role: member.user_roles[0]?.role || '',
      zoneId: member.zone_id || '',
    });
    setEditDialogOpen(true);
  };

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
                    {member.zone && (
                      <Badge 
                        variant="outline"
                        style={{ borderColor: member.zone.color, color: member.zone.color }}
                      >
                        {member.zone.name}
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
        <DialogContent className="sm:max-w-md">
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
                onValueChange={(value) => setEditForm({ ...editForm, role: value })}
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

            {editForm.role === 'waiter' && (
              <div className="space-y-2">
                <Label htmlFor="editZone">Assigned Zone</Label>
                <Select
                  value={editForm.zoneId}
                  onValueChange={(value) => setEditForm({ ...editForm, zoneId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No zone assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No zone assigned</SelectItem>
                    {zones.map((zone) => (
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
                  Waiters will only see tables in their assigned zone when creating orders
                </p>
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
