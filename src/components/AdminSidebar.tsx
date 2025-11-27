import { Calendar, Users, UtensilsCrossed, BarChart3, Settings, Package, Table2 } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const adminItems = [
  { title: "Events", url: "/admin/events", icon: Calendar },
  { title: "Menu Items", url: "/admin/menu", icon: UtensilsCrossed },
  { title: "Inventory", url: "/admin/inventory", icon: Package },
  { title: "Tables", url: "/admin/tables", icon: Table2 },
  { title: "Staff & Roles", url: "/admin/staff", icon: Users },
  { title: "Reports", url: "/admin/reports", icon: BarChart3 },
  { title: "Settings", url: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const { open } = useSidebar();
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Admin Panel</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink 
                      to={item.url} 
                      className="hover:bg-accent/50"
                      activeClassName="bg-accent text-accent-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {open && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
