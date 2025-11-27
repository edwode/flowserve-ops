interface QueuedRequest {
  id: string;
  timestamp: number;
  type: 'order' | 'update';
  data: any;
  retryCount: number;
}

const QUEUE_KEY = 'offline_request_queue';
const MAX_RETRIES = 3;

export class OfflineQueue {
  private static instance: OfflineQueue;

  private constructor() {
    this.init();
  }

  static getInstance(): OfflineQueue {
    if (!OfflineQueue.instance) {
      OfflineQueue.instance = new OfflineQueue();
    }
    return OfflineQueue.instance;
  }

  private init() {
    // Listen for sync events
    window.addEventListener('sync-pending-requests', () => {
      this.processPendingRequests();
    });
  }

  addToQueue(type: 'order' | 'update', data: any): string {
    const request: QueuedRequest = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type,
      data,
      retryCount: 0,
    };

    const queue = this.getQueue();
    queue.push(request);
    this.saveQueue(queue);

    return request.id;
  }

  private getQueue(): QueuedRequest[] {
    try {
      const stored = localStorage.getItem(QUEUE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private saveQueue(queue: QueuedRequest[]) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('Failed to save queue:', error);
    }
  }

  getQueueLength(): number {
    return this.getQueue().length;
  }

  async processPendingRequests(): Promise<void> {
    const queue = this.getQueue();
    if (queue.length === 0) return;

    console.log(`Processing ${queue.length} pending requests...`);

    const results = await Promise.allSettled(
      queue.map((request) => this.processRequest(request))
    );

    // Remove successfully processed requests
    const failedRequests = queue.filter((request, index) => {
      const result = results[index];
      if (result.status === 'fulfilled' && result.value) {
        return false; // Remove from queue
      }
      // Increment retry count
      request.retryCount++;
      return request.retryCount < MAX_RETRIES; // Keep if under max retries
    });

    this.saveQueue(failedRequests);

    // Notify about sync completion
    window.dispatchEvent(
      new CustomEvent('sync-complete', {
        detail: {
          processed: queue.length - failedRequests.length,
          failed: failedRequests.length,
        },
      })
    );
  }

  private async processRequest(request: QueuedRequest): Promise<boolean> {
    // This will be implemented by the consuming component
    // by listening to custom events
    return new Promise((resolve) => {
      const event = new CustomEvent('process-queued-request', {
        detail: { request, resolve },
      });
      window.dispatchEvent(event);
    });
  }

  clearQueue() {
    localStorage.removeItem(QUEUE_KEY);
  }
}

export const offlineQueue = OfflineQueue.getInstance();
