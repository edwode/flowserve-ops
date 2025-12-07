import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  NGN: "₦",
  JPY: "¥",
  CNY: "¥",
  INR: "₹",
  AUD: "A$",
  CAD: "C$",
  CHF: "CHF",
  KRW: "₩",
  MXN: "MX$",
  BRL: "R$",
  ZAR: "R",
  AED: "د.إ",
  SAR: "﷼",
};

export function useTenantCurrency() {
  const [currency, setCurrency] = useState<string>("USD");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrency();

    // Subscribe to realtime changes on tenants table
    const channel = supabase
      .channel('tenant-currency')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tenants',
        },
        (payload) => {
          if (payload.new && 'currency' in payload.new) {
            setCurrency(payload.new.currency as string);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCurrency = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (!profile?.tenant_id) return;

      const { data: tenant } = await supabase
        .from('tenants')
        .select('currency')
        .eq('id', profile.tenant_id)
        .single();

      if (tenant?.currency) {
        setCurrency(tenant.currency);
      }
    } catch (error) {
      console.error('Error fetching tenant currency:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number): string => {
    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    return `${symbol}${price.toFixed(2)}`;
  };

  const getCurrencySymbol = (): string => {
    return CURRENCY_SYMBOLS[currency] || currency;
  };

  return { currency, loading, formatPrice, getCurrencySymbol };
}
