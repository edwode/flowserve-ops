import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { email, password, tenantName, fullName } = await req.json();

    console.log('Setup admin request received for email:', email);

    // Validate required fields
    if (!email || !password || !tenantName) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields: email, password, and tenantName are required' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if any tenants already exist (security measure - only allow initial setup)
    const { data: existingTenants, error: tenantsCheckError } = await supabaseClient
      .from('tenants')
      .select('id')
      .limit(1);

    if (tenantsCheckError) {
      console.error('Error checking existing tenants:', tenantsCheckError);
      throw tenantsCheckError;
    }

    if (existingTenants && existingTenants.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: 'System already initialized. Please contact support or use the admin interface to add more users.' 
        }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Step 1: Create the tenant
    console.log('Creating tenant:', tenantName);
    const { data: tenant, error: tenantError } = await supabaseClient
      .from('tenants')
      .insert({
        name: tenantName,
        is_active: true,
        plan_name: 'free',
      })
      .select()
      .single();

    if (tenantError) {
      console.error('Error creating tenant:', tenantError);
      throw tenantError;
    }

    console.log('Tenant created:', tenant.id);

    // Step 2: Create the admin user account
    console.log('Creating admin user account...');
    const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for initial admin
      user_metadata: {
        full_name: fullName || 'Admin User',
      },
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      // Clean up tenant if user creation fails
      await supabaseClient.from('tenants').delete().eq('id', tenant.id);
      throw authError;
    }

    console.log('User created:', authData.user.id);

    // Step 3: Update the profile with tenant_id
    console.log('Updating user profile with tenant_id...');
    const { error: profileError } = await supabaseClient
      .from('profiles')
      .update({
        tenant_id: tenant.id,
        full_name: fullName || 'Admin User',
      })
      .eq('id', authData.user.id);

    if (profileError) {
      console.error('Error updating profile:', profileError);
      throw profileError;
    }

    // Step 4: Assign tenant_admin role
    console.log('Assigning tenant_admin role...');
    const { error: roleError } = await supabaseClient
      .from('user_roles')
      .insert({
        user_id: authData.user.id,
        tenant_id: tenant.id,
        role: 'tenant_admin',
      });

    if (roleError) {
      console.error('Error assigning role:', roleError);
      throw roleError;
    }

    console.log('Setup completed successfully!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Admin user and tenant created successfully',
        tenant: {
          id: tenant.id,
          name: tenant.name,
        },
        user: {
          id: authData.user.id,
          email: authData.user.email,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Setup error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during setup';
    return new Response(
      JSON.stringify({ 
        error: errorMessage
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
