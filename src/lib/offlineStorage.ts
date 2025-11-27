const ORDERS_KEY = 'offline_orders';
const MENU_KEY = 'offline_menu';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface CachedData<T> {
  data: T;
  timestamp: number;
}

export class OfflineStorage {
  static saveOrders(orders: any[]) {
    try {
      const cached: CachedData<any[]> = {
        data: orders,
        timestamp: Date.now(),
      };
      localStorage.setItem(ORDERS_KEY, JSON.stringify(cached));
    } catch (error) {
      console.error('Failed to cache orders:', error);
    }
  }

  static getOrders(): any[] | null {
    try {
      const stored = localStorage.getItem(ORDERS_KEY);
      if (!stored) return null;

      const cached: CachedData<any[]> = JSON.parse(stored);
      
      // Check if cache is still valid
      if (Date.now() - cached.timestamp > CACHE_DURATION) {
        localStorage.removeItem(ORDERS_KEY);
        return null;
      }

      return cached.data;
    } catch {
      return null;
    }
  }

  static saveMenu(menuItems: any[]) {
    try {
      const cached: CachedData<any[]> = {
        data: menuItems,
        timestamp: Date.now(),
      };
      localStorage.setItem(MENU_KEY, JSON.stringify(cached));
    } catch (error) {
      console.error('Failed to cache menu:', error);
    }
  }

  static getMenu(): any[] | null {
    try {
      const stored = localStorage.getItem(MENU_KEY);
      if (!stored) return null;

      const cached: CachedData<any[]> = JSON.parse(stored);
      
      // Check if cache is still valid
      if (Date.now() - cached.timestamp > CACHE_DURATION) {
        localStorage.removeItem(MENU_KEY);
        return null;
      }

      return cached.data;
    } catch {
      return null;
    }
  }

  static clearCache() {
    localStorage.removeItem(ORDERS_KEY);
    localStorage.removeItem(MENU_KEY);
  }

  static getCacheAge(key: string): number | null {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;

      const cached: CachedData<any> = JSON.parse(stored);
      return Date.now() - cached.timestamp;
    } catch {
      return null;
    }
  }
}
