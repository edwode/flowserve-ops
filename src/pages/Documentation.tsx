import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Database, Users, GitBranch, ArrowRightLeft, ChefHat, CreditCard, LayoutDashboard, UserPlus, LogIn, Wine, Package } from "lucide-react";

const Documentation = () => {
  const navigate = useNavigate();

  const diagrams = [
    {
      id: "er-diagram",
      title: "Entity Relationship Diagram",
      icon: Database,
      description: "Database structure showing relationships between all 18 tables",
      mermaid: `erDiagram
    TENANT ||--o{ EVENT : hosts
    TENANT ||--o{ PROFILE : employs
    TENANT ||--o{ MENU_ITEM : defines
    TENANT ||--o{ TABLE : configures
    TENANT ||--o{ ZONE : organizes
    TENANT ||--o{ MENU_CATEGORY : categorizes
    TENANT ||--o{ AUDIT_LOG : tracks
    
    PROFILE ||--o{ USER_ROLE : has
    PROFILE ||--o{ ZONE_ROLE_ASSIGNMENT : assigned_to
    PROFILE ||--o{ ORDER : creates_as_waiter
    PROFILE ||--o{ STAFF_LOCATION : tracks
    PROFILE }o--o| ZONE : waiter_zone
    PROFILE }o--o| EVENT : assigned_event
    
    EVENT ||--o{ ORDER : contains
    EVENT ||--o{ TABLE : uses
    EVENT ||--o{ ZONE : divides_into
    EVENT ||--o{ MENU_ITEM : offers
    EVENT ||--o{ INVENTORY_ZONE_ALLOCATION : allocates
    EVENT ||--o{ INVENTORY_ZONE_TRANSFER : transfers
    
    ORDER ||--o{ ORDER_ITEM : includes
    ORDER ||--o{ PAYMENT : receives
    
    ORDER_ITEM ||--o{ ORDER_RETURN : may_have
    ORDER_ITEM }o--|| MENU_ITEM : references
    ORDER_ITEM }o--o| PROFILE : assigned_to_staff
    
    PAYMENT ||--o{ SPLIT_PAYMENT_ITEM : splits_into
    
    TABLE }o--o| ZONE : belongs_to
    TABLE }o--o| PROFILE : assigned_to_waiter
    
    ZONE ||--o{ ZONE_ROLE_ASSIGNMENT : has
    ZONE ||--o{ INVENTORY_ZONE_ALLOCATION : stores
    
    MENU_ITEM ||--o{ INVENTORY_ZONE_ALLOCATION : allocated_to_zones`
    },
    {
      id: "role-hierarchy",
      title: "User Role Hierarchy",
      icon: Users,
      description: "11 roles: 2 platform-level and 9 tenant-level with distinct responsibilities",
      mermaid: `graph TB
    subgraph "Platform Level"
        SA[Super Admin]
        SUA[Support Admin]
    end
    
    subgraph "Tenant Level"
        TA[Tenant Admin]
        EM[Event Manager]
        
        subgraph "Operational Staff"
            W[Waiter]
            C[Cashier]
            BS[Bar Staff]
        end
        
        subgraph "Station Staff"
            DD[Drink Dispenser]
            MD[Meal Dispenser]
            MX[Mixologist]
        end
        
        ROP[Read-Only Partner]
    end
    
    SA --> TA
    SUA --> TA
    TA --> EM
    EM --> W
    EM --> C
    EM --> BS
    EM --> DD
    EM --> MD
    EM --> MX
    TA --> ROP
    
    Note1[Waiters: Single zone via profiles.zone_id]
    Note2[Station/Manager: Multi-zone via zone_role_assignments]
    
    W -.-> Note1
    C -.-> Note2
    EM -.-> Note2`
    },
    {
      id: "order-lifecycle",
      title: "Order Lifecycle States",
      icon: GitBranch,
      description: "7 order statuses with inventory decrement trigger on 'served'",
      mermaid: `stateDiagram-v2
    [*] --> pending: Order Created
    pending --> dispatched: Items sent to stations
    dispatched --> ready: All items ready
    ready --> served: Waiter delivers
    served --> paid: Payment complete
    paid --> [*]
    
    dispatched --> rejected: Item unavailable
    ready --> returned: Guest returns item
    rejected --> [*]
    returned --> [*]
    
    note right of served
      TRIGGER: decrement_inventory_on_served
      - Decrements menu_items.current_inventory
      - Decrements inventory_zone_allocations.allocated_quantity
    end note`
    },
    {
      id: "waiter-flow",
      title: "Waiter Order Creation",
      icon: ArrowRightLeft,
      description: "Zone-filtered tables, zone inventory visibility, offline support",
      mermaid: `sequenceDiagram
    actor Waiter
    participant UI as NewOrder Page
    participant DB as Database
    participant Station as Station Staff
    
    Waiter->>UI: Open new order
    UI->>DB: Fetch waiter profile (zone_id, event_id)
    DB-->>UI: Assigned zone & event
    
    UI->>DB: Fetch tables in waiter's zone
    Note over UI: Only assigned tables + ad-hoc tables shown
    DB-->>UI: Filtered tables
    
    UI->>DB: Fetch menu items + zone allocations
    Note over UI: Shows zone-specific inventory count
    DB-->>UI: Menu with allocated quantities
    
    Waiter->>UI: Select table, add items to cart
    Waiter->>UI: Submit order
    
    alt Online
        UI->>DB: Generate order number
        UI->>DB: Insert order
        UI->>DB: Insert order_items per station
        DB-->>UI: Success
        Note over DB,Station: Real-time subscription triggers
        Station->>Station: Receive items (zone-filtered)
    else Offline
        UI->>UI: Queue order locally
        Note over UI: Sync when connection restored
    end
    
    UI-->>Waiter: Navigate to /waiter`
    },
    {
      id: "station-flow",
      title: "Station Order Processing",
      icon: ChefHat,
      description: "Zone-filtered orders, staff assignment tracking, return handling",
      mermaid: `sequenceDiagram
    actor StationStaff as Station Staff
    participant Station as Station Page
    participant DB as Database
    participant Waiter
    participant Cashier
    
    Note over Station: Real-time subscription active
    Note over Station: Orders filtered by assigned zones
    
    DB->>Station: New order_item (zone-filtered)
    Station-->>StationStaff: Display new order
    
    alt Item Available
        StationStaff->>Station: Mark Ready
        Station->>DB: Update status=ready
        Station->>DB: Set assigned_to=current_user_id
        Station->>DB: Set ready_at=now()
        DB-->>Waiter: Real-time: item ready
    else Item Out of Stock
        StationStaff->>Station: Mark Out of Stock
        Station->>DB: Update menu_item.is_available=false
        Station->>DB: Reject pending orders for item
        DB-->>Waiter: Real-time: item rejected
    end
    
    Note over StationStaff: Handle Returns
    DB->>Station: New return request
    StationStaff->>Station: Confirm return
    Station->>DB: Update order_return.confirmed_at
    Station->>DB: Update order_item.status=returned
    DB-->>Cashier: Item moved to Returns tab`
    },
    {
      id: "cashier-flow",
      title: "Cashier Payment Flow",
      icon: CreditCard,
      description: "Zone-filtered orders, split payments, returns, consolidated payments",
      mermaid: `sequenceDiagram
    actor Cashier
    participant CashierUI as Cashier Page
    participant DB as Database
    
    Cashier->>CashierUI: View Payments tab
    CashierUI->>DB: Fetch zone_role_assignments
    CashierUI->>DB: Fetch orders (status=served, zone-filtered)
    Note over CashierUI: Returned items excluded from totals
    DB-->>CashierUI: Orders list
    
    Cashier->>CashierUI: Select order
    CashierUI->>DB: Get order details + items
    
    alt Simple Payment
        Cashier->>CashierUI: Select payment method
        CashierUI->>DB: Insert payment (full amount)
        CashierUI->>DB: Update order status=paid
    else Split Payment
        Cashier->>CashierUI: Open split dialog
        loop For each split
            Cashier->>CashierUI: Enter amount + method
            CashierUI->>DB: Insert payment with split_session_id
            CashierUI->>DB: Insert split_payment_items
        end
        CashierUI->>DB: Update order status=paid
    else Consolidated Payment
        Cashier->>CashierUI: Select multiple orders (same table)
        Cashier->>CashierUI: Consolidate orders
        CashierUI->>DB: Process payment for combined total
        CashierUI->>DB: Update ALL order statuses=paid
    end
    
    Note over Cashier: Returns Tab
    Cashier->>CashierUI: View Returns tab (zone-filtered)
    Cashier->>CashierUI: Confirm Revenue Loss
    CashierUI->>DB: Update order_return.refund_amount`
    },
    {
      id: "manager-flow",
      title: "Manager Dashboard",
      icon: LayoutDashboard,
      description: "Zone-scoped metrics, real-time updates, staff tracking, currency formatting",
      mermaid: `sequenceDiagram
    actor Manager
    participant Dashboard as Manager Page
    participant DB as Database
    
    Manager->>Dashboard: Open dashboard
    Dashboard->>DB: Fetch zone_role_assignments (event_manager)
    Dashboard->>DB: Get assigned zones & event
    
    Dashboard->>DB: Fetch tables in assigned zones
    Dashboard->>DB: Subscribe to orders, order_items, menu_items
    
    Note over Dashboard: All data zone-scoped
    
    loop Real-time Updates
        DB->>Dashboard: Order changes (zone-filtered)
        Dashboard->>Dashboard: Update order stats
        Dashboard->>Dashboard: Calculate station bottlenecks
        Dashboard->>Dashboard: Check critical alerts
        Dashboard-->>Manager: Display metrics (tenant currency)
    end
    
    par Periodic Refresh (30s)
        Dashboard->>DB: Fetch performance metrics
        DB-->>Dashboard: Avg times, revenue
    end
    
    Manager->>Dashboard: View floor map
    Dashboard->>DB: Fetch staff_locations (zone-filtered)
    Dashboard-->>Manager: Display staff on map`
    },
    {
      id: "admin-staff-flow",
      title: "Admin Staff Management",
      icon: UserPlus,
      description: "Staff creation, zone/event assignment, multi-zone support for station roles",
      mermaid: `sequenceDiagram
    actor Admin as Tenant Admin
    participant AdminUI as Staff Page
    participant EdgeFn as Edge Function
    participant DB as Database
    participant Auth as Supabase Auth
    
    Admin->>AdminUI: Add new staff
    AdminUI->>EdgeFn: create-staff (email, name, role)
    EdgeFn->>Auth: Create auth user
    Auth-->>EdgeFn: User created
    EdgeFn->>DB: Update profile with tenant_id
    EdgeFn->>DB: Insert user_role
    EdgeFn-->>AdminUI: Temporary password
    AdminUI-->>Admin: Display credentials
    
    alt Waiter Role
        Admin->>AdminUI: Assign event & zone
        AdminUI->>DB: Update profile.event_id, profile.zone_id
        Admin->>AdminUI: Assign tables
        AdminUI->>DB: Update tables.assigned_waiter_id
    else Station/Manager Role
        Admin->>AdminUI: Assign event
        AdminUI->>DB: Update profile.event_id
        Admin->>AdminUI: Select multiple zones
        loop For each zone
            AdminUI->>DB: Insert zone_role_assignment
            Note over DB: Unique constraint: one role per zone
        end
    end
    
    Admin->>AdminUI: Reset password
    AdminUI->>EdgeFn: manage-staff (reset password)
    EdgeFn->>Auth: Update user password`
    },
    {
      id: "auth-flow",
      title: "Authentication & Routing",
      icon: LogIn,
      description: "Authentication flow with role-based routing",
      mermaid: `sequenceDiagram
    actor User
    participant Auth as /auth Page
    participant Dashboard as /dashboard
    participant Supabase
    
    User->>Auth: Navigate to app
    Auth->>Supabase: Check session
    
    alt No session
        Supabase-->>Auth: No session
        Auth-->>User: Show login form
        User->>Auth: Submit credentials
        Auth->>Supabase: signInWithPassword()
        Supabase-->>Auth: Session + User
    end
    
    Auth->>Dashboard: Redirect
    Dashboard->>Supabase: Get profile + roles
    Supabase-->>Dashboard: Profile with tenant_id, roles
    
    alt No tenant_id
        Dashboard->>User: Redirect to /setup
    else waiter role
        Dashboard->>User: Redirect to /waiter
    else cashier role
        Dashboard->>User: Redirect to /cashier
    else station role (DD/MD/MX)
        Dashboard->>User: Redirect to /station
    else event_manager role
        Dashboard->>User: Redirect to /manager
    else tenant_admin role
        Dashboard->>User: Redirect to /admin
    else bar_staff role
        Dashboard->>User: Redirect to /bar
    end
    
    Note over User: useAuthGuard monitors session
    Note over User: signOut uses scope='local'`
    },
    {
      id: "bar-flow",
      title: "Bar Self-Service",
      icon: Wine,
      description: "Bar staff: order creation, preparation, waiter order handling, payment",
      mermaid: `sequenceDiagram
    actor BarStaff as Bar Staff
    participant BarUI as Bar Page
    participant DB as Database
    
    BarStaff->>BarUI: Browse menu
    BarUI->>DB: Fetch bar menu items (zone-filtered)
    DB-->>BarUI: Menu grouped by category
    
    alt Self-Service Order
        BarStaff->>BarUI: Add items to cart
        BarStaff->>BarUI: Create order
        BarUI->>DB: Insert order (waiter_id=self)
        BarUI->>DB: Insert order_items
        DB-->>BarUI: Order created
    else Waiter Order (from assigned zones)
        BarUI->>DB: Real-time: new waiter order items
        Note over BarUI: Shows waiter name, order details
    end
    
    BarStaff->>BarUI: Mark individual items ready
    BarUI->>DB: Update order_item.status=ready
    BarUI->>DB: Set assigned_to=current_user_id
    
    Note over BarUI: Payment only when ALL items ready
    BarStaff->>BarUI: Process payment
    BarUI->>DB: Insert payment
    BarUI->>DB: Update order status=paid
    DB-->>BarStaff: Payment confirmed`
    },
    {
      id: "inventory-flow",
      title: "Inventory Management",
      icon: Package,
      description: "Zone-based allocation, automatic decrement on serve, transfers",
      mermaid: `sequenceDiagram
    actor Admin as Tenant Admin
    participant InvUI as Inventory Page
    participant DB as Database
    participant Trigger as DB Trigger
    
    Admin->>InvUI: View inventory
    InvUI->>DB: Fetch menu_items + zone_allocations
    DB-->>InvUI: Items with global & zone quantities
    
    Admin->>InvUI: Allocate to zones
    InvUI->>DB: Insert/Update inventory_zone_allocations
    Note over DB: Each zone has separate quantity
    
    Admin->>InvUI: Transfer between zones
    InvUI->>DB: Update source zone allocation (decrease)
    InvUI->>DB: Update target zone allocation (increase)
    InvUI->>DB: Insert inventory_zone_transfer (audit)
    
    Note over Trigger: On order_item status='served'
    Trigger->>DB: Decrement menu_items.current_inventory
    Trigger->>DB: Decrement zone allocation (by quantity)
    Note over Trigger: Uses GREATEST(0, qty - N)
    
    Admin->>InvUI: Adjust inventory
    InvUI->>DB: Update menu_item quantities
    InvUI->>DB: Insert audit_log entry`
    },
    {
      id: "complete-order-flow",
      title: "Complete Order Activity",
      icon: GitBranch,
      description: "End-to-end order flow with zone filtering and inventory updates",
      mermaid: `graph TB
    subgraph "Waiter Actions"
        A[Start Order] --> B[Select Table from Zone]
        B --> C[View Zone Inventory]
        C --> D[Add Menu Items]
        D --> E{Cart Ready?}
        E -->|No| D
        E -->|Yes| F[Submit Order]
    end
    
    subgraph "System Processing"
        F --> G[Generate Order Number]
        G --> H[Create Order Record]
        H --> I[Dispatch Items to Stations]
    end
    
    subgraph "Station Processing"
        I --> J{Station Type}
        J -->|Drinks| K[Drink Station]
        J -->|Meals| L[Meal Station]
        J -->|Cocktails| M[Mixologist]
        J -->|Bar| N[Bar Station]
        
        K --> O{Zone Match?}
        L --> O
        M --> O
        N --> O
        
        O -->|Yes| P{Item Available?}
        O -->|No| SKIP[Not Shown]
        
        P -->|Yes| Q[Prepare Item]
        P -->|No| R[Mark Out of Stock]
        
        Q --> S[Mark Ready + Assign Staff]
        R --> T[Reject Order Item]
    end
    
    subgraph "Delivery & Payment"
        S --> U{All Items Ready?}
        U -->|No| V[Wait for Others]
        V --> U
        U -->|Yes| W[Waiter Delivers]
        
        W --> X[Mark Served]
        X --> INV[Trigger: Decrement Inventory]
        INV --> Y[Cashier Payment]
        Y --> Z{Payment Type?}
        
        Z -->|Single| AA[Single Payment]
        Z -->|Split| AB[Split by Guest/Item]
        Z -->|Consolidated| AC[Multiple Orders]
        
        AA --> AD[Mark Paid]
        AB --> AD
        AC --> AD
        AD --> AE[End]
    end
    
    T --> AF[Notify Waiter]
    AF --> AG[Handle Rejection]`
    }
  ];

  const [activeTab, setActiveTab] = useState(diagrams[0].id);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">System Documentation</h1>
            <p className="text-muted-foreground">EventOpsX Architecture & Workflows</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Application Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-3xl font-bold text-primary">11</div>
                <div className="text-sm text-muted-foreground">User Roles</div>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-3xl font-bold text-primary">18</div>
                <div className="text-sm text-muted-foreground">Database Tables</div>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-3xl font-bold text-primary">7</div>
                <div className="text-sm text-muted-foreground">Order Statuses</div>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-3xl font-bold text-primary">4</div>
                <div className="text-sm text-muted-foreground">Station Types</div>
              </div>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              <p className="font-medium mb-2">Key Architecture Features:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Zone-based staff assignment with multi-zone support for station roles</li>
                <li>Automatic inventory decrement on served status via database trigger</li>
                <li>Zone-scoped inventory allocation and transfer tracking</li>
                <li>Tenant-configurable currency with proper formatting</li>
                <li>Real-time updates via Supabase subscriptions</li>
                <li>Offline-tolerant waiter interface with request queuing</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto gap-1 mb-6">
            {diagrams.map((diagram) => (
              <TabsTrigger 
                key={diagram.id} 
                value={diagram.id}
                className="flex items-center gap-1 text-xs"
              >
                <diagram.icon className="h-3 w-3" />
                <span className="hidden sm:inline">{diagram.title.split(' ')[0]}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {diagrams.map((diagram) => (
            <TabsContent key={diagram.id} value={diagram.id}>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <diagram.icon className="h-6 w-6 text-primary" />
                    <div>
                      <CardTitle>{diagram.title}</CardTitle>
                      <p className="text-muted-foreground text-sm mt-1">{diagram.description}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted p-4 rounded-lg overflow-x-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap">{diagram.mermaid}</pre>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    Copy the Mermaid code above to visualize in any Mermaid-compatible viewer.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
};

export default Documentation;
