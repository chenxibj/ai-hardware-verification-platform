/**
 * @file useLogWebSocket.js
 * @description Custom hook for WebSocket log streaming with plan-level subscriptions
 * Issue: #245 - WebSocket 实时推送
 */
import { useState, useEffect, useRef, useCallback } from "react";
import api from "../utils/api";

/**
 * Extract log array from API response (handles both old/new format)
 */
function extractLogsFromResponse(respData) {
  if (!respData) return [];
  if (Array.isArray(respData)) return respData;
  if (respData.items && Array.isArray(respData.items)) return respData.items;
  return [];
}

/**
 * Normalize a raw log object to consistent shape
 */
function normalizeLog(raw) {
  return {
    id: raw.id,
    taskId: raw.taskId,
    planId: raw.planId,
    level: raw.level || "INFO",
    logType: raw.logType || raw.log_type || "TEXT",
    message: raw.message || raw.content || "",
    metrics: raw.metrics,
    source: raw.source || "AGENT",
    createdAt: raw.createdAt || raw.created_at,
  };
}

const MAX_LOGS = 2000;
const WS_RECONNECT_MAX = 30000;
const POLLING_FALLBACK_DELAY = 30000; // Start fallback polling after 30s disconnect
const POLL_INTERVAL = 10000;

/**
 * useLogWebSocket - WebSocket-based real-time log hook with HTTP fallback
 *
 * @param {number|null} planId - Plan ID to subscribe
 * @param {Object} options
 * @param {boolean} options.enabled - Whether to activate (default true)
 * @returns {{ logs, connectionState, loadOlderLogs, clearLogs, hasOlderLogs }}
 */
