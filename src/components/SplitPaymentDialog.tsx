import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users,
  Receipt,
  DollarSign,
  Check,
  Plus,
  Trash2,
} from "lucide-react";

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  menu_item: {
    name: string;
  };
}

interface Order {
  id: string;
  order_number: string;
  total_amount: number;
  table_number: string | null;
  guest_name: string | null;
  order_items?: OrderItem[];
}

interface PaymentSummary {
  total_amount: number;
  total_paid: number;
  remaining_balance: number;
  is_fully_paid: boolean;
}

interface SplitPaymentDialogProps {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onPaymentComplete: () => void;
}

interface GuestSplit {
  id: string;
  name: string;
  amount: number;
  paymentMethod: string;
  paid: boolean;
}

interface ItemSelection {
  itemId: string;
  quantity: number;
  selected: boolean;
}

export function SplitPaymentDialog({
  order,
  open,
  onClose,
  onPaymentComplete,
}: SplitPaymentDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [splitType, setSplitType] = useState<"full" | "by_guest" | "by_item" | "custom">("full");
  
  // Full payment state
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  
  // By guest state
  const [guestCount, setGuestCount] = useState(2);
  const [guestSplits, setGuestSplits] = useState<GuestSplit[]>([]);
  
  // By item state
  const [itemSelections, setItemSelections] = useState<Record<string, ItemSelection>>({});
  const [currentItemPaymentMethod, setCurrentItemPaymentMethod] = useState<string>("cash");
  
  // Custom split state
  const [customSplits, setCustomSplits] = useState<GuestSplit[]>([
    { id: crypto.randomUUID(), name: "", amount: 0, paymentMethod: "cash", paid: false }
  ]);

  useEffect(() => {
    if (order && open) {
      fetchPaymentSummary();
      initializeGuestSplits();
      initializeItemSelections();
    }
  }, [order, open]);

  const fetchPaymentSummary = async () => {
    if (!order) return;

    const { data, error } = await supabase
      .rpc("get_order_payment_summary", { _order_id: order.id })
      .single();

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch payment summary",
        variant: "destructive",
      });
      return;
    }

    setPaymentSummary(data);
  };

  const initializeGuestSplits = () => {
    if (!order || !paymentSummary) return;
    
    const perGuestAmount = paymentSummary.remaining_balance / guestCount;
    const splits: GuestSplit[] = Array.from({ length: guestCount }, (_, i) => ({
      id: crypto.randomUUID(),
      name: `Guest ${i + 1}`,
      amount: perGuestAmount,
      paymentMethod: "cash",
      paid: false,
    }));
    setGuestSplits(splits);
  };

  const initializeItemSelections = () => {
    if (!order) return;
    
    const selections: Record<string, ItemSelection> = {};
    order.order_items.forEach((item) => {
      selections[item.id] = {
        itemId: item.id,
        quantity: 0,
        selected: false,
      };
    });
    setItemSelections(selections);
  };

  useEffect(() => {
    if (paymentSummary) {
      initializeGuestSplits();
    }
  }, [guestCount, paymentSummary]);

  const handleFullPayment = async () => {
    if (!order || !paymentSummary) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const { error } = await supabase.from("payments").insert({
        order_id: order.id,
        amount: paymentSummary.remaining_balance,
        payment_method: paymentMethod as any,
        confirmed_by: user.id,
        tenant_id: profile.tenant_id,
        split_type: "full",
        payment_status: "completed",
      });

      if (error) throw error;

      // Update order status to paid
      await supabase
        .from("orders")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", order.id);

      toast({
        title: "Payment completed",
        description: "Full payment processed successfully",
      });

      onPaymentComplete();
      onClose();
    } catch (error: any) {
      toast({
        title: "Payment failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGuestPayment = async (guest: GuestSplit, index: number) => {
    if (!order) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const splitSessionId = crypto.randomUUID();

      const { error } = await supabase.from("payments").insert({
        order_id: order.id,
        amount: guest.amount,
        payment_method: guest.paymentMethod as any,
        confirmed_by: user.id,
        tenant_id: profile.tenant_id,
        split_session_id: splitSessionId,
        split_type: "by_guest",
        guest_identifier: guest.name,
        payment_status: "partial",
      });

      if (error) throw error;

      // Mark guest as paid
      const updatedSplits = [...guestSplits];
      updatedSplits[index].paid = true;
      setGuestSplits(updatedSplits);

      // Check if all paid
      const allPaid = updatedSplits.every((s) => s.paid);
      if (allPaid) {
        await supabase
          .from("orders")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("id", order.id);
      }

      toast({
        title: "Payment recorded",
        description: `Payment from ${guest.name} recorded`,
      });

      await fetchPaymentSummary();
    } catch (error: any) {
      toast({
        title: "Payment failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleItemPayment = async () => {
    if (!order) return;

    const selectedItems = Object.values(itemSelections).filter((s) => s.selected && s.quantity > 0);
    if (selectedItems.length === 0) {
      toast({
        title: "No items selected",
        description: "Please select items to pay for",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const totalAmount = selectedItems.reduce((sum, sel) => {
        const item = order.order_items.find((i) => i.id === sel.itemId);
        return sum + (item ? item.price * sel.quantity : 0);
      }, 0);

      const splitSessionId = crypto.randomUUID();

      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .insert({
          order_id: order.id,
          amount: totalAmount,
          payment_method: currentItemPaymentMethod as any,
          confirmed_by: user.id,
          tenant_id: profile.tenant_id,
          split_session_id: splitSessionId,
          split_type: "by_item",
          payment_status: "partial",
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // Insert split payment items
      const splitItems = selectedItems.map((sel) => {
        const item = order.order_items.find((i) => i.id === sel.itemId);
        return {
          payment_id: payment.id,
          order_item_id: sel.itemId,
          quantity: sel.quantity,
          amount: item ? item.price * sel.quantity : 0,
          tenant_id: profile.tenant_id,
        };
      });

      const { error: itemsError } = await supabase
        .from("split_payment_items")
        .insert(splitItems);

      if (itemsError) throw itemsError;

      toast({
        title: "Payment recorded",
        description: `Payment for ${selectedItems.length} items processed`,
      });

      // Reset selections
      initializeItemSelections();
      await fetchPaymentSummary();
    } catch (error: any) {
      toast({
        title: "Payment failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCustomSplitPayment = async (split: GuestSplit, index: number) => {
    if (!order) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const splitSessionId = crypto.randomUUID();

      const { error } = await supabase.from("payments").insert({
        order_id: order.id,
        amount: split.amount,
        payment_method: split.paymentMethod as any,
        confirmed_by: user.id,
        tenant_id: profile.tenant_id,
        split_session_id: splitSessionId,
        split_type: "custom",
        guest_identifier: split.name || `Split ${index + 1}`,
        payment_status: "partial",
      });

      if (error) throw error;

      const updatedSplits = [...customSplits];
      updatedSplits[index].paid = true;
      setCustomSplits(updatedSplits);

      toast({
        title: "Payment recorded",
        description: `Payment of $${split.amount.toFixed(2)} recorded`,
      });

      await fetchPaymentSummary();
    } catch (error: any) {
      toast({
        title: "Payment failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addCustomSplit = () => {
    setCustomSplits([
      ...customSplits,
      { id: crypto.randomUUID(), name: "", amount: 0, paymentMethod: "cash", paid: false },
    ]);
  };

  const removeCustomSplit = (index: number) => {
    setCustomSplits(customSplits.filter((_, i) => i !== index));
  };

  const updateCustomSplit = (index: number, field: keyof GuestSplit, value: any) => {
    const updated = [...customSplits];
    updated[index] = { ...updated[index], [field]: value };
    setCustomSplits(updated);
  };

  if (!order || !paymentSummary) return null;

  const customSplitTotal = customSplits.reduce((sum, s) => sum + s.amount, 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Split Payment - {order.order_number}</DialogTitle>
          <DialogDescription>
            Table {order.table_number} • {order.guest_name}
          </DialogDescription>
        </DialogHeader>

        <Card className="bg-muted">
          <CardContent className="pt-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Amount:</span>
              <span className="font-semibold">${paymentSummary.total_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Already Paid:</span>
              <span className="font-semibold text-green-600">
                ${paymentSummary.total_paid.toFixed(2)}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="font-bold">Remaining Balance:</span>
              <span className="font-bold text-lg">
                ${paymentSummary.remaining_balance.toFixed(2)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Tabs value={splitType} onValueChange={(v) => setSplitType(v as any)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="full" className="gap-1">
              <DollarSign className="w-4 h-4" />
              Full
            </TabsTrigger>
            <TabsTrigger value="by_guest" className="gap-1">
              <Users className="w-4 h-4" />
              By Guest
            </TabsTrigger>
            <TabsTrigger value="by_item" className="gap-1">
              <Receipt className="w-4 h-4" />
              By Item
            </TabsTrigger>
            <TabsTrigger value="custom" className="gap-1">
              <DollarSign className="w-4 h-4" />
              Custom
            </TabsTrigger>
          </TabsList>

          <TabsContent value="full" className="space-y-4">
            <div>
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="pos">POS/Card</SelectItem>
                  <SelectItem value="transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleFullPayment}
              disabled={loading || paymentSummary.remaining_balance <= 0}
              className="w-full"
              size="lg"
            >
              Process Full Payment (${paymentSummary.remaining_balance.toFixed(2)})
            </Button>
          </TabsContent>

          <TabsContent value="by_guest" className="space-y-4">
            <div>
              <Label>Number of Guests</Label>
              <Input
                type="number"
                min="2"
                value={guestCount}
                onChange={(e) => setGuestCount(parseInt(e.target.value) || 2)}
              />
            </div>

            <div className="space-y-2">
              {guestSplits.map((guest, index) => (
                <Card key={guest.id} className={guest.paid ? "bg-green-50" : ""}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Guest name"
                          value={guest.name}
                          onChange={(e) => {
                            const updated = [...guestSplits];
                            updated[index].name = e.target.value;
                            setGuestSplits(updated);
                          }}
                          className="w-32"
                          disabled={guest.paid}
                        />
                        <Input
                          type="number"
                          step="0.01"
                          value={guest.amount}
                          onChange={(e) => {
                            const updated = [...guestSplits];
                            updated[index].amount = parseFloat(e.target.value) || 0;
                            setGuestSplits(updated);
                          }}
                          className="w-24"
                          disabled={guest.paid}
                        />
                      </div>
                      {guest.paid ? (
                        <Badge className="bg-green-600">
                          <Check className="w-4 h-4 mr-1" />
                          Paid
                        </Badge>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Select
                            value={guest.paymentMethod}
                            onValueChange={(value) => {
                              const updated = [...guestSplits];
                              updated[index].paymentMethod = value;
                              setGuestSplits(updated);
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="pos">POS</SelectItem>
                              <SelectItem value="transfer">Transfer</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            onClick={() => handleGuestPayment(guest, index)}
                            disabled={loading}
                          >
                            Pay
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="by_item" className="space-y-4">
            <div>
              <Label>Payment Method</Label>
              <Select
                value={currentItemPaymentMethod}
                onValueChange={setCurrentItemPaymentMethod}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="pos">POS/Card</SelectItem>
                  <SelectItem value="transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              {order.order_items?.map((item) => (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={itemSelections[item.id]?.selected}
                          onCheckedChange={(checked) => {
                            setItemSelections({
                              ...itemSelections,
                              [item.id]: {
                                ...itemSelections[item.id],
                                selected: !!checked,
                                quantity: checked ? item.quantity : 0,
                              },
                            });
                          }}
                        />
                        <div>
                          <p className="font-medium">{item.menu_item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            ${item.price.toFixed(2)} × {item.quantity}
                          </p>
                        </div>
                      </div>
                      {itemSelections[item.id]?.selected && (
                        <Input
                          type="number"
                          min="1"
                          max={item.quantity}
                          value={itemSelections[item.id]?.quantity || 0}
                          onChange={(e) => {
                            const qty = parseInt(e.target.value) || 0;
                            setItemSelections({
                              ...itemSelections,
                              [item.id]: {
                                ...itemSelections[item.id],
                                quantity: Math.min(qty, item.quantity),
                              },
                            });
                          }}
                          className="w-20"
                        />
                      )}
                      <span className="font-semibold">
                        ${(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button
              onClick={handleItemPayment}
              disabled={
                loading ||
                !Object.values(itemSelections).some((s) => s.selected && s.quantity > 0)
              }
              className="w-full"
              size="lg"
            >
              Process Item Payment
            </Button>
          </TabsContent>

          <TabsContent value="custom" className="space-y-4">
            <div className="space-y-2">
              {customSplits.map((split, index) => (
                <Card key={split.id} className={split.paid ? "bg-green-50" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Description"
                        value={split.name}
                        onChange={(e) => updateCustomSplit(index, "name", e.target.value)}
                        disabled={split.paid}
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Amount"
                        value={split.amount || ""}
                        onChange={(e) =>
                          updateCustomSplit(index, "amount", parseFloat(e.target.value) || 0)
                        }
                        className="w-28"
                        disabled={split.paid}
                      />
                      {!split.paid && (
                        <>
                          <Select
                            value={split.paymentMethod}
                            onValueChange={(value) =>
                              updateCustomSplit(index, "paymentMethod", value)
                            }
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="pos">POS</SelectItem>
                              <SelectItem value="transfer">Transfer</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            onClick={() => handleCustomSplitPayment(split, index)}
                            disabled={loading || split.amount <= 0}
                          >
                            Pay
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeCustomSplit(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {split.paid && (
                        <Badge className="bg-green-600">
                          <Check className="w-4 h-4 mr-1" />
                          Paid
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button onClick={addCustomSplit} variant="outline" className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add Split
            </Button>

            <Card className="bg-muted">
              <CardContent className="pt-4">
                <div className="flex justify-between">
                  <span>Custom Split Total:</span>
                  <span className="font-bold">${customSplitTotal.toFixed(2)}</span>
                </div>
                {customSplitTotal > paymentSummary.remaining_balance && (
                  <p className="text-sm text-red-600 mt-2">
                    Total exceeds remaining balance
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
