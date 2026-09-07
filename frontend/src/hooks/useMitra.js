import { useState, useCallback, useRef } from 'react';
import { mitraService } from '../services';
import { useAuthStore } from '../store/authStore';

const MITRA_VERSION = '3.0.0';

const buildPayload = (message, user) => {
  const userId = user?._id || user?.id || 'anonymous';
  return {
    version: MITRA_VERSION,
    input: { message },
    context: {
      platform: 'artha',
      device: 'web',
      session_id: `artha-${userId}-${Date.now()}`,
      voice_input: false,
      preferred_language: 'auto',
      audio_output_requested: false,
      age_gate_status: false,
      user_context: {
        source: 'artha',
        user_id: userId,
        user_name: user?.name || '',
        user_role: user?.role || user?.roles?.[0] || 'viewer',
      },
    },
  };
};

const extractReply = (res) => {
  const d = res.data;
  return (
    d?.reply ||
    d?.message ||
    d?.data?.reply ||
    d?.data?.message ||
    d?.response ||
    d?.data?.response ||
    'No response from Mitra.'
  );
};

const extractConfidence = (res) => {
  return res.data?.confidence ?? res.data?.data?.confidence ?? null;
};

const extractIntent = (res) => {
  return res.data?.intent ?? res.data?.data?.intent ?? null;
};

const extractEntities = (res) => {
  return res.data?.entities ?? res.data?.data?.entities ?? null;
};

const extractCapability = (res) => {
  return res.data?.capability_used ?? res.data?.data?.capability_used ?? null;
};

export const useMitra = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const abortRef = useRef(null);
  const user = useAuthStore((s) => s.user);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return null;

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setError(null);

    try {
      const payload = buildPayload(text.trim(), user);
      const res = await mitraService.chat(payload);

      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: extractReply(res),
        confidence: extractConfidence(res),
        intent: extractIntent(res),
        entities: extractEntities(res),
        capability_used: extractCapability(res),
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setLoading(false);
      return assistantMessage;
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to reach Mitra.';
      setError(errorMessage);

      const fallbackMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: `Sorry, I couldn't process that right now. ${errorMessage}`,
        isError: true,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, fallbackMessage]);
      setLoading(false);
      return fallbackMessage;
    }
  }, [loading, user]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  return {
    messages,
    loading,
    error,
    capabilities,
    sendMessage,
    clearMessages,
    dismissError,
  };
};

export default useMitra;
