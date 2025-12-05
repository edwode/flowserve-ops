import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header to verify the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create clients
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { 
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authHeader } }
      }
    );

    // Verify the caller is authenticated and is a tenant_admin
    const { data: { user: callerUser }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !callerUser) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Caller user:', callerUser.id);

    // Get caller's tenant_id
    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', callerUser.id)
      .single();

    if (profileError || !callerProfile?.tenant_id) {
      console.error('Profile error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Caller has no tenant assigned' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = callerProfile.tenant_id;
    console.log('Tenant ID:', tenantId);

    // Verify caller is tenant_admin
    const { data: callerRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUser.id)
      .eq('tenant_id', tenantId)
      .eq('role', 'tenant_admin')
      .maybeSingle();

    if (roleError || !callerRole) {
      console.error('Role check error:', roleError);
      return new Response(
        JSON.stringify({ error: 'Only tenant admins can create staff' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { email, fullName, role, phone, tempPassword } = await req.json();

    console.log('Creating staff:', { email, fullName, role });

    // Validate required fields
    if (!email || !role || !tempPassword) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, role, and tempPassword are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate role is allowed (not super_admin or support_admin)
    const allowedRoles = [
      'tenant_admin', 'event_manager', 'waiter', 'cashier',
      'drink_dispenser', 'meal_dispenser', 'mixologist', 'bar_staff', 'read_only_partner'
    ];
    if (!allowedRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: `Invalid role. Allowed roles: ${allowedRoles.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user already exists with this email
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    
    if (existingUser) {
      // Check if they're already in this tenant
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('tenant_id')
        .eq('id', existingUser.id)
        .single();

      if (existingProfile?.tenant_id === tenantId) {
        return new Response(
          JSON.stringify({ error: 'User already exists in this organization' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else if (existingProfile?.tenant_id) {
        return new Response(
          JSON.stringify({ error: 'User already belongs to another organization' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Create the user
    console.log('Creating auth user...');
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || email,
      },
    });

    if (createError) {
      console.error('Error creating user:', createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User created:', authData.user.id);

    // Wait for trigger to create profile
    await new Promise(resolve => setTimeout(resolve, 500));

    // Update profile with tenant_id and additional info
    console.log('Updating profile...');
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        tenant_id: tenantId,
        full_name: fullName || email,
        phone: phone || null,
        is_active: true,
      })
      .eq('id', authData.user.id);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      // Don't fail completely, try to continue
    }

    // Assign role
    console.log('Assigning role:', role);
    const { error: roleInsertError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: authData.user.id,
        tenant_id: tenantId,
        role: role,
      });

    if (roleInsertError) {
      console.error('Error assigning role:', roleInsertError);
      return new Response(
        JSON.stringify({ error: 'User created but role assignment failed: ' + roleInsertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Staff created successfully!');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Staff member created successfully',
        user: {
          id: authData.user.id,
          email: authData.user.email,
          role: role,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Create staff error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