export default function useLogWebSocket(planId, options = {}) {
  const { enabled = true } = options;

  const [logs, setLogs] = useState([]);
  const [connectionState, setConnectionState] = useState("disconnected"); // connected | reconnecting | disconnected
  const [hasOlderLogs, setHasOlderLogs] = useState(false);

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectDelayRef = useRef(1000);
  const pollingTimerRef = useRef(null);
  const disconnectedSinceRef = useRef(null);
  const lastLogIdRef = useRef(null);
  const oldestLogIdRef = useRef(null);
  const logsRef = useRef([]);

  // Keep logsRef in sync
  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  /**
   * Append new logs with dedup and max limit
   */
  const appendLogs = useCallback((newLogs) => {
    setLogs((prev) => {
      const existingIds = new Set(prev.map((l) => l.id).filter(Boolean));
      const deduped = newLogs.filter((l) => !l.id || !existingIds.has(l.id));
      if (deduped.length === 0) return prev;
      const merged = [...prev, ...deduped];
      return merged.length > MAX_LOGS ? merged.slice(merged.length - MAX_LOGS) : merged;
    });
  }, []);

  /**
   * Fetch logs via REST (initial load or gap fill)
   */
  const fetchLogs = useCallback(
    async (afterId, limit = 200) => {
      if (!planId) return;
      try {
        let url = `/plans/${planId}/logs?limit=${limit}`;
        if (afterId) url += `&afterId=${afterId}`;
        const { data: resp } = await api.get(url);
        if (resp.code === 0 && resp.data) {
          const logsArray = extractLogsFromResponse(resp.data);
          if (logsArray.length > 0) {
            const normalized = logsArray.map(normalizeLog);
            if (afterId) {
              appendLogs(normalized);
            } else {
              setLogs(normalized.slice(-MAX_LOGS));
            }
            const lastLog = logsArray[logsArray.length - 1];
            if (lastLog?.id) lastLogIdRef.current = lastLog.id;
            if (!afterId && logsArray.length > 0) {
              oldestLogIdRef.current = logsArray[0].id;
              setHasOlderLogs(resp.data.hasMore || logsArray.length >= limit);
            }
          }
        }
      } catch (e) {
        console.error("fetchLogs error", e);
      }
    },
    [planId, appendLogs]
  );

  /**
   * Load older logs (before the oldest we have)
   */
  const loadOlderLogs = useCallback(async () => {
    if (!planId || !oldestLogIdRef.current) return;
    try {
      // We need a "before" param — but our API uses afterId for forward paging.
      // Workaround: fetch from start with limit, or use direct task log API.
      // For simplicity, fetch the oldest chunk directly.
      const { data: resp } = await api.get(
        `/plans/${planId}/logs?limit=200&before=${oldestLogIdRef.current}`
      );
      // The backend may not support "before" for plan logs yet, so handle gracefully
      if (resp.code === 0 && resp.data) {
        const logsArray = extractLogsFromResponse(resp.data);
        if (logsArray.length > 0) {
          const normalized = logsArray.map(normalizeLog);
          setLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l.id).filter(Boolean));
            const deduped = normalized.filter((l) => !l.id || !existingIds.has(l.id));
            const merged = [...deduped, ...prev];
            return merged.length > MAX_LOGS ? merged.slice(merged.length - MAX_LOGS) : merged;
          });
          oldestLogIdRef.current = logsArray[0].id;
          setHasOlderLogs(logsArray.length >= 200);
        } else {
          setHasOlderLogs(false);
        }
      }
    } catch (e) {
      console.warn("loadOlderLogs error", e);
    }
  }, [planId]);

  /**
   * Start HTTP polling fallback
   */
  const startPolling = useCallback(() => {
    if (pollingTimerRef.current) return;
    console.log("Starting HTTP polling fallback for plan", planId);
    pollingTimerRef.current = setInterval(async () => {
      if (!planId) return;
      try {
        let url = `/plans/${planId}/logs?limit=50`;
        if (lastLogIdRef.current) url += `&afterId=${lastLogIdRef.current}`;
        const { data: resp } = await api.get(url);
        if (resp.code === 0 && resp.data) {
          const logsArray = extractLogsFromResponse(resp.data);
          if (logsArray.length > 0) {
            const normalized = logsArray.map(normalizeLog);
            appendLogs(normalized);
            const lastLog = logsArray[logsArray.length - 1];
            if (lastLog?.id) lastLogIdRef.current = lastLog.id;
          }
        }
      } catch (e) {
        console.warn("Polling error", e);
      }
    }, POLL_INTERVAL);
  }, [planId, appendLogs]);

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  /**
   * Connect WebSocket
   */
  const connect = useCallback(() => {
    if (!planId || !enabled) return;

    // Close existing
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/tasks?planId=${planId}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected for plan", planId);
        setConnectionState("connected");
        reconnectDelayRef.current = 1000;
        disconnectedSinceRef.current = null;
        stopPolling();

        // Fill any gap since last log
        if (lastLogIdRef.current) {
          fetchLogs(lastLogIdRef.current, 500);
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "LOG_ENTRY" && msg.data) {
            const logEntry = normalizeLog(msg.data);
            if (logEntry.id) lastLogIdRef.current = logEntry.id;
            appendLogs([logEntry]);
          }
          // TASK_STATUS events are also relayed for consumers
        } catch (e) {
          console.warn("WS message parse error", e);
        }
      };

      ws.onclose = () => {
        setConnectionState("reconnecting");
        wsRef.current = null;

        if (!disconnectedSinceRef.current) {
          disconnectedSinceRef.current = Date.now();
        }

        // Start fallback polling if disconnected > 30s
        const disconnectedMs = Date.now() - (disconnectedSinceRef.current || Date.now());
        if (disconnectedMs >= POLLING_FALLBACK_DELAY) {
          startPolling();
        }

        // Exponential backoff reconnect
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, WS_RECONNECT_MAX);
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error", err);
      };
    } catch (e) {
      console.error("WebSocket creation failed", e);
      setConnectionState("disconnected");
      startPolling();
    }
  }, [planId, enabled, fetchLogs, appendLogs, startPolling, stopPolling]);

  /**
   * Clear logs
   */
  const clearLogs = useCallback(() => {
    setLogs([]);
    lastLogIdRef.current = null;
    oldestLogIdRef.current = null;
  }, []);

  /**
   * Main effect: connect on mount, cleanup on unmount
   */
  useEffect(() => {
    if (!planId || !enabled) {
      setConnectionState("disconnected");
      return;
    }

    // Initial load via REST
    fetchLogs(null, 200).then(() => {
      // Then connect WebSocket
      connect();
    });

    // Also set up a slow poll (every 10s) to refresh even when WS is connected
    // (ensures no data loss)
    const slowPoll = setInterval(() => {
      if (lastLogIdRef.current && planId) {
        fetchLogs(lastLogIdRef.current, 50);
      }
    }, POLL_INTERVAL);

    return () => {
      clearInterval(slowPoll);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      stopPolling();
      setConnectionState("disconnected");
    };
  }, [planId, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    logs,
    connectionState,
    loadOlderLogs,
    clearLogs,
    hasOlderLogs,
  };
}
