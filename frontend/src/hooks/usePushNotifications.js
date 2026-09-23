import { useEffect, useCallback, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../services/api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(user) {
  const [permission, setPermission] = useState(() => {
    if (typeof Notification !== 'undefined') return Notification.permission;
    return 'default';
  });
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('idle');
  const registrationRef = useRef(null);
  const initRunRef = useRef(false);

  useEffect(() => {
    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  const fetchVapidKey = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/push/vapid-key`);
      return res.data?.data?.publicKey || '';
    } catch (err) {
      console.error('[Push] Failed to fetch VAPID key:', err.message);
      return '';
    }
  }, []);

  const registerServiceWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      console.warn('[Push] Service workers not supported');
      return null;
    }
    try {
      setStatus('Registering service worker...');
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      registrationRef.current = reg;
      await navigator.serviceWorker.ready;
      setStatus('Service worker ready');
      console.log('[Push] Service worker registered');
      return reg;
    } catch (err) {
      console.error('[Push] SW registration failed:', err);
      setError('Service worker registration failed: ' + err.message);
      setStatus('SW registration failed');
      return null;
    }
  }, []);

  const sendSubscriptionToBackend = useCallback(async (subscription) => {
    try {
      setStatus('Sending subscription to server...');
      const subJson = subscription.toJSON();
      console.log('[Push] Sending subscription to backend:', subJson.endpoint?.substring(0, 50) + '...');
      await axios.post(`${API_BASE_URL}/push/subscribe`, {
        subscription: subJson,
        userAgent: navigator.userAgent,
      });
      setStatus('Subscription registered on server');
      console.log('[Push] Subscription registered successfully');
      return true;
    } catch (err) {
      console.error('[Push] Failed to register subscription:', err);
      setError('Backend registration failed: ' + err.message);
      setStatus('Backend registration failed');
      initRunRef.current = false;
      return false;
    }
  }, []);

  const subscribeToPush = useCallback(async () => {
    setStatus('Fetching VAPID key...');
    const vapidKey = await fetchVapidKey();
    if (!vapidKey) {
      console.warn('[Push] VAPID public key not available');
      setError('VAPID key not available from server');
      setStatus('No VAPID key');
      initRunRef.current = false;
      return;
    }
    console.log('[Push] VAPID key received');

    try {
      const reg = registrationRef.current || (await navigator.serviceWorker.ready);
      if (!reg) {
        setError('No service worker registration');
        setStatus('No SW registration');
        initRunRef.current = false;
        return;
      }

      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        console.log('[Push] Existing subscription found');
        setIsSubscribed(true);
        setStatus('Existing subscription found, registering...');
        await sendSubscriptionToBackend(sub);
        return;
      }

      console.log('[Push] Creating new push subscription...');
      setStatus('Creating push subscription...');
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      console.log('[Push] Push subscription created');
      setIsSubscribed(true);
      await sendSubscriptionToBackend(sub);
    } catch (err) {
      console.error('[Push] Push subscription failed:', err);
      setError('Push subscription failed: ' + err.message);
      setStatus('Push subscription failed');
      initRunRef.current = false;
    }
  }, [fetchVapidKey, sendSubscriptionToBackend]);

  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      setError('Push notifications not supported in this browser');
      return 'denied';
    }

    try {
      setStatus('Requesting notification permission...');
      const result = await Notification.requestPermission();
      setPermission(result);
      console.log('[Push] Permission result:', result);

      if (result === 'granted') {
        const reg = await registerServiceWorker();
        if (reg) {
          await subscribeToPush();
        }
      } else {
        setError('Notification permission was ' + result);
        setStatus('Permission denied');
      }

      return result;
    } catch (err) {
      console.error('[Push] Permission request failed:', err);
      setError('Permission request failed: ' + err.message);
      return 'denied';
    }
  }, [isSupported, registerServiceWorker, subscribeToPush]);

  const unsubscribe = useCallback(async () => {
    try {
      const reg = registrationRef.current || (await navigator.serviceWorker.ready);
      if (!reg) return;

      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const subJson = sub.toJSON();
        await sub.unsubscribe();
        setIsSubscribed(false);
        try {
          await axios.post(`${API_BASE_URL}/push/unsubscribe`, {
            token: JSON.stringify(subJson),
          });
        } catch {
          // Best effort
        }
      }
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err);
    }
  }, []);

  // Auto-subscribe on mount if user is logged in and permission is already granted.
  // Always re-POST an existing subscription so a failed first attempt recovers.
  useEffect(() => {
    if (!user || !isSupported || initRunRef.current) return;
    initRunRef.current = true;

    const init = async () => {
      const reg = await registerServiceWorker();
      if (!reg) {
        initRunRef.current = false;
        return;
      }

      if (Notification.permission === 'granted') {
        await subscribeToPush();
      } else {
        setStatus('Waiting for notification permission');
      }
    };

    init();
  }, [user, isSupported, registerServiceWorker, subscribeToPush]);

  return {
    permission,
    isSubscribed,
    isSupported,
    error,
    status,
    requestPermission,
    unsubscribe,
  };
}

export default usePushNotifications;
