import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Database, Users, GitBranch, ArrowRightLeft, ChefHat, CreditCard, LayoutDashboard, UserPlus, LogIn, Wine } from "lucide-react";

const Documentation = () => {
  const navigate = useNavigate();

  const diagrams = [
    {
      id: "er-diagram",
      title: "Entity Relationship Diagram",
      icon: Database,
      description: "Database structure showing relationships between all 14 tables",
      mermaid: `erDiagram
    TENANT ||--o{ EVENT : hosts
    TENANT ||--o{ PROFILE : employs
    TENANT ||--o{ MENU_ITEM : defines
    TENANT ||--o{ TABLE : configures
    TENANT ||--o{ ZONE : organizes
    
    PROFILE ||--o{ USER_ROLE : has
    PROFILE ||--o{ ORDER : creates_as_waiter
    PROFILE ||--o{ STAFF_LOCATION : tracks
    
    EVENT ||--o{ ORDER : contains
    EVENT ||--o{ TABLE : uses
    EVENT ||--o{ ZONE : divides_into
    EVENT ||--o{ MENU_ITEM : offers
    
    ORDER ||--o{ ORDER_ITEM : includes
    ORDER ||--o{ PAYMENT : receives
    
    ORDER_ITEM ||--o{ ORDER_RETURN : may_have
    ORDER_ITEM }o--|| MENU_ITEM : references
    
    PAYMENT ||--o{ SPLIT_PAYMENT_ITEM : splits_into
    
    TABLE }o--o| ZONE : belongs_to
    TABLE }o--o| PROFILE : assigned_to_waiter`
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
    TA --> ROP`
    },
    {
      id: "order-lifecycle",
      title: "Order Lifecycle States",
      icon: GitBranch,
      description: "7 order statuses: pending → dispatched → ready → served → paid",
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
    returned --> [*]`
    },
    {
      id: "waiter-flow",
      title: "Waiter Order Creation",
      icon: ArrowRightLeft,
      description: "Complete flow from opening a new order to dispatching items to stations",
      mermaid: `sequenceDiagram
    actor Waiter
    participant UI as NewOrder Page
    participant DB as Database
    participant Station as Station Staff
    
    Waiter->>UI: Open new order
    UI->>DB: Fetch active events
    DB-->>UI: Events list
    
    Waiter->>UI: Select event
    UI->>DB: Fetch tables + menu items
    DB-->>UI: Tables, menu by category
    
    Waiter->>UI: Select table, add items to cart
    Waiter->>UI: Submit order
    
    alt Online
        UI->>DB: Generate order number
        UI->>DB: Insert order
        UI->>DB: Insert order_items per station
        DB-->>UI: Success
        Note over DB,Station: Real-time subscription triggers
        Station->>Station: Receive new order items
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
      description: "How station staff receive orders, mark items ready, and handle returns",
      mermaid: `sequenceDiagram
    actor StationStaff as Station Staff
    participant Station as Station Page
    participant DB as Database
    participant Waiter
    
    Note over Station: Real-time subscription active
    DB->>Station: New order_item (pending)
    Station-->>StationStaff: Display new order
    
    alt Item Available
        StationStaff->>Station: Mark Ready
        Station->>DB: Update status=ready, ready_at=now()
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
    Station->>DB: Update order_return.confirmed_at`
    },
    {
      id: "cashier-flow",
      title: "Cashier Payment Flow",
      icon: CreditCard,
      description: "Simple and split payments with automatic reconciliation",
      mermaid: `sequenceDiagram
    actor Cashier
    participant CashierUI as Cashier Page
    participant DB as Database
    
    Cashier->>CashierUI: View pending payments
    CashierUI->>DB: Fetch orders (status=served)
    DB-->>CashierUI: Orders list
    
    Cashier->>CashierUI: Select order
    CashierUI->>DB: Get order details + items
    
    alt Simple Payment
        Cashier->>CashierUI: Select payment method
        CashierUI->>DB: Insert payment (full amount)
        CashierUI->>DB: Update order status=paid
    else Split Payment
        Cashier->>CashierUI: Open split dialog
        Cashier->>CashierUI: Configure splits
        loop For each split
            Cashier->>CashierUI: Enter amount + method
            CashierUI->>DB: Insert payment with split_session_id
            CashierUI->>DB: Insert split_payment_items
        end
        CashierUI->>DB: Verify total = order amount
        CashierUI->>DB: Update order status=paid
    end
    
    DB-->>Cashier: Payment confirmed`
    },
    {
      id: "manager-flow",
      title: "Manager Dashboard",
      icon: LayoutDashboard,
      description: "Real-time subscriptions, metrics, and staff location tracking",
      mermaid: `sequenceDiagram
    actor Manager
    participant Dashboard as Manager Page
    participant DB as Database
    
    Manager->>Dashboard: Open dashboard
    Dashboard->>DB: Subscribe to orders, order_items, menu_items
    Dashboard->>DB: Fetch initial stats
    
    loop Real-time Updates
        DB->>Dashboard: Order changes
        Dashboard->>Dashboard: Update order stats
        Dashboard->>Dashboard: Calculate station bottlenecks
        Dashboard->>Dashboard: Check critical alerts
        Dashboard-->>Manager: Display updated metrics
    end
    
    par Periodic Refresh (30s)
        Dashboard->>DB: Fetch performance metrics
        DB-->>Dashboard: Avg times, revenue
    end
    
    Manager->>Dashboard: View floor map
    Dashboard->>DB: Fetch staff_locations
    DB-->>Dashboard: Staff positions
    Dashboard-->>Manager: Display staff on map`
    },
    {
      id: "admin-staff-flow",
      title: "Admin Staff Management",
      icon: UserPlus,
      description: "Secure staff invitation flow using edge functions",
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
    
    Note over Admin: Staff uses temp password to login
    
    Admin->>AdminUI: Update staff role
    AdminUI->>EdgeFn: manage-staff (update role)
    EdgeFn->>DB: Update user_role
    
    Admin->>AdminUI: Deactivate staff
    AdminUI->>EdgeFn: manage-staff (deactivate)
    EdgeFn->>DB: Set profile.is_active=false`
    },
    {
      id: "auth-flow",
      title: "Authentication & Routing",
      icon: LogIn,
      description: "Authentication flow and role-based routing",
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
    else station role
        Dashboard->>User: Redirect to /station
    else event_manager role
        Dashboard->>User: Redirect to /manager
    else tenant_admin role
        Dashboard->>User: Redirect to /admin
    else bar_staff role
        Dashboard->>User: Redirect to /bar
    end`
    },
    {
      id: "bar-flow",
      title: "Bar Self-Service",
      icon: Wine,
      description: "Bar staff handle complete flow: order, preparation, and payment",
      mermaid: `sequenceDiagram
    actor BarStaff as Bar Staff
    participant BarUI as Bar Page
    participant DB as Database
    
    BarStaff->>BarUI: Browse menu
    BarUI->>DB: Fetch bar menu items
    DB-->>BarUI: Menu grouped by category
    
    BarStaff->>BarUI: Add items to cart
    BarStaff->>BarUI: Create order
    BarUI->>DB: Insert order (waiter_id=self)
    BarUI->>DB: Insert order_items
    DB-->>BarUI: Order created
    
    Note over BarStaff: Prepare items immediately
    BarStaff->>BarUI: Items ready
    BarUI->>DB: Update order_items status=ready
    
    BarStaff->>BarUI: Process payment
    BarUI->>DB: Insert payment
    BarUI->>DB: Update order status=paid
    DB-->>BarStaff: Payment confirmed`
    },
    {
      id: "complete-order-flow",
      title: "Complete Order Activity",
      icon: GitBranch,
      description: "End-to-end order flow with all decision points",
      mermaid: `graph TB
    subgraph "Waiter Actions"
        A[Start Order] --> B[Select Event & Table]
        B --> C[Add Menu Items]
        C --> D{Cart Ready?}
        D -->|No| C
        D -->|Yes| E[Submit Order]
    end
    
    subgraph "System Processing"
        E --> F[Generate Order Number]
        F --> G[Create Order Record]
        G --> H[Dispatch Items to Stations]
    end
    
    subgraph "Station Processing"
        H --> I{Station Type}
        I -->|Drinks| J[Drink Station]
        I -->|Meals| K[Meal Station]
        I -->|Cocktails| L[Mixologist]
        I -->|Bar| M[Bar Station]
        
        J --> N{Item Available?}
        K --> N
        L --> N
        M --> N
        
        N -->|Yes| O[Prepare Item]
        N -->|No| P[Mark Out of Stock]
        
        O --> Q[Mark Ready]
        P --> R[Reject Order Item]
    end
    
    subgraph "Delivery & Payment"
        Q --> S{All Items Ready?}
        S -->|No| T[Wait for Others]
        T --> S
        S -->|Yes| U[Waiter Delivers]
        
        U --> V[Mark Served]
        V --> W[Cashier Payment]
        W --> X{Split Payment?}
        
        X -->|No| Y[Single Payment]
        X -->|Yes| Z[Split by Guest/Item]
        
        Y --> AA[Mark Paid]
        Z --> AA
        AA --> AB[End]
    end
    
    R --> AC[Notify Waiter]
    AC --> AD[Handle Rejection]`
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
                <div className="text-3xl font-bold text-primary">14</div>
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
