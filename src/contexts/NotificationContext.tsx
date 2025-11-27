import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Notification {
  id: string;
  type: 'new_order' | 'ready_item' | 'return' | 'out_of_stock';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  requestNotificationPermission: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Sound generation utilities
class NotificationSounds {
  private audioContext: AudioContext;

  constructor() {
    this.audioContext = new AudioContext();
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine') {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  newOrder() {
    // Upward chime
    this.playTone(523.25, 0.1); // C5
    setTimeout(() => this.playTone(659.25, 0.15), 100); // E5
  }

  readyItem() {
    // Success sound
    this.playTone(783.99, 0.1); // G5
    setTimeout(() => this.playTone(1046.5, 0.2), 80); // C6
  }

  urgentReturn() {
    // Alert sound - three short beeps
    [0, 150, 300].forEach((delay) => {
      setTimeout(() => this.playTone(880, 0.1, 'square'), delay);
    });
  }

  outOfStock() {
    // Warning sound
    this.playTone(440, 0.15, 'triangle'); // A4
    setTimeout(() => this.playTone(349.23, 0.2, 'triangle'), 150); // F4
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [sounds] = useState(() => new NotificationSounds());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    getUserRole();
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const getUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id, user_roles(role)')
        .eq('id', user.id)
        .single();

      if (profile?.user_roles && Array.isArray(profile.user_roles) && profile.user_roles.length > 0) {
        const role = (profile.user_roles as any[])[0].role;
        setUserRole(role);
        setupRealtimeSubscriptions(role, profile.tenant_id, user.id);
      }
    } catch (error) {
      console.error('Error getting user role:', error);
    }
  };

  const setupRealtimeSubscriptions = (role: string, tenantId: string, userId: string) => {
    // Subscribe based on role
    if (role === 'waiter' || role === 'bar_staff') {
      subscribeToWaiterNotifications(userId);
    } else if (['drink_dispenser', 'meal_dispenser', 'mixologist'].includes(role)) {
      subscribeToStationNotifications(role, tenantId);
    } else if (role === 'cashier') {
      subscribeToCashierNotifications(tenantId);
    } else if (role === 'event_manager' || role === 'tenant_admin') {
      subscribeToManagerNotifications(tenantId);
    }
  };

  const subscribeToWaiterNotifications = (userId: string) => {
    // Listen for ready items
    const channel = supabase
      .channel('waiter-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'order_items',
          filter: `status=eq.ready`
        },
        async (payload: any) => {
          // Check if this item belongs to waiter's orders
          const { data } = await supabase
            .from('order_items')
            .select('orders!inner(waiter_id, order_number)')
            .eq('id', payload.new.id)
            .single();

          if (data && (data.orders as any).waiter_id === userId) {
            addNotification({
              type: 'ready_item',
              title: 'Order Ready',
              message: `Order ${(data.orders as any).order_number} is ready for pickup`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const subscribeToStationNotifications = (role: string, tenantId: string) => {
    const stationMap: Record<string, string> = {
      'drink_dispenser': 'drink_dispenser',
      'meal_dispenser': 'meal_dispenser',
      'mixologist': 'mixologist',
    };

    const stationType = stationMap[role];

    const channel = supabase
      .channel('station-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_items',
          filter: `station_type=eq.${stationType}`
        },
        (payload: any) => {
          addNotification({
            type: 'new_order',
            title: 'New Order',
            message: 'New item added to your station',
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_returns'
        },
        async (payload: any) => {
          const { data } = await supabase
            .from('order_returns')
            .select('order_items!inner(station_type)')
            .eq('id', payload.new.id)
            .single();

          if (data && (data.order_items as any).station_type === stationType) {
            addNotification({
              type: 'return',
              title: 'Item Return',
              message: 'A return needs your confirmation',
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const subscribeToCashierNotifications = (tenantId: string) => {
    const channel = supabase
      .channel('cashier-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `status=eq.served`
        },
        (payload: any) => {
          addNotification({
            type: 'new_order',
            title: 'Payment Due',
            message: `Order ${payload.new.order_number} is ready for payment`,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_returns'
        },
        () => {
          addNotification({
            type: 'return',
            title: 'Return Confirmed',
            message: 'A return has been confirmed by station',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const subscribeToManagerNotifications = (tenantId: string) => {
    const channel = supabase
      .channel('manager-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'menu_items',
          filter: `is_available=eq.false`
        },
        (payload: any) => {
          addNotification({
            type: 'out_of_stock',
            title: 'Out of Stock',
            message: `${payload.new.name} is now unavailable`,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_returns'
        },
        () => {
          addNotification({
            type: 'return',
            title: 'Item Return',
            message: 'A new return has been reported',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const addNotification = (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      read: false,
    };

    setNotifications(prev => [newNotification, ...prev].slice(0, 50)); // Keep last 50

    // Play sound
    switch (notification.type) {
      case 'new_order':
        sounds.newOrder();
        break;
      case 'ready_item':
        sounds.readyItem();
        break;
      case 'return':
        sounds.urgentReturn();
        break;
      case 'out_of_stock':
        sounds.outOfStock();
        break;
    }

    // Show toast
    toast({
      title: notification.title,
      description: notification.message,
    });

    // Show browser notification
    if (notificationPermission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
      });
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (permission === 'granted') {
        toast({
          title: "Notifications enabled",
          description: "You'll receive alerts for important events",
        });
      }
    }
  };

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(notif => notif.id === id ? { ...notif, read: true } : notif)
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearNotifications,
        requestNotificationPermission,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
