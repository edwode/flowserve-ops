import { useEffect, useState } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { offlineQueue } from "@/lib/offlineQueue";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { WifiOff, Wifi, CloudUpload, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OfflineIndicator() {
  const { isOnline, wasOffline } = useOnlineStatus();
  const [queueLength, setQueueLength] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    processed: number;
    failed: number;
  } | null>(null);

  useEffect(() => {
    updateQueueLength();

    const handleSyncStart = () => {
      setSyncing(true);
      setSyncResult(null);
    };

    const handleSyncComplete = (
      event: CustomEvent<{ processed: number; failed: number }>
    ) => {
      setSyncing(false);
      setSyncResult(event.detail);
      updateQueueLength();

      // Clear result after 5 seconds
      setTimeout(() => setSyncResult(null), 5000);
    };

    window.addEventListener('sync-pending-requests', handleSyncStart);
    window.addEventListener('sync-complete', handleSyncComplete as EventListener);

    return () => {
      window.removeEventListener('sync-pending-requests', handleSyncStart);
      window.removeEventListener('sync-complete', handleSyncComplete as EventListener);
    };
  }, []);

  useEffect(() => {
    // Update queue length periodically
    const interval = setInterval(updateQueueLength, 5000);
    return () => clearInterval(interval);
  }, []);

  const updateQueueLength = () => {
    setQueueLength(offlineQueue.getQueueLength());
  };

  const handleManualSync = () => {
    window.dispatchEvent(new Event('sync-pending-requests'));
  };

  if (isOnline && queueLength === 0 && !syncResult) {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
        <Wifi className="w-3 h-3 mr-1" />
        Online
      </Badge>
    );
  }

  return (
    <div className="space-y-2">
      {!isOnline && (
        <Alert className="bg-yellow-50 border-yellow-200">
          <WifiOff className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <strong>Offline Mode</strong> - Your changes will be saved locally and
            synced when connection is restored.
            {queueLength > 0 && (
              <span className="block mt-1">
                {queueLength} pending {queueLength === 1 ? 'request' : 'requests'} in queue
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {isOnline && queueLength > 0 && (
        <Alert className="bg-blue-50 border-blue-200">
          <CloudUpload className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800 flex items-center justify-between">
            <div>
              {syncing ? (
                <>
                  <strong>Syncing...</strong> Uploading {queueLength} pending{' '}
                  {queueLength === 1 ? 'request' : 'requests'}
                </>
              ) : (
                <>
                  <strong>Sync Available</strong> - {queueLength} pending{' '}
                  {queueLength === 1 ? 'request' : 'requests'} ready to upload
                </>
              )}
            </div>
            {!syncing && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleManualSync}
                className="ml-4"
              >
                Sync Now
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {syncResult && (
        <Alert
          className={
            syncResult.failed === 0
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }
        >
          {syncResult.failed === 0 ? (
            <Wifi className="h-4 w-4 text-green-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-600" />
          )}
          <AlertDescription
            className={syncResult.failed === 0 ? 'text-green-800' : 'text-red-800'}
          >
            <strong>Sync Complete</strong> - {syncResult.processed} requests uploaded
            {syncResult.failed > 0 && `, ${syncResult.failed} failed`}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
