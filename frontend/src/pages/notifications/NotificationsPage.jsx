import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  ArrowLeft,
  FileText,
  Receipt,
  CreditCard,
  MapPin,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { PageHeader, Card, Button, Loading, EmptyState } from '../../components/common';
import { notificationService } from '../../services/index';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';

const typeIcons = {
  info: FileText,
  success: CheckCheck,
  warning: Settings,
  error: Receipt,
  location: MapPin,
  payment: CreditCard,
  overdue: Bell,
  system: Settings,
  visit: MapPin,
};

const typeColors = {
  info: 'text-blue-500 bg-blue-500/10',
  success: 'text-green-500 bg-green-500/10',
  warning: 'text-amber-500 bg-amber-500/10',
  error: 'text-red-500 bg-red-500/10',
  location: 'text-purple-500 bg-purple-500/10',
  payment: 'text-emerald-500 bg-emerald-500/10',
  overdue: 'text-orange-500 bg-orange-500/10',
  system: 'text-gray-500 bg-gray-500/10',
  visit: 'text-purple-500 bg-purple-500/10',
};

const NotificationsPage = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState('all');

  const fetchNotifications = useCallback(async () => {
    try {
      const [notifRes, countRes] = await Promise.all([
        notificationService.getAll({ limit: 50, unreadOnly: false }),
        notificationService.getUnreadCount(),
      ]);
      const list = Array.isArray(notifRes.data?.notifications)
        ? notifRes.data.notifications
        : Array.isArray(notifRes.data?.data)
        ? notifRes.data.data
        : [];
      setNotifications(list);
      setUnreadCount(countRes.data?.data?.count || countRes.data?.count || 0);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (id) => {
    try {
      await notificationService.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.isRead) {
      await handleMarkRead(notif._id);
    }
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return dateStr;
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.isRead;
    if (filter === 'read') return n.isRead;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
        backUrl="/dashboard"
      >
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button onClick={handleMarkAllRead} variant="secondary" size="sm">
              <CheckCheck className="w-4 h-4 mr-1.5" />
              Mark all read
            </Button>
          )}
          <Button onClick={fetchNotifications} variant="ghost" size="sm">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </PageHeader>

      <div className="flex items-center gap-2">
        {['all', 'unread', 'read'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="You're all caught up!"
        />
      ) : (
        <Card>
          <div className="divide-y divide-border/50">
            {filtered.map((notif) => {
              const Icon = typeIcons[notif.type] || Bell;
              const colorClass = typeColors[notif.type] || 'text-gray-500 bg-gray-500/10';
              return (
                <div
                  key={notif._id}
                  onClick={() => handleNotificationClick(notif)}
                  className={clsx(
                    'flex items-start gap-4 p-4 hover:bg-muted/50 cursor-pointer transition-colors',
                    !notif.isRead && 'bg-primary/5'
                  )}
                >
                  <div className={clsx('w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0', colorClass)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={clsx('text-sm font-medium', notif.isRead ? 'text-muted-foreground' : 'text-foreground')}>
                        {notif.title}
                      </p>
                      {!notif.isRead && (
                        <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                    {notif.body && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className={clsx('text-[10px] font-medium uppercase px-1.5 py-0.5 rounded', colorClass)}>
                        {notif.type || 'info'}
                      </span>
                      {notif.category && (
                        <span className="text-[10px] text-muted-foreground uppercase">{notif.category}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatTime(notif.createdAt)}
                      </span>
                      {notif.link && (
                        <span className="text-[10px] text-primary font-medium">Click to view</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};

export default NotificationsPage;
