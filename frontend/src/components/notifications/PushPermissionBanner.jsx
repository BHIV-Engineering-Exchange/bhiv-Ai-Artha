import { useState, useEffect } from 'react';
import { Bell, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';

const PushPermissionBanner = ({ pushNotifications }) => {
  const [dismissed, setDismissed] = useState(false);

  if (!pushNotifications || !pushNotifications.isSupported) return null;
  if (pushNotifications.permission === 'granted' || pushNotifications.isSubscribed) return null;
  if (pushNotifications.permission === 'denied') return null;
  if (dismissed) return null;

  return (
    <div className="mx-4 lg:mx-6 mt-4">
      <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Bell className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            Enable device notifications
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Get notified about payments, overdue alerts, and agent updates even when the app is in the background.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => pushNotifications.requestPermission()}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200',
              'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            Enable
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
      {pushNotifications.error && (
        <p className="text-xs text-destructive mt-1 ml-12">{pushNotifications.error}</p>
      )}
    </div>
  );
};

export default PushPermissionBanner;
