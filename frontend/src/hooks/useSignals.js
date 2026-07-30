/**
 * useSignals.js
 *
 * Fetches real signals from backend.
 * Returns raw backend shape — no silent mock substitution.
 * Caller decides what to render on failure.
 */

import { useState, useCallback } from 'react';
import api from '../services/api';

export const SIGNAL_SOURCE = {
  LIVE_LIST:    'GET /api/v1/signals',
  LIVE_SNAPSHOT:'GET /api/v1/signals/snapshot',
  EMPTY:        'EMPTY — no signals returned',
  ERROR:        'ERROR — backend unreachable',
};

export function useSignals() {
  const [signals,   setSignals]   = useState([]);
  const [source,    setSource]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [rawPayload, setRawPayload] = useState(null);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get('/signals', { params: { limit: 50 } });
      const list = res.data?.data || [];
      setRawPayload(res.data);

      if (list.length > 0) {
        const seen = new Map();
        list.forEach(sig => {
          const type = sig.type || sig.signal_type;
          if (!seen.has(type)) {
            seen.set(type, sig);
          }
        });
        setSignals(Array.from(seen.values()));
        setSource(SIGNAL_SOURCE.LIVE_LIST);
        setLoading(false);
        return;
      }
    } catch (e) {
      // List endpoint failed — try snapshot
    }

    try {
      const res = await api.get('/signals/snapshot');
      const snap = res.data?.data;
      setRawPayload(res.data);

      if (snap) {
        setSignals([snap]);
        setSource(SIGNAL_SOURCE.LIVE_SNAPSHOT);
        setLoading(false);
        return;
      }
    } catch (e) {
      setError({
        message: e.response?.data?.message || e.message || 'Backend unreachable',
        status:  e.response?.status || 0,
        url:     e.config?.url || '/signals/snapshot',
      });
    }

    setSignals([]);
    setSource(SIGNAL_SOURCE.ERROR);
    setLoading(false);
  }, []);

  return { signals, source, loading, error, rawPayload, fetchSignals };
}
