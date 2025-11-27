import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, Save, Palette, Bell, Clock, Receipt, DollarSign } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TenantSettings {
  id: string;
  name: string;
  logo_url: string | null;
  theme_config: any;
  currency: string;
}

const CURRENCIES = [
  { code: "USD", name: "US Dollar ($)", symbol: "$" },
  { code: "EUR", name: "Euro (€)", symbol: "€" },
  { code: "GBP", name: "British Pound (£)", symbol: "£" },
  { code: "JPY", name: "Japanese Yen (¥)", symbol: "¥" },
  { code: "CNY", name: "Chinese Yuan (¥)", symbol: "¥" },
  { code: "INR", name: "Indian Rupee (₹)", symbol: "₹" },
  { code: "AUD", name: "Australian Dollar ($)", symbol: "$" },
  { code: "CAD", name: "Canadian Dollar ($)", symbol: "$" },
  { code: "CHF", name: "Swiss Franc (CHF)", symbol: "CHF" },
  { code: "SEK", name: "Swedish Krona (kr)", symbol: "kr" },
  { code: "NZD", name: "New Zealand Dollar ($)", symbol: "$" },
  { code: "ZAR", name: "South African Rand (R)", symbol: "R" },
  { code: "NGN", name: "Nigerian Naira (₦)", symbol: "₦" },
  { code: "KES", name: "Kenyan Shilling (KSh)", symbol: "KSh" },
  { code: "AED", name: "UAE Dirham (د.إ)", symbol: "د.إ" },
  { code: "SAR", name: "Saudi Riyal (﷼)", symbol: "﷼" },
  { code: "BRL", name: "Brazilian Real (R$)", symbol: "R$" },
  { code: "MXN", name: "Mexican Peso ($)", symbol: "$" },
];

const DEFAULT_HOURS = { open: "09:00", close: "17:00", closed: false };

