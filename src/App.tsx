import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { NotificationProvider } from "@/contexts/NotificationContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Setup from "./pages/Setup";
import Waiter from "./pages/Waiter";
import NewOrder from "./pages/NewOrder";
import OrderDetails from "./pages/OrderDetails";
import Station from "./pages/Station";
import Cashier from "./pages/Cashier";
import Manager from "./pages/Manager";
import Bar from "./pages/Bar";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminEvents } from "./pages/admin/Events";
import { AdminMenu } from "./pages/admin/Menu";
import { AdminStaff } from "./pages/admin/Staff";
import { AdminReports } from "./pages/admin/Reports";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <NotificationProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/waiter" element={<Waiter />} />
          <Route path="/waiter/new-order" element={<NewOrder />} />
          <Route path="/waiter/order/:id" element={<OrderDetails />} />
          <Route path="/station" element={<Station />} />
          <Route path="/cashier" element={<Cashier />} />
          <Route path="/manager" element={<Manager />} />
          <Route path="/bar" element={<Bar />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminEvents />} />
            <Route path="events" element={<AdminEvents />} />
            <Route path="menu" element={<AdminMenu />} />
            <Route path="staff" element={<AdminStaff />} />
            <Route path="reports" element={<AdminReports />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      </NotificationProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
