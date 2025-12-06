import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the calling user
    const { data: { user: caller }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    console.log('Caller user:', caller.id)

    // Get caller's tenant
    const { data: callerProfile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', caller.id)
      .single()

    if (profileError || !callerProfile?.tenant_id) {
      return new Response(JSON.stringify({ error: 'Caller has no tenant' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const tenantId = callerProfile.tenant_id
    console.log('Tenant ID:', tenantId)

    // Check caller is tenant_admin
    const { data: callerRoles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .eq('tenant_id', tenantId)

    const isAdmin = callerRoles?.some(r => r.role === 'tenant_admin')
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Only tenant admins can manage staff' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { action, userId, ...payload } = await req.json()
    console.log('Action:', action, 'Target user:', userId)

    // Verify target user belongs to same tenant
    const { data: targetProfile } = await supabaseClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', userId)
      .single()

    if (!targetProfile || targetProfile.tenant_id !== tenantId) {
      return new Response(JSON.stringify({ error: 'User not found in tenant' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Prevent self-modification for deactivation
    if (action === 'deactivate' && userId === caller.id) {
      return new Response(JSON.stringify({ error: 'Cannot deactivate yourself' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    switch (action) {
      case 'update_profile': {
        const { fullName, phone, zoneId, eventId } = payload
        console.log('Updating profile:', { fullName, phone, zoneId, eventId })
        
        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ 
            full_name: fullName,
            phone: phone,
            zone_id: zoneId || null,
            event_id: eventId || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId)
          .eq('tenant_id', tenantId)

        if (error) {
          console.error('Profile update error:', error)
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        
        console.log('Profile updated successfully')
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'update_role': {
        const { role } = payload
        console.log('Updating role to:', role)
        
        const allowedRoles = ['event_manager', 'waiter', 'cashier', 'drink_dispenser', 'meal_dispenser', 'mixologist', 'bar_staff', 'read_only_partner']
        if (!allowedRoles.includes(role)) {
          return new Response(JSON.stringify({ error: 'Invalid role' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Delete existing roles for this user in tenant
        await supabaseAdmin
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('tenant_id', tenantId)

        // Insert new role
        const { error } = await supabaseAdmin
          .from('user_roles')
          .insert({
            user_id: userId,
            tenant_id: tenantId,
            role: role,
          })

        if (error) {
          console.error('Role update error:', error)
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        console.log('Role updated successfully')
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'reset_password': {
        const { newPassword } = payload
        console.log('Resetting password for user')
        
        if (!newPassword || newPassword.length < 6) {
          return new Response(JSON.stringify({ error: 'Password must be at least 6 characters' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: newPassword,
        })

        if (error) {
          console.error('Password reset error:', error)
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        console.log('Password reset successfully')
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'toggle_active': {
        const { isActive } = payload
        console.log('Setting active status to:', isActive)
        
        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ 
            is_active: isActive,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId)
          .eq('tenant_id', tenantId)

        if (error) {
          console.error('Toggle active error:', error)
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        console.log('Active status updated successfully')
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'delete': {
        // Don't delete auth user, just remove from tenant
        console.log('Removing user from tenant')
        
        // Delete user roles
        await supabaseAdmin
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('tenant_id', tenantId)

        // Clear tenant_id from profile (soft delete from tenant)
        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ 
            tenant_id: null,
            is_active: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId)
          .eq('tenant_id', tenantId)

        if (error) {
          console.error('Delete error:', error)
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        console.log('User removed from tenant successfully')
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

  } catch (error: unknown) {
    console.error('Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
