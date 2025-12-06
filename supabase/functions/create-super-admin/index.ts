import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// This function can be called without authentication for initial super admin setup
// It will only create users if no super_admin exists yet
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { email, fullName, password } = await req.json();

    if (!email || !fullName || !password) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, fullName, password" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create or get System tenant for platform-level admins
    let systemTenantId: string;
    const { data: existingTenant } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("name", "System")
      .single();

    if (existingTenant) {
      systemTenantId = existingTenant.id;
    } else {
      const { data: newTenant, error: tenantError } = await supabaseAdmin
        .from("tenants")
        .insert({ name: "System", is_active: true })
        .select("id")
        .single();

      if (tenantError) throw tenantError;
      systemTenantId = newTenant.id;
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create the super admin user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      });

      if (authError) throw authError;
      userId = authData.user.id;

      // Wait for trigger to create profile
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Update profile with tenant
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        full_name: fullName,
        tenant_id: systemTenantId,
        is_active: true
      });

    if (profileError) throw profileError;

    // Check if super_admin role already exists
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .single();

    if (!existingRole) {
      // Assign super_admin role
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: userId,
          tenant_id: systemTenantId,
          role: "super_admin"
        });

      if (roleError) throw roleError;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Super admin created successfully",
        userId,
        email
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error creating super admin:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
