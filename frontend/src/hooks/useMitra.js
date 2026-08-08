import { useState, useCallback, useRef } from 'react';
import { mitraService } from '../services';

export const useMitra = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const abortRef = useRef(null);

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
      const res = await mitraService.chat(text.trim());
      const data = res.data?.data;

      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data?.reply || data?.message || 'No response from Mitra.',
        confidence: data?.confidence,
        intent: data?.intent,
        entities: data?.entities,
        capability_used: data?.capability_used,
        role: data?.role,
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
  }, [loading]);

  const analyze = useCallback(async (query) => {
    if (!query.trim()) return null;

    setLoading(true);
    setError(null);

    try {
      const res = await mitraService.analyze(query.trim());
      setLoading(false);
      return res.data?.data;
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Analysis failed.';
      setError(errorMessage);
      setLoading(false);
      return null;
    }
  }, []);

  const getInsights = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await mitraService.getInsights();
      setLoading(false);
      return res.data?.data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to get insights.');
      setLoading(false);
      return null;
    }
  }, []);

  const analyzeStatement = useCallback(async (message, statementId) => {
    if (!message.trim()) return null;

    setLoading(true);
    setError(null);

    try {
      const res = await mitraService.analyzeStatement(message.trim(), statementId);
      const data = res.data?.data;

      const assistantMessage = {
        id: Date.now(),
        role: 'assistant',
        content: data?.reply || 'No analysis available.',
        timestamp: new Date().toISOString(),
        statement_analysis: true,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setLoading(false);
      return data;
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Statement analysis failed.';
      setError(errorMessage);
      setLoading(false);
      return null;
    }
  }, []);

  const fetchCapabilities = useCallback(async () => {
    try {
      const res = await mitraService.getCapabilities();
      setCapabilities(res.data?.data);
      return res.data?.data;
    } catch {
      return null;
    }
  }, []);

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
    analyze,
    getInsights,
    analyzeStatement,
    fetchCapabilities,
    clearMessages,
    dismissError,
  };
};

export default useMitra;
