const CACHE_NAME = 'artha-notifications-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      self.registration?.backgroundSync?.register('artha-notifications'),
    ]).catch(() => {})
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'ARTHA', body: event.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: '/arthA.png',
    badge: '/arthA.png',
    vibrate: [200, 100, 200],
    tag: data.tag || `artha-${data.type || 'notification'}-${Date.now()}`,
    renotify: true,
    requireInteraction: data.priority === 'urgent' || data.priority === 'high',
    data: {
      url: data.link || data.data?.link || '/dashboard',
      notificationId: data.notificationId || null,
      type: data.type || 'info',
      ...data.data,
    },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'ARTHA', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});

self.addEventListener('notificationclose', (event) => {
  // Track dismissal if needed
});
