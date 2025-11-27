export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          resource_id: string | null
          resource_type: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          resource_id?: string | null
          resource_type: string
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          resource_id?: string | null
          resource_type?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string
          expected_guests: number | null
          id: string
          is_active: boolean | null
          name: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date: string
          expected_guests?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          expected_guests?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          current_inventory: number | null
          event_id: string | null
          id: string
          is_available: boolean | null
          name: string
          price: number
          starting_inventory: number | null
          station_type: Database["public"]["Enums"]["station_type"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          current_inventory?: number | null
          event_id?: string | null
          id?: string
          is_available?: boolean | null
          name: string
          price?: number
          starting_inventory?: number | null
          station_type: Database["public"]["Enums"]["station_type"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          current_inventory?: number | null
          event_id?: string | null
          id?: string
          is_available?: boolean | null
          name?: string
          price?: number
          starting_inventory?: number | null
          station_type?: Database["public"]["Enums"]["station_type"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          assigned_to: string | null
          created_at: string
          dispatched_at: string | null
          id: string
          menu_item_id: string
          notes: string | null
          order_id: string
          price: number
          quantity: number
          ready_at: string | null
          station_type: Database["public"]["Enums"]["station_type"]
          status: Database["public"]["Enums"]["order_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          dispatched_at?: string | null
          id?: string
          menu_item_id: string
          notes?: string | null
          order_id: string
          price: number
          quantity?: number
          ready_at?: string | null
          station_type: Database["public"]["Enums"]["station_type"]
          status?: Database["public"]["Enums"]["order_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          dispatched_at?: string | null
          id?: string
          menu_item_id?: string
          notes?: string | null
          order_id?: string
          price?: number
          quantity?: number
          ready_at?: string | null
          station_type?: Database["public"]["Enums"]["station_type"]
          status?: Database["public"]["Enums"]["order_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_returns: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          order_item_id: string
          reason: string
          refund_amount: number | null
          reported_by: string
          tenant_id: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          order_item_id: string
          reason: string
          refund_amount?: number | null
          reported_by: string
          tenant_id: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          order_item_id?: string
          reason?: string
          refund_amount?: number | null
          reported_by?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_returns_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_returns_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_returns_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_returns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          dispatched_at: string | null
          event_id: string
          guest_name: string | null
          id: string
          order_number: string
          paid_at: string | null
          ready_at: string | null
          served_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          table_number: string | null
          tenant_id: string
          total_amount: number | null
          updated_at: string
          waiter_id: string
        }
        Insert: {
          created_at?: string
          dispatched_at?: string | null
          event_id: string
          guest_name?: string | null
          id?: string
          order_number: string
          paid_at?: string | null
          ready_at?: string | null
          served_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_number?: string | null
          tenant_id: string
          total_amount?: number | null
          updated_at?: string
          waiter_id: string
        }
        Update: {
          created_at?: string
          dispatched_at?: string | null
          event_id?: string
          guest_name?: string | null
          id?: string
          order_number?: string
          paid_at?: string | null
          ready_at?: string | null
          served_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_number?: string | null
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string
          waiter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_waiter_id_fkey"
            columns: ["waiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          confirmed_by: string | null
          created_at: string
          guest_identifier: string | null
          id: string
          notes: string | null
          notes_metadata: Json | null
          order_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: string | null
          split_session_id: string | null
          split_type: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          confirmed_by?: string | null
          created_at?: string
          guest_identifier?: string | null
          id?: string
          notes?: string | null
          notes_metadata?: Json | null
          order_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status?: string | null
          split_session_id?: string | null
          split_type?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          confirmed_by?: string | null
          created_at?: string
          guest_identifier?: string | null
          id?: string
          notes?: string | null
          notes_metadata?: Json | null
          order_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: string | null
          split_session_id?: string | null
          split_type?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean | null
          phone: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      split_payment_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_item_id: string
          payment_id: string
          quantity: number
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_item_id: string
          payment_id: string
          quantity?: number
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_item_id?: string
          payment_id?: string
          quantity?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_payment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_payment_items_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_payment_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          capacity: number
          cleared_at: string | null
          created_at: string
          current_order_id: string | null
          event_id: string
          id: string
          occupied_at: string | null
          status: string
          table_number: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          cleared_at?: string | null
          created_at?: string
          current_order_id?: string | null
          event_id: string
          id?: string
          occupied_at?: string | null
          status?: string
          table_number: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          cleared_at?: string | null
          created_at?: string
          current_order_id?: string | null
          event_id?: string
          id?: string
          occupied_at?: string | null
          status?: string
          table_number?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tables_current_order_id_fkey"
            columns: ["current_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          plan_limits: Json | null
          plan_name: string | null
          theme_config: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          plan_limits?: Json | null
          plan_name?: string | null
          theme_config?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          plan_limits?: Json | null
          plan_name?: string | null
          theme_config?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_order_number: { Args: { _event_id: string }; Returns: string }
      get_category_performance: {
        Args: { _end_date: string; _start_date: string; _tenant_id: string }
        Returns: {
          avg_item_price: number
          category: string
          percentage_of_total: number
          total_items: number
          total_revenue: number
        }[]
      }
      get_order_payment_summary: {
        Args: { _order_id: string }
        Returns: {
          is_fully_paid: boolean
          payment_count: number
          remaining_balance: number
          total_amount: number
          total_paid: number
        }[]
      }
      get_order_remaining_balance: {
        Args: { _order_id: string }
        Returns: number
      }
      get_peak_hours_analysis: {
        Args: { _end_date: string; _start_date: string; _tenant_id: string }
        Returns: {
          avg_order_value: number
          hour: number
          order_count: number
          total_revenue: number
        }[]
      }
      get_popular_items: {
        Args: {
          _end_date: string
          _limit?: number
          _start_date: string
          _tenant_id: string
        }
        Returns: {
          avg_price: number
          category: string
          item_id: string
          item_name: string
          order_count: number
          total_quantity: number
          total_revenue: number
        }[]
      }
      get_revenue_trends: {
        Args: { _end_date: string; _start_date: string; _tenant_id: string }
        Returns: {
          avg_order_value: number
          date: string
          total_orders: number
          total_revenue: number
          unique_tables: number
        }[]
      }
      get_station_efficiency: {
        Args: { _end_date: string; _start_date: string; _tenant_id: string }
        Returns: {
          avg_prep_time_minutes: number
          efficiency_percentage: number
          items_delayed: number
          items_on_time: number
          station_type: string
          total_items: number
        }[]
      }
      get_user_tenant: { Args: { _user_id: string }; Returns: string }
      get_waiter_performance: {
        Args: { _end_date: string; _start_date: string; _tenant_id: string }
        Returns: {
          avg_order_value: number
          avg_table_turnover_minutes: number
          total_items: number
          total_orders: number
          total_revenue: number
          waiter_id: string
          waiter_name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "support_admin"
        | "tenant_admin"
        | "event_manager"
        | "waiter"
        | "cashier"
        | "drink_dispenser"
        | "meal_dispenser"
        | "mixologist"
        | "bar_staff"
        | "read_only_partner"
      order_status:
        | "pending"
        | "dispatched"
        | "ready"
        | "served"
        | "paid"
        | "rejected"
        | "returned"
      payment_method: "cash" | "pos" | "transfer" | "split"
      station_type: "drink_dispenser" | "meal_dispenser" | "mixologist" | "bar"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "support_admin",
        "tenant_admin",
        "event_manager",
        "waiter",
        "cashier",
        "drink_dispenser",
        "meal_dispenser",
        "mixologist",
        "bar_staff",
        "read_only_partner",
      ],
      order_status: [
        "pending",
        "dispatched",
        "ready",
        "served",
        "paid",
        "rejected",
        "returned",
      ],
      payment_method: ["cash", "pos", "transfer", "split"],
      station_type: ["drink_dispenser", "meal_dispenser", "mixologist", "bar"],
    },
  },
} as const
