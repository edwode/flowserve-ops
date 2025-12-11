import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign, X, Printer, Split } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SplitPaymentDialog } from "@/components/SplitPaymentDialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";

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

interface ConsolidatedOrderDialogProps {
  orders: Order[];
  open: boolean;
  onClose: () => void;
  onPaymentComplete: () => void;
  userId: string;
  tenantId: string;
}

export const ConsolidatedOrderDialog = ({
  orders,
  open,
  onClose,
  onPaymentComplete,
  userId,
  tenantId,
}: ConsolidatedOrderDialogProps) => {
  const { toast } = useToast();
  const { formatPrice } = useTenantCurrency();
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "pos" | "transfer" | "split">("cash");
  const [splitAmounts, setSplitAmounts] = useState({
    cash: "",
    pos: "",
    transfer: "",
  });
  const [paymentNotes, setPaymentNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);

  // Calculate consolidated totals
  const consolidatedTotal = orders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
  const allItems = orders.flatMap(order => 
    (order.order_items || []).map(item => ({
      ...item,
      orderNumber: order.order_number,
    }))
  );
  const tableNumber = orders[0]?.table_number || 'N/A';

  const getSplitTotal = () => {
    const cash = parseFloat(splitAmounts.cash || "0");
    const pos = parseFloat(splitAmounts.pos || "0");
    const transfer = parseFloat(splitAmounts.transfer || "0");
    return cash + pos + transfer;
  };

  const handleConfirmPayment = async () => {
    if (orders.length === 0) return;

    setProcessing(true);
    try {
      // Handle split payment
      if (paymentMethod === "split") {
        const cash = parseFloat(splitAmounts.cash || "0");
        const pos = parseFloat(splitAmounts.pos || "0");
        const transfer = parseFloat(splitAmounts.transfer || "0");
        const total = cash + pos + transfer;

        if (Math.abs(total - consolidatedTotal) > 0.01) {
          toast({
            title: "Invalid split amounts",
            description: `Total must equal ${formatPrice(consolidatedTotal)}`,
            variant: "destructive",
          });
          setProcessing(false);
          return;
        }

        // Create payment records for each order proportionally
        for (const order of orders) {
          const orderRatio = order.total_amount / consolidatedTotal;
          const payments = [];
          if (cash > 0) payments.push({ method: 'cash', amount: cash * orderRatio });
          if (pos > 0) payments.push({ method: 'pos', amount: pos * orderRatio });
          if (transfer > 0) payments.push({ method: 'transfer', amount: transfer * orderRatio });

          for (const payment of payments) {
            const { error: paymentError } = await supabase
              .from('payments')
              .insert({
                order_id: order.id,
                amount: payment.amount,
                payment_method: payment.method as "cash" | "pos" | "transfer",
                tenant_id: tenantId,
                confirmed_by: userId,
                notes: paymentNotes ? `[Consolidated] ${paymentNotes}` : '[Consolidated Payment]',
              });

            if (paymentError) throw paymentError;
          }
        }
      } else {
        // Single payment method - create payment for each order
        for (const order of orders) {
          const { error: paymentError } = await supabase
            .from('payments')
            .insert({
              order_id: order.id,
              amount: order.total_amount,
              payment_method: paymentMethod,
              tenant_id: tenantId,
              confirmed_by: userId,
              notes: paymentNotes ? `[Consolidated] ${paymentNotes}` : '[Consolidated Payment]',
            });

          if (paymentError) throw paymentError;
        }
      }

      // Update all orders to paid status
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .in('id', orders.map(o => o.id));

      if (orderError) throw orderError;

      toast({
        title: "Consolidated payment confirmed",
        description: `${orders.length} orders marked as paid`,
      });

      handleClose();
      onPaymentComplete();
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

  const handleClose = () => {
    setPaymentMethod("cash");
    setSplitAmounts({ cash: "", pos: "", transfer: "" });
    setPaymentNotes("");
    onClose();
  };

  const handlePrintReceipt = () => {
    const receiptContent = `
      <html>
        <head>
          <title>Consolidated Receipt - Table ${tableNumber}</title>
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
            .order-section {
              margin-bottom: 8px;
              padding-bottom: 8px;
              border-bottom: 1px dashed #000;
            }
            .order-header {
              font-weight: bold;
              margin-bottom: 4px;
              font-size: 11px;
            }
            .item {
              display: flex;
              justify-content: space-between;
              margin-bottom: 2px;
              font-size: 11px;
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
            .subtotal {
              display: flex;
              justify-content: space-between;
              margin-top: 4px;
              font-size: 11px;
              font-weight: bold;
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
            <h1>CONSOLIDATED RECEIPT</h1>
            <p>Table ${tableNumber}</p>
          </div>
          
          <div class="info">
            <div class="info-row">
              <span>Orders:</span>
              <span>${orders.length}</span>
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
          
          ${orders.map(order => `
            <div class="order-section">
              <div class="order-header">${order.order_number} ${order.guest_name ? `(${order.guest_name})` : ''}</div>
              ${order.order_items?.map(item => `
                <div class="item">
                  <span class="item-name">${item.menu_item?.name || 'Item'}</span>
                  <span class="item-qty">${item.quantity}</span>
                  <span class="item-price">${formatPrice(item.price * item.quantity)}</span>
                </div>
              `).join('') || ''}
              <div class="subtotal">
                <span>Subtotal:</span>
                <span>${formatPrice(order.total_amount)}</span>
              </div>
            </div>
          `).join('')}
          
          <div class="total">
            <span>GRAND TOTAL</span>
            <span>${formatPrice(consolidatedTotal)}</span>
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

  // Create a virtual consolidated order for the SplitPaymentDialog
  const consolidatedOrderForSplit: Order = {
    id: `consolidated-${orders.map(o => o.id).join('-')}`,
    order_number: `Consolidated (${orders.length} orders)`,
    table_number: tableNumber,
    guest_name: null,
    status: 'served',
    total_amount: consolidatedTotal,
    created_at: new Date().toISOString(),
    served_at: new Date().toISOString(),
    profiles: { full_name: 'Multiple Waiters' },
    order_items: allItems.map((item, idx) => ({
      id: `consolidated-item-${idx}`,
      quantity: item.quantity,
      price: item.price,
      menu_item: item.menu_item,
    })),
  };

  if (!open) return null;

  return (
    <>
      <Dialog open={open && !showSplitDialog} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Consolidated Order</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handlePrintReceipt}
                title="Print Receipt"
              >
                <Printer className="h-4 w-4" />
              </Button>
            </DialogTitle>
            <DialogDescription>
              Table {tableNumber} • {orders.length} orders combined
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 max-h-[40vh]">
            <div className="space-y-4 pr-4">
              {/* Orders Summary */}
              <div className="space-y-3">
                {orders.map((order) => (
                  <div key={order.id} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{order.order_number}</div>
                      <Badge variant="secondary" className="text-xs">
                        {formatPrice(order.total_amount)}
                      </Badge>
                    </div>
                    {order.guest_name && (
                      <div className="text-xs text-muted-foreground">{order.guest_name}</div>
                    )}
                    <div className="space-y-1">
                      {order.order_items?.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{item.quantity}x {item.menu_item?.name}</span>
                          <span>{formatPrice(item.price * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>

          {/* Grand Total */}
          <div className="text-center py-4 border-y border-border bg-muted/30">
            <div className="text-3xl font-bold">{formatPrice(consolidatedTotal)}</div>
            <div className="text-sm text-muted-foreground">Grand Total ({orders.length} orders)</div>
          </div>

          {/* Payment Section */}
          <div className="space-y-4">
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
                      Math.abs(getSplitTotal() - consolidatedTotal) < 0.01
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

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={processing}
              className="w-full sm:w-auto"
            >
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowSplitDialog(true)}
              disabled={processing}
              className="w-full sm:w-auto"
            >
              <Split className="mr-2 h-4 w-4" />
              Advanced Split
            </Button>
            <Button 
              onClick={handleConfirmPayment} 
              disabled={processing}
              className="w-full sm:w-auto"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Confirm Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advanced Split Payment Dialog - Note: This won't work with consolidated orders 
          as SplitPaymentDialog expects a single order. We'll handle this differently. */}
      {showSplitDialog && (
        <Dialog open={showSplitDialog} onOpenChange={(isOpen) => !isOpen && setShowSplitDialog(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Advanced Split Not Available</DialogTitle>
              <DialogDescription>
                Advanced split payment (by guest or by item) is not available for consolidated orders. 
                Please use the basic split payment option above to divide the total by payment method.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setShowSplitDialog(false)}>
                Got it
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
