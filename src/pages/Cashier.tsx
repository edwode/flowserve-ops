import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, DollarSign, AlertTriangle, Split, Printer, ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { NotificationBell } from "@/components/NotificationBell";
import { SplitPaymentDialog } from "@/components/SplitPaymentDialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Order {
  id: string;
  order_number: string;
  table_number: string;
  guest_name: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  served_at: string | null;
  profiles: {
    full_name: string | null;
  };
  order_items?: Array<{
    id: string;
    quantity: number;
    price: number;
    menu_item: {
      name: string;
    };
  }>;
}

interface OrderReturn {
  id: string;
  reason: string;
  refund_amount: number | null;
  created_at: string;
  confirmed_at: string | null;
  order_items: {
    quantity: number;
    price: number;
    menu_items: {
      name: string;
    };
    orders: {
      order_number: string;
      table_number: string;
      total_amount: number;
    };
  };
  profiles: {
    full_name: string | null;
  };
}

const Cashier = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, tenantId, loading: authLoading } = useAuthGuard();
  const { formatPrice } = useTenantCurrency();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [returns, setReturns] = useState<OrderReturn[]>([]);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [splitPaymentOrder, setSplitPaymentOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "pos" | "transfer" | "split">("cash");
  const [splitAmounts, setSplitAmounts] = useState({
    cash: "",
    pos: "",
    transfer: "",
  });
  const [paymentNotes, setPaymentNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [expandedPaymentTables, setExpandedPaymentTables] = useState<Set<string>>(new Set());
  const [expandedReturnTables, setExpandedReturnTables] = useState<Set<string>>(new Set());
  const [showPaidOrders, setShowPaidOrders] = useState(false);

  // Group orders by table for Payments tab
  const groupedOrders = useMemo(() => {
    const statusPriority: Record<string, number> = { served: 0, paid: 1 };
    const groups: Record<string, Order[]> = {};
    orders.forEach((order) => {
      const tableKey = order.table_number || 'No Table';
      if (!groups[tableKey]) {
        groups[tableKey] = [];
      }
      groups[tableKey].push(order);
    });
    // Sort orders within each group by status priority (served first, then paid)
    Object.values(groups).forEach((groupOrders) => {
      groupOrders.sort((a, b) => (statusPriority[a.status] ?? 99) - (statusPriority[b.status] ?? 99));
    });
    // Sort tables alphabetically
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  }, [orders]);

  // Group returns by table for Returns tab
  const groupedReturns = useMemo(() => {
    const groups: Record<string, OrderReturn[]> = {};
    returns.forEach((returnItem) => {
      const tableKey = returnItem.order_items.orders.table_number || 'No Table';
      if (!groups[tableKey]) {
        groups[tableKey] = [];
      }
      groups[tableKey].push(returnItem);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  }, [returns]);

  const togglePaymentTable = (tableKey: string) => {
    setExpandedPaymentTables(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tableKey)) {
        newSet.delete(tableKey);
      } else {
        newSet.add(tableKey);
      }
      return newSet;
    });
  };

  const toggleReturnTable = (tableKey: string) => {
    setExpandedReturnTables(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tableKey)) {
        newSet.delete(tableKey);
      } else {
        newSet.add(tableKey);
      }
      return newSet;
    });
  };

  // Auto-expand all tables when data loads
  useEffect(() => {
    if (groupedOrders.length > 0) {
      setExpandedPaymentTables(new Set(groupedOrders.map(([tableKey]) => tableKey)));
    }
  }, [groupedOrders.length]);

  useEffect(() => {
    if (groupedReturns.length > 0) {
      setExpandedReturnTables(new Set(groupedReturns.map(([tableKey]) => tableKey)));
    }
  }, [groupedReturns.length]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchData();
    }
    
    const channel = supabase
      .channel('cashier-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        () => {
          fetchOrders();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_returns'
        },
        () => {
          fetchReturns();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authLoading, user]);

  const fetchData = async () => {
    await Promise.all([fetchOrders(), fetchReturns()]);
    setLoading(false);
  };

  const fetchOrders = async (includePaid = showPaidOrders) => {
    try {
      const statusFilter: ("served" | "ready" | "paid")[] = includePaid 
        ? ['served', 'ready', 'paid'] 
        : ['served', 'ready'];
      
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          table_number,
          guest_name,
          status,
          total_amount,
          created_at,
          served_at,
          profiles!orders_waiter_id_fkey (full_name),
          order_items (
            id,
            quantity,
            price,
            menu_items (name)
          )
        `)
        .in('status', statusFilter)
        .order('served_at', { ascending: true, nullsFirst: false });

      if (error) throw error;
      
      // Transform the data to match our Order interface
      const transformedData = (data || []).map(order => ({
        ...order,
        order_items: order.order_items?.map(item => ({
          ...item,
          menu_item: item.menu_items
        }))
      }));
      
      setOrders(transformedData);
    } catch (error: any) {
      toast({
        title: "Error loading orders",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchReturns = async () => {
    try {
      const { data, error } = await supabase
        .from('order_returns')
        .select(`
          id,
          reason,
          refund_amount,
          created_at,
          confirmed_at,
          order_items!inner (
            quantity,
            price,
            menu_items (name),
            orders (order_number, table_number, total_amount)
          ),
          profiles!order_returns_reported_by_fkey (full_name)
        `)
        .not('confirmed_at', 'is', null)
        .order('confirmed_at', { ascending: false });

      if (error) throw error;
      setReturns(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading returns",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleOpenPayment = (order: Order) => {
    setSelectedOrder(order);
    setPaymentMethod("cash");
    setSplitAmounts({ cash: "", pos: "", transfer: "" });
    setPaymentNotes("");
  };

  const handleConfirmPayment = async () => {
    if (!selectedOrder) return;

    setProcessing(true);
    try {
      if (!user || !tenantId) throw new Error("Not authenticated");

      let paymentAmount = selectedOrder.total_amount;
      
      // Handle split payment
      if (paymentMethod === "split") {
        const cash = parseFloat(splitAmounts.cash || "0");
        const pos = parseFloat(splitAmounts.pos || "0");
        const transfer = parseFloat(splitAmounts.transfer || "0");
        const total = cash + pos + transfer;

        if (Math.abs(total - selectedOrder.total_amount) > 0.01) {
          toast({
            title: "Invalid split amounts",
            description: `Total must equal ${formatPrice(selectedOrder.total_amount)}`,
            variant: "destructive",
          });
          setProcessing(false);
          return;
        }

        // Create multiple payment records for split
        const payments = [];
        if (cash > 0) payments.push({ method: 'cash', amount: cash });
        if (pos > 0) payments.push({ method: 'pos', amount: pos });
        if (transfer > 0) payments.push({ method: 'transfer', amount: transfer });

        for (const payment of payments) {
          const { error: paymentError } = await supabase
            .from('payments')
            .insert({
              order_id: selectedOrder.id,
              amount: payment.amount,
              payment_method: payment.method as "cash" | "pos" | "transfer",
              tenant_id: tenantId,
              confirmed_by: user.id,
              notes: paymentNotes || null,
            });

          if (paymentError) throw paymentError;
        }
      } else {
        // Single payment method
        const { error: paymentError } = await supabase
          .from('payments')
          .insert({
            order_id: selectedOrder.id,
            amount: paymentAmount,
            payment_method: paymentMethod,
            tenant_id: tenantId,
            confirmed_by: user.id,
            notes: paymentNotes || null,
          });

        if (paymentError) throw paymentError;
      }

      // Update order status to paid
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('id', selectedOrder.id);

      if (orderError) throw orderError;

      toast({
        title: "Payment confirmed",
        description: `Order ${selectedOrder.order_number} marked as paid`,
      });

      setSelectedOrder(null);
      fetchOrders();
    } catch (error: any) {
      toast({
        title: "Error processing payment",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleApproveRefund = async (returnItem: OrderReturn) => {
    try {
      const refundAmount = returnItem.refund_amount || 
        (returnItem.order_items.price * returnItem.order_items.quantity);

      const { error } = await supabase
        .from('order_returns')
        .update({ refund_amount: refundAmount })
        .eq('id', returnItem.id);

      if (error) throw error;

      toast({
        title: "Refund approved",
        description: `${formatPrice(refundAmount)} will be refunded`,
      });

      fetchReturns();
    } catch (error: any) {
      toast({
        title: "Error approving refund",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    navigate('/auth');
  };

  const handlePrintReceipt = (order: Order | null) => {
    if (!order) return;

    const receiptContent = `
      <html>
        <head>
          <title>Receipt - ${order.order_number}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 0;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Courier New', monospace;
              font-size: 12px;
              width: 80mm;
              padding: 4mm;
              line-height: 1.4;
            }
            .header {
              text-align: center;
              margin-bottom: 8px;
              padding-bottom: 8px;
              border-bottom: 1px dashed #000;
            }
            .header h1 {
              font-size: 16px;
              font-weight: bold;
              margin-bottom: 4px;
            }
            .header p {
              font-size: 11px;
            }
            .info {
              margin-bottom: 8px;
              padding-bottom: 8px;
              border-bottom: 1px dashed #000;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              font-size: 11px;
            }
            .items {
              margin-bottom: 8px;
              padding-bottom: 8px;
              border-bottom: 1px dashed #000;
            }
            .item {
              display: flex;
              justify-content: space-between;
              margin-bottom: 4px;
            }
            .item-name {
              flex: 1;
              word-break: break-word;
            }
            .item-qty {
              width: 30px;
              text-align: center;
            }
            .item-price {
              width: 50px;
              text-align: right;
            }
            .total {
              display: flex;
              justify-content: space-between;
              font-size: 14px;
              font-weight: bold;
              margin: 8px 0;
              padding: 8px 0;
              border-top: 2px solid #000;
              border-bottom: 2px solid #000;
            }
            .footer {
              text-align: center;
              font-size: 10px;
              margin-top: 12px;
            }
            @media print {
              body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>ORDER RECEIPT</h1>
            <p>${order.order_number}</p>
          </div>
          
          <div class="info">
            <div class="info-row">
              <span>Table:</span>
              <span>${order.table_number || 'N/A'}</span>
            </div>
            ${order.guest_name ? `
            <div class="info-row">
              <span>Guest:</span>
              <span>${order.guest_name}</span>
            </div>
            ` : ''}
            <div class="info-row">
              <span>Waiter:</span>
              <span>${order.profiles?.full_name || 'N/A'}</span>
            </div>
            <div class="info-row">
              <span>Date:</span>
              <span>${new Date().toLocaleDateString()}</span>
            </div>
            <div class="info-row">
              <span>Time:</span>
              <span>${new Date().toLocaleTimeString()}</span>
            </div>
          </div>
          
          <div class="items">
            <div class="item" style="font-weight: bold; margin-bottom: 8px;">
              <span class="item-name">Item</span>
              <span class="item-qty">Qty</span>
              <span class="item-price">Price</span>
            </div>
            ${order.order_items?.map(item => `
              <div class="item">
                <span class="item-name">${item.menu_item?.name || 'Item'}</span>
                <span class="item-qty">${item.quantity}</span>
                <span class="item-price">${formatPrice(item.price * item.quantity)}</span>
              </div>
            `).join('') || ''}
          </div>
          
          <div class="total">
            <span>TOTAL</span>
            <span>${formatPrice(order.total_amount)}</span>
          </div>
          
          <div class="footer">
            <p>Thank you for your order!</p>
            <p style="margin-top: 4px;">================================</p>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (printWindow) {
      printWindow.document.write(receiptContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'bg-success text-success-foreground';
      case 'served':
        return 'bg-accent text-accent-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  const getSplitTotal = () => {
    const cash = parseFloat(splitAmounts.cash || "0");
    const pos = parseFloat(splitAmounts.pos || "0");
    const transfer = parseFloat(splitAmounts.transfer || "0");
    return cash + pos + transfer;
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-xl font-bold">Cashier Station</h1>
            <p className="text-sm text-muted-foreground">
              {orders.length} pending payments
            </p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <Tabs defaultValue="payments" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="payments">
              Payments ({orders.length})
            </TabsTrigger>
            <TabsTrigger value="returns">
              Returns ({returns.length})
            </TabsTrigger>
          </TabsList>

          {/* Payments Tab */}
          <TabsContent value="payments" className="space-y-3">
            {/* Filter Toggle */}
            <div className="flex justify-end">
              <Button
                variant={showPaidOrders ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  const newValue = !showPaidOrders;
                  setShowPaidOrders(newValue);
                  fetchOrders(newValue);
                }}
                className="gap-2"
              >
                {showPaidOrders ? (
                  <>
                    <Eye className="h-4 w-4" />
                    Showing Paid Orders
                  </>
                ) : (
                  <>
                    <EyeOff className="h-4 w-4" />
                    Paid Orders Hidden
                  </>
                )}
              </Button>
            </div>
            
            {orders.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No pending payments</p>
              </Card>
            ) : (
              groupedOrders.map(([tableKey, tableOrders]) => (
                <Collapsible
                  key={tableKey}
                  open={expandedPaymentTables.has(tableKey)}
                  onOpenChange={() => togglePaymentTable(tableKey)}
                >
                  <Card className="overflow-hidden">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/5 transition-colors">
                        <div className="flex items-center gap-3">
                          {expandedPaymentTables.has(tableKey) ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div>
                            <h3 className="font-semibold">Table {tableKey}</h3>
                            <p className="text-sm text-muted-foreground">
                              {tableOrders.length} order{tableOrders.length !== 1 ? 's' : ''} • 
                              Total: {formatPrice(tableOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0))}
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary">
                          {tableOrders.length}
                        </Badge>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t border-border divide-y divide-border">
                        {tableOrders.map((order) => (
                          <div
                            key={order.id}
                            className="p-4 hover:bg-accent/5 transition-colors cursor-pointer"
                            onClick={() => setViewingOrder(order)}
                          >
                            <div className="space-y-3">
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="font-semibold text-lg">
                                    {order.order_number}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {order.guest_name && `${order.guest_name}`}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Waiter: {order.profiles?.full_name || 'Unknown'}
                                  </div>
                                </div>
                                <Badge className={getStatusColor(order.status)}>
                                  {order.status}
                                </Badge>
                              </div>

                              <div className="flex items-center justify-between border-t border-border pt-3">
                                <div>
                                  <div className="text-2xl font-bold">
                                    {formatPrice(order.total_amount)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {order.served_at 
                                      ? `Served: ${new Date(order.served_at).toLocaleTimeString()}`
                                      : `Ordered: ${new Date(order.created_at).toLocaleTimeString()}`
                                    }
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSplitPaymentOrder(order);
                                    }}
                                  >
                                    <Split className="mr-2 h-4 w-4" />
                                    Split Bill
                                  </Button>
                                  <Button onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenPayment(order);
                                  }}>
                                    <DollarSign className="mr-2 h-4 w-4" />
                                    Full Payment
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))
            )}
          </TabsContent>

          {/* Returns Tab */}
          <TabsContent value="returns" className="space-y-3">
            {returns.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No confirmed returns</p>
              </Card>
            ) : (
              groupedReturns.map(([tableKey, tableReturns]) => (
                <Collapsible
                  key={tableKey}
                  open={expandedReturnTables.has(tableKey)}
                  onOpenChange={() => toggleReturnTable(tableKey)}
                >
                  <Card className="overflow-hidden border-destructive/30">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/5 transition-colors">
                        <div className="flex items-center gap-3">
                          {expandedReturnTables.has(tableKey) ? (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div>
                            <h3 className="font-semibold">Table {tableKey}</h3>
                            <p className="text-sm text-muted-foreground">
                              {tableReturns.length} return{tableReturns.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <Badge variant="destructive">
                          {tableReturns.length}
                        </Badge>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t border-border divide-y divide-border">
                        {tableReturns.map((returnItem) => (
                          <div
                            key={returnItem.id}
                            className="p-4"
                          >
                            <div className="space-y-3">
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="font-semibold">
                                    {returnItem.order_items.orders.order_number}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Reported by: {returnItem.profiles?.full_name || 'Unknown'}
                                  </div>
                                </div>
                                <Badge variant="destructive">
                                  <AlertTriangle className="mr-1 h-3 w-3" />
                                  Return
                                </Badge>
                              </div>

                              <div className="border-t border-border pt-3">
                                <div className="font-medium">
                                  {returnItem.order_items.menu_items.name}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Qty: {returnItem.order_items.quantity} • 
                                  {formatPrice(returnItem.order_items.price)} each
                                </div>
                                <div className="text-sm text-destructive mt-2">
                                  Reason: {returnItem.reason}
                                </div>
                              </div>

                              <div className="flex items-center justify-between border-t border-border pt-3">
                                <div className="text-lg font-bold">
                                  Refund: {formatPrice(returnItem.refund_amount || 
                                    returnItem.order_items.price * returnItem.order_items.quantity
                                  )}
                                </div>
                                {!returnItem.refund_amount && (
                                  <Button
                                    variant="outline"
                                    onClick={() => handleApproveRefund(returnItem)}
                                  >
                                    Approve Refund
                                  </Button>
                                )}
                                {returnItem.refund_amount && (
                                  <Badge variant="secondary">Approved</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Payment Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
            <DialogDescription>
              Order {selectedOrder?.order_number} • Table {selectedOrder?.table_number}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-center py-4 border-y border-border">
              <div className="text-3xl font-bold">
                {selectedOrder ? formatPrice(selectedOrder.total_amount) : ''}
              </div>
              <div className="text-sm text-muted-foreground">Total Amount</div>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select
                value={paymentMethod}
                onValueChange={(value: any) => setPaymentMethod(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="pos">POS/Card</SelectItem>
                  <SelectItem value="transfer">Bank Transfer</SelectItem>
                  <SelectItem value="split">Split Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === "split" && (
              <div className="space-y-3 p-3 bg-muted/50 rounded-md">
                <Label className="text-sm font-semibold">Split Payment Details</Label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="w-20 text-sm">Cash:</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={splitAmounts.cash}
                      onChange={(e) => setSplitAmounts(prev => ({ ...prev, cash: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="w-20 text-sm">POS:</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={splitAmounts.pos}
                      onChange={(e) => setSplitAmounts(prev => ({ ...prev, pos: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="w-20 text-sm">Transfer:</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={splitAmounts.transfer}
                      onChange={(e) => setSplitAmounts(prev => ({ ...prev, transfer: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="font-semibold">Total:</span>
                    <span className={`font-bold ${
                      Math.abs(getSplitTotal() - (selectedOrder?.total_amount || 0)) < 0.01
                        ? 'text-success'
                        : 'text-destructive'
                     }`}>
                      {formatPrice(getSplitTotal())}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Add payment notes..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedOrder(null)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmPayment} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Confirm Payment'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split Payment Dialog */}
      <SplitPaymentDialog
        order={splitPaymentOrder}
        open={!!splitPaymentOrder}
        onClose={() => setSplitPaymentOrder(null)}
        onPaymentComplete={() => {
          fetchOrders();
          setSplitPaymentOrder(null);
        }}
      />

      {/* Order Details Dialog */}
      <Dialog open={!!viewingOrder} onOpenChange={(open) => !open && setViewingOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>
              {viewingOrder?.order_number} • Table {viewingOrder?.table_number}
              {viewingOrder?.guest_name && ` • ${viewingOrder.guest_name}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              {viewingOrder?.order_items?.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium bg-muted px-2 py-1 rounded">
                      {item.quantity}x
                    </span>
                    <span>{item.menu_item?.name}</span>
                  </div>
                  <span className="font-medium">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border">
              <span className="text-lg font-semibold">Total</span>
              <span className="text-xl font-bold">
                {viewingOrder ? formatPrice(viewingOrder.total_amount) : ''}
              </span>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-12"
              onClick={() => handlePrintReceipt(viewingOrder)}
              title="Print Receipt"
            >
              <Printer className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setViewingOrder(null);
                if (viewingOrder) setSplitPaymentOrder(viewingOrder);
              }}
            >
              <Split className="mr-2 h-4 w-4" />
              Split Bill
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                setViewingOrder(null);
                if (viewingOrder) handleOpenPayment(viewingOrder);
              }}
            >
              <DollarSign className="mr-2 h-4 w-4" />
              Full Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Cashier;
