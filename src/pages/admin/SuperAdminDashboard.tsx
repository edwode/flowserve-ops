import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, Calendar, ShoppingCart, DollarSign, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Tenant {
  id: string;
  name: string;
  is_active: boolean;
  plan_name: string | null;
  currency: string;
  created_at: string;
}

interface TenantStats {
  totalEvents: number;
  totalOrders: number;
  totalRevenue: number;
  totalStaff: number;
}

export function SuperAdminDashboard() {
  const { toast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [stats, setStats] = useState<TenantStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    if (selectedTenantId) {
      fetchTenantStats(selectedTenantId);
    }
  }, [selectedTenantId]);

  const fetchTenants = async () => {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('name');

      if (error) throw error;
      setTenants(data || []);
      
      // Auto-select first non-System tenant
      const regularTenant = data?.find(t => t.name !== 'System');
      if (regularTenant) {
        setSelectedTenantId(regularTenant.id);
      }
    } catch (error: any) {
      toast({
        title: "Error loading tenants",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTenantStats = async (tenantId: string) => {
    setStatsLoading(true);
    try {
      // Fetch events count
      const { count: eventsCount } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      // Fetch orders count and revenue
      const { data: ordersData } = await supabase
        .from('orders')
        .select('total_amount')
        .eq('tenant_id', tenantId)
        .eq('status', 'paid');

      const totalRevenue = ordersData?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;

      // Fetch staff count
      const { count: staffCount } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      setStats({
        totalEvents: eventsCount || 0,
        totalOrders: ordersData?.length || 0,
        totalRevenue,
        totalStaff: staffCount || 0,
      });
    } catch (error: any) {
      toast({
        title: "Error loading stats",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setStatsLoading(false);
    }
  };

  const selectedTenant = tenants.find(t => t.id === selectedTenantId);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Super Admin Dashboard</h2>
          <p className="text-muted-foreground">View and manage all tenants</p>
        </div>

        <div className="w-full sm:w-72">
          <Select value={selectedTenantId || ""} onValueChange={setSelectedTenantId}>
            <SelectTrigger className="bg-background">
              <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Select a tenant" />
            </SelectTrigger>
            <SelectContent className="bg-popover border shadow-lg z-50">
              {tenants.filter(t => t.name !== 'System').map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  <div className="flex items-center gap-2">
                    <span>{tenant.name}</span>
                    {!tenant.is_active && (
                      <Badge variant="secondary" className="text-xs">Inactive</Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tenant Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenants.filter(t => t.name !== 'System').length}</div>
            <p className="text-xs text-muted-foreground">
              {tenants.filter(t => t.is_active && t.name !== 'System').length} active
            </p>
          </CardContent>
        </Card>

        {selectedTenant && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Events</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <div className="text-2xl font-bold">{stats?.totalEvents || 0}</div>
                )}
                <p className="text-xs text-muted-foreground">Total events</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Orders</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <div className="text-2xl font-bold">{stats?.totalOrders || 0}</div>
                )}
                <p className="text-xs text-muted-foreground">Paid orders</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <div className="text-2xl font-bold">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: selectedTenant.currency || 'USD',
                    }).format(stats?.totalRevenue || 0)}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Total revenue</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Selected Tenant Details */}
      {selectedTenant && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {selectedTenant.name}
              <Badge variant={selectedTenant.is_active ? "default" : "secondary"}>
                {selectedTenant.is_active ? "Active" : "Inactive"}
              </Badge>
            </CardTitle>
            <CardDescription>
              Tenant details and configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Plan</p>
                <p className="text-lg font-semibold capitalize">{selectedTenant.plan_name || 'Free'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Currency</p>
                <p className="text-lg font-semibold">{selectedTenant.currency}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Staff Members</p>
                <p className="text-lg font-semibold">{stats?.totalStaff || 0}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Created</p>
                <p className="text-lg font-semibold">
                  {new Date(selectedTenant.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Tenants List */}
      <Card>
        <CardHeader>
          <CardTitle>All Tenants</CardTitle>
          <CardDescription>Overview of all registered organizations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tenants.filter(t => t.name !== 'System').map((tenant) => (
              <div
                key={tenant.id}
                className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors ${
                  selectedTenantId === tenant.id ? 'bg-accent border-primary' : 'hover:bg-muted/50'
                }`}
                onClick={() => setSelectedTenantId(tenant.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{tenant.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {tenant.plan_name || 'Free'} plan • {tenant.currency}
                    </p>
                  </div>
                </div>
                <Badge variant={tenant.is_active ? "default" : "secondary"}>
                  {tenant.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            ))}
            {tenants.filter(t => t.name !== 'System').length === 0 && (
              <p className="text-center text-muted-foreground py-8">No tenants found</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}