export default function AdminSettings() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) return;

    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", profile.tenant_id)
      .single();

    if (error) {
      toast.error("Failed to load settings");
      return;
    }

    setSettings(data);
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !settings) return;

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${settings.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('tenant-logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('tenant-logos')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('tenants')
        .update({ logo_url: publicUrl })
        .eq('id', settings.id);

      if (updateError) throw updateError;

      setSettings({ ...settings, logo_url: publicUrl });
      toast.success("Logo uploaded successfully");
    } catch (error) {
      toast.error("Failed to upload logo");
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveTheme = async () => {
    if (!settings) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('tenants')
        .update({ theme_config: settings.theme_config })
        .eq('id', settings.id);

      if (error) throw error;
      toast.success("Theme settings saved");
    } catch (error) {
      toast.error("Failed to save theme settings");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleCurrencyChange = async (currency: string) => {
    if (!settings) return;

    try {
      const { error } = await supabase
        .from('tenants')
        .update({ currency })
        .eq('id', settings.id);

      if (error) throw error;
      
      setSettings({ ...settings, currency });
      toast.success("Currency updated successfully");
    } catch (error) {
      toast.error("Failed to update currency");
      console.error(error);
    }
  };

  const updateThemeConfig = (path: string[], value: any) => {
    if (!settings) return;

    const newConfig = { ...settings.theme_config };
    let current: any = newConfig;

    for (let i = 0; i < path.length - 1; i++) {
      if (!current[path[i]]) current[path[i]] = {};
      current = current[path[i]];
    }

    current[path[path.length - 1]] = value;
    setSettings({ ...settings, theme_config: newConfig });
  };

  if (!settings) {
    return <div className="container mx-auto p-6">Loading...</div>;
  }

  const notifications = settings.theme_config.notifications || {};
  const operationalHours = settings.theme_config.operational_hours || {};
  const receipt = settings.theme_config.receipt || {};

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure your tenant preferences and branding</p>
      </div>

      <Tabs defaultValue="branding" className="space-y-4">
        <TabsList>
          <TabsTrigger value="branding" className="gap-2">
            <Palette className="h-4 w-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="hours" className="gap-2">
            <Clock className="h-4 w-4" />
            Operational Hours
          </TabsTrigger>
          <TabsTrigger value="receipt" className="gap-2">
            <Receipt className="h-4 w-4" />
            Receipt
          </TabsTrigger>
        </TabsList>

        <TabsContent value="branding" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Logo</CardTitle>
              <CardDescription>Upload your organization logo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings.logo_url && (
                <div className="flex items-center gap-4">
                  <img
                    src={settings.logo_url}
                    alt="Tenant logo"
                    className="h-20 w-20 object-contain rounded border"
                  />
                </div>
              )}
              <div>
                <Label htmlFor="logo-upload" className="cursor-pointer">
                  <div className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <Upload className="h-4 w-4" />
                    {uploading ? "Uploading..." : "Upload New Logo"}
                  </div>
                </Label>
                <Input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                  disabled={uploading}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Currency</CardTitle>
              <CardDescription>Set your default currency for pricing and transactions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currency">Default Currency</Label>
                <Select value={settings.currency} onValueChange={handleCurrencyChange}>
                  <SelectTrigger id="currency" className="w-full">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((curr) => (
                      <SelectItem key={curr.code} value={curr.code}>
                        {curr.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Color Scheme</CardTitle>
              <CardDescription>Customize your brand colors</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="primary-color">Primary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="primary-color"
                      type="color"
                      value={settings.theme_config.primary_color || "#0ea5e9"}
                      onChange={(e) => updateThemeConfig(["primary_color"], e.target.value)}
                      className="w-20 h-10"
                    />
                    <Input
                      type="text"
                      value={settings.theme_config.primary_color || "#0ea5e9"}
                      onChange={(e) => updateThemeConfig(["primary_color"], e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="secondary-color">Secondary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="secondary-color"
                      type="color"
                      value={settings.theme_config.secondary_color || "#f97316"}
                      onChange={(e) => updateThemeConfig(["secondary_color"], e.target.value)}
                      className="w-20 h-10"
                    />
                    <Input
                      type="text"
                      value={settings.theme_config.secondary_color || "#f97316"}
                      onChange={(e) => updateThemeConfig(["secondary_color"], e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accent-color">Accent Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="accent-color"
                      type="color"
                      value={settings.theme_config.accent_color || "#8b5cf6"}
                      onChange={(e) => updateThemeConfig(["accent_color"], e.target.value)}
                      className="w-20 h-10"
                    />
                    <Input
                      type="text"
                      value={settings.theme_config.accent_color || "#8b5cf6"}
                      onChange={(e) => updateThemeConfig(["accent_color"], e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveTheme} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Theme"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Configure sound alerts and notification types</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Sound Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable audio notifications for important events
                  </p>
                </div>
                <Switch
                  checked={notifications.sound_enabled ?? true}
                  onCheckedChange={(checked) =>
                    updateThemeConfig(["notifications", "sound_enabled"], checked)
                  }
                />
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-medium">Notification Types</h4>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>New Orders</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify when new orders are placed
                    </p>
                  </div>
                  <Switch
                    checked={notifications.new_orders ?? true}
                    onCheckedChange={(checked) =>
                      updateThemeConfig(["notifications", "new_orders"], checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Ready Items</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify when items are ready for pickup
                    </p>
                  </div>
                  <Switch
                    checked={notifications.ready_items ?? true}
                    onCheckedChange={(checked) =>
                      updateThemeConfig(["notifications", "ready_items"], checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Returns & Issues</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify about order returns and problems
                    </p>
                  </div>
                  <Switch
                    checked={notifications.returns ?? true}
                    onCheckedChange={(checked) =>
                      updateThemeConfig(["notifications", "returns"], checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Out of Stock</Label>
                    <p className="text-sm text-muted-foreground">
                      Alert when items run out of stock
                    </p>
                  </div>
                  <Switch
                    checked={notifications.out_of_stock ?? true}
                    onCheckedChange={(checked) =>
                      updateThemeConfig(["notifications", "out_of_stock"], checked)
                    }
                  />
                </div>
              </div>

              <Button onClick={handleSaveTheme} disabled={saving} className="mt-4">
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Preferences"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hours" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Operational Hours</CardTitle>
              <CardDescription>Set your operating hours for each day of the week</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-4">
                  {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => {
                    const hours = operationalHours[day] || DEFAULT_HOURS;
                    return (
                      <div key={day} className="flex items-center gap-4 p-4 border rounded-lg">
                        <div className="w-32">
                          <Label className="capitalize font-medium">{day}</Label>
                        </div>

                        <div className="flex items-center gap-2 flex-1">
                          <Switch
                            checked={!hours.closed}
                            onCheckedChange={(checked) =>
                              updateThemeConfig(["operational_hours", day, "closed"], !checked)
                            }
                          />
                          <span className="text-sm text-muted-foreground">
                            {hours.closed ? "Closed" : "Open"}
                          </span>
                        </div>

                        {!hours.closed && (
                          <>
                            <div className="flex items-center gap-2">
                              <Label className="text-sm">From:</Label>
                              <Input
                                type="time"
                                value={hours.open}
                                onChange={(e) =>
                                  updateThemeConfig(["operational_hours", day, "open"], e.target.value)
                                }
                                className="w-32"
                              />
                            </div>

                            <div className="flex items-center gap-2">
                              <Label className="text-sm">To:</Label>
                              <Input
                                type="time"
                                value={hours.close}
                                onChange={(e) =>
                                  updateThemeConfig(["operational_hours", day, "close"], e.target.value)
                                }
                                className="w-32"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <Button onClick={handleSaveTheme} disabled={saving} className="mt-4">
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Hours"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receipt" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Receipt Customization</CardTitle>
              <CardDescription>Personalize your customer receipts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="receipt-header">Header Text</Label>
                <Textarea
                  id="receipt-header"
                  placeholder="e.g., Thank you for your order!"
                  value={receipt.header_text || ""}
                  onChange={(e) => updateThemeConfig(["receipt", "header_text"], e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="receipt-footer">Footer Text</Label>
                <Textarea
                  id="receipt-footer"
                  placeholder="e.g., Visit us again soon!"
                  value={receipt.footer_text || ""}
                  onChange={(e) => updateThemeConfig(["receipt", "footer_text"], e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h4 className="font-medium">Display Options</h4>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Show Logo</Label>
                    <p className="text-sm text-muted-foreground">
                      Display your logo on receipts
                    </p>
                  </div>
                  <Switch
                    checked={receipt.show_logo ?? true}
                    onCheckedChange={(checked) =>
                      updateThemeConfig(["receipt", "show_logo"], checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Show QR Code</Label>
                    <p className="text-sm text-muted-foreground">
                      Include QR code for feedback or website
                    </p>
                  </div>
                  <Switch
                    checked={receipt.show_qr ?? false}
                    onCheckedChange={(checked) =>
                      updateThemeConfig(["receipt", "show_qr"], checked)
                    }
                  />
                </div>
              </div>

              <Button onClick={handleSaveTheme} disabled={saving} className="mt-4">
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Receipt Settings"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
