/**
 * @file PlanMonitor.js
 * @description 执行监控页面 — 资源仪表盘 + 任务列表(含重试/跳过) + 实时日志
 * Issue: #134, #163, #229-#234
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Card, Row, Col, Statistic, Progress, Badge, Tag, Button, Space,
  Collapse, Typography, Tooltip, message, Spin, Popconfirm, Input, Select, Modal,
} from "antd";
import {
  ArrowLeftOutlined, PauseCircleOutlined, PlayCircleOutlined,
  StopOutlined, ReloadOutlined, CheckCircleOutlined,
  ClockCircleOutlined, ExclamationCircleOutlined,
  SyncOutlined, ExperimentOutlined, RobotOutlined,
  ForwardOutlined, DashboardOutlined, SearchOutlined,
  DownloadOutlined, ArrowDownOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text } = Typography;

/* ── 状态颜色映射 ── */
const TASK_STATUS_MAP = {
  COMPLETED: { color: "green",      text: "\u5DF2\u5B8C\u6210", icon: <CheckCircleOutlined /> },
  RUNNING:   { color: "blue",       text: "\u8FD0\u884C\u4E2D", icon: <SyncOutlined spin /> },
  PENDING:   { color: "default",    text: "\u6392\u961F\u4E2D", icon: <ClockCircleOutlined /> },
  QUEUED:    { color: "default",    text: "\u6392\u961F\u4E2D", icon: <ClockCircleOutlined /> },
  FAILED:    { color: "red",        text: "\u5931\u8D25",   icon: <ExclamationCircleOutlined /> },
  PAUSED:    { color: "orange",     text: "\u5DF2\u6682\u505C", icon: <PauseCircleOutlined /> },
  CANCELLED: { color: "default",    text: "\u5DF2\u53D6\u6D88", icon: <StopOutlined /> },
  SKIPPED:   { color: "gold",       text: "\u5DF2\u8DF3\u8FC7", icon: <ForwardOutlined /> },
};

const PLAN_STATUS_MAP = {
  DRAFT:     { text: "\u8349\u7A3F",   badge: "default" },
  RUNNING:   { text: "\u8FD0\u884C\u4E2D", badge: "processing" },
  PAUSED:    { text: "\u5DF2\u6682\u505C", badge: "warning" },
  COMPLETED: { text: "\u5DF2\u5B8C\u6210", badge: "success" },
  FAILED:    { text: "\u5931\u8D25",   badge: "error" },
  CANCELLED: { text: "\u5DF2\u53D6\u6D88", badge: "default" },
};

const SUBJECT_ICONS = {
  OPERATOR: <ExperimentOutlined />,
  MODEL: <RobotOutlined />,
};

const SUBJECT_LABELS = {
  OPERATOR: "\u7B97\u5B50\u8BC4\u6D4B",
  MODEL: "\u6A21\u578B\u63A8\u7406",
};

/* ── 计算耗时 ── */
function formatDuration(startedAt, completedAt) {
  if (!startedAt) return "-";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const sec = Math.floor((end - start) / 1000);
  if (sec < 60) return sec + "s";
  if (sec < 3600) return Math.floor(sec / 60) + "m " + (sec % 60) + "s";
  return Math.floor(sec / 3600) + "h " + Math.floor((sec % 3600) / 60) + "m";
}

/* ── 模拟资源数据 ── */
function simulateResource(tasks) {
  const running = tasks.filter(t => t.status === "RUNNING").length;
  return {
    cpu: Math.min(95, 15 + running * 18 + Math.floor(Math.random() * 8)),
    memory: Math.min(90, 30 + running * 12 + Math.floor(Math.random() * 6)),
  };
}

/* ── 格式化时间戳 ── */
function formatTimestamp(ts) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("zh-CN", { hour12: false });
  } catch (e) {
    return String(ts).substring(11, 19);
  }
}

/* ── 尝试解析 metrics JSON ── */
function parseMetrics(metricsStr) {
  if (!metricsStr) return null;
  if (typeof metricsStr === "object") return metricsStr;
  try {
    return JSON.parse(metricsStr);
  } catch (e) {
    return null;
  }
}

/**
 * 从 API 响应中提取日志数组
 * 兼容旧格式 (data = [...]) 和新格式 (data = { items: [...], hasMore, nextCursor })
 */
function extractLogsFromResponse(respData) {
  if (!respData) return [];
  if (Array.isArray(respData)) return respData;
  if (respData.items && Array.isArray(respData.items)) return respData.items;
  return [];
}

export default function PlanMonitor({ planId, onBack }) {
  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState("all");
  const [logSearch, setLogSearch] = useState("");
  const [logLevelFilter, setLogLevelFilter] = useState("ALL");
  const [logTypeFilter, setLogTypeFilter] = useState("ALL");
  const [resource, setResource] = useState({ cpu: 0, memory: 0 });
  const [wsConnected, setWsConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [hasNewLogs, setHasNewLogs] = useState(false);
  const prevTasksRef = useRef({});
  const timerRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectDelayRef = useRef(1000);
  const pollingTimerRef = useRef(null);
  const lastLogIdRef = useRef(null);
  const logContainerRef = useRef(null);
  const logsRef = useRef([]);

  // Keep logsRef in sync
  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  /* ── 获取任务信息 ── */
  const fetchPlan = useCallback(async () => {
    try {
      const { data: resp } = await api.get("/plans/" + planId);
      if (resp.code === 0) setPlan(resp.data);
    } catch (e) {
      console.error("fetchPlan error", e);
    }
  }, [planId]);

  /* ── 获取任务列表 ── */
  const fetchTasks = useCallback(async () => {
    try {
      const { data: resp } = await api.get("/plans/" + planId + "/tasks");
      if (resp.code === 0) {
        const newTasks = resp.data || [];
        const map = {};
        newTasks.forEach((t) => { map[t.id] = t.status; });
        prevTasksRef.current = map;
        setTasks(newTasks);
        setResource(simulateResource(newTasks));
      }
    } catch (e) {
      console.error("fetchTasks error", e);
    }
  }, [planId]);

  /* ── 加载历史日志 (REST API) — 兼容游标分页 ── */
  const fetchLogs = useCallback(async (afterId) => {
    try {
      let url = "/tasks/" + getActiveTaskId() + "/logs?limit=500";
      if (afterId) url += "&afterId=" + afterId;
      const { data: resp } = await api.get(url);
      if (resp.code === 0 && resp.data) {
        const logsArray = extractLogsFromResponse(resp.data);
        if (logsArray.length > 0) {
          const newLogs = logsArray.map(normalizeLog);
          if (afterId) {
            setLogs(prev => {
              const merged = [...prev, ...newLogs];
              return merged.slice(-1000);
            });
          } else {
            setLogs(newLogs.slice(-1000));
          }
          const lastLog = logsArray[logsArray.length - 1];
          if (lastLog && lastLog.id) {
            lastLogIdRef.current = lastLog.id;
          }
        }
      }
    } catch (e) {
      console.error("fetchLogs error", e);
    }
  }, []);

  /* ── 获取当前活跃的任务 ID (用于日志) ── */
  function getActiveTaskId() {
    // If filtering a specific task, use that
    if (logFilter !== "all") return logFilter;
    // Otherwise use the first RUNNING task, or the first task
    const running = tasks.find(t => t.status === "RUNNING");
    if (running) return running.id;
    return tasks.length > 0 ? tasks[0].id : null;
  }

  /* ── 规范化日志对象 ── */
  function normalizeLog(raw) {
    return {
      id: raw.id,
      taskId: raw.taskId,
      level: raw.level || "INFO",
      logType: raw.logType || raw.log_type || "TEXT",
      message: raw.message || raw.content || "",
      metrics: raw.metrics,
      source: raw.source || "AGENT",
      createdAt: raw.createdAt || raw.created_at,
    };
  }

  /* ── WebSocket 连接管理 ── */
  const connectWebSocket = useCallback((taskId) => {
    if (!taskId) return;
    // Close existing
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = protocol + "//" + host + "/ws/tasks?taskId=" + taskId;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected for task", taskId);
        setWsConnected(true);
        reconnectDelayRef.current = 1000; // reset backoff
        // Stop polling fallback if active
        if (pollingTimerRef.current) {
          clearInterval(pollingTimerRef.current);
          pollingTimerRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "LOG_ENTRY" && msg.data) {
            const logEntry = normalizeLog(msg.data);
            if (logEntry.id) lastLogIdRef.current = logEntry.id;
            setLogs(prev => [...prev, logEntry].slice(-1000));
            if (!autoScroll) setHasNewLogs(true);
          } else if (msg.type === "TASK_STATUS" && msg.data) {
            // Refresh task list on status change
            fetchTasks();
            fetchPlan();
          }
        } catch (e) {
          console.warn("WS message parse error", e);
        }
      };

      ws.onclose = (event) => {
        console.log("WebSocket closed", event.code, event.reason);
        setWsConnected(false);
        wsRef.current = null;
        // Start fallback polling
        startPollingFallback(taskId);
        // Attempt reconnect with exponential backoff
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, 30000);
        reconnectTimerRef.current = setTimeout(() => {
          // Only reconnect if there are RUNNING tasks
          const hasRunning = tasks.some(t => t.status === "RUNNING");
          if (hasRunning) {
            connectWebSocket(taskId);
          }
        }, delay);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error", err);
        // onclose will handle reconnection
      };
    } catch (e) {
      console.error("WebSocket creation failed", e);
      startPollingFallback(taskId);
    }
  }, [autoScroll, tasks, fetchTasks, fetchPlan]);

  /* ── HTTP 轮询 fallback — 兼容游标分页 ── */
  const startPollingFallback = useCallback((taskId) => {
    if (pollingTimerRef.current) return; // already polling
    console.log("Starting HTTP polling fallback for task", taskId);
    pollingTimerRef.current = setInterval(async () => {
      try {
        let url = "/tasks/" + taskId + "/logs?limit=50";
        if (lastLogIdRef.current) url += "&afterId=" + lastLogIdRef.current;
        const { data: resp } = await api.get(url);
        if (resp.code === 0 && resp.data) {
          const logsArray = extractLogsFromResponse(resp.data);
          if (logsArray.length > 0) {
            const newLogs = logsArray.map(normalizeLog);
            const lastLog = logsArray[logsArray.length - 1];
            if (lastLog && lastLog.id) lastLogIdRef.current = lastLog.id;
            setLogs(prev => [...prev, ...newLogs].slice(-1000));
            if (!autoScroll) setHasNewLogs(true);
          }
        }
      } catch (e) {
        console.warn("Polling error", e);
      }
    }, 2000);
  }, [autoScroll]);

  /* ── 首次加载 + 轮询 ── */
  useEffect(() => {
    setLoading(true);
    startTimeRef.current = Date.now();
    Promise.all([fetchPlan(), fetchTasks()]).finally(() => setLoading(false));
    timerRef.current = setInterval(() => {
      fetchPlan();
      fetchTasks();
    }, 10000);
    return () => {
      clearInterval(timerRef.current);
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [fetchPlan, fetchTasks]);

  /* ── WebSocket / 日志加载逻辑 ── */
  useEffect(() => {
    if (tasks.length === 0) return;
    const hasRunning = tasks.some(t => t.status === "RUNNING");
    const taskId = getActiveTaskId();

    if (hasRunning && taskId) {
      // Load existing logs first, then connect WS
      fetchLogs(null).then(() => {
        connectWebSocket(taskId);
      });
    } else if (taskId) {
      // Task not running — load full logs via REST
      fetchLogs(null);
      // Clean up WS
      if (wsRef.current) wsRef.current.close();
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    }
  }, [tasks.length > 0 && tasks.some(t => t.status === "RUNNING"), logFilter]);

  /* ── 自动滚动 ── */
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleLogScroll = useCallback((e) => {
    const el = e.target;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    if (!atBottom && autoScroll) {
      setAutoScroll(false);
    } else if (atBottom && !autoScroll) {
      setAutoScroll(true);
      setHasNewLogs(false);
    }
  }, [autoScroll]);

  const scrollToBottom = useCallback(() => {
    setAutoScroll(true);
    setHasNewLogs(false);
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, []);

  /* ── 操作 ── */
  const PLAN_ACTION_CONFIRM = {
    pause:  { title: "\u786E\u8BA4\u6682\u505C", content: "\u6682\u505C\u540E\u6B63\u5728\u8FD0\u884C\u7684\u4EFB\u52A1\u5C06\u7EE7\u7EED\u5B8C\u6210\uFF0C\u65B0\u4EFB\u52A1\u4E0D\u518D\u542F\u52A8\u3002", okText: "\u786E\u8BA4\u6682\u505C" },
    resume: { title: "\u786E\u8BA4\u6062\u590D", content: "\u6062\u590D\u540E\u5C06\u7EE7\u7EED\u6267\u884C\u6392\u961F\u4E2D\u7684\u4EFB\u52A1\u3002", okText: "\u786E\u8BA4\u6062\u590D" },
    start:  { title: "\u786E\u8BA4\u542F\u52A8", content: "\u542F\u52A8\u540E\u5C06\u5F00\u59CB\u6267\u884C\u8BC4\u6D4B\u4EFB\u52A1\u3002", okText: "\u786E\u8BA4\u542F\u52A8" },
    cancel: { title: "\u786E\u8BA4\u53D6\u6D88", content: "\u53D6\u6D88\u540E\u8BE5\u4EFB\u52A1\u5C06\u505C\u6B62\u6267\u884C\uFF0C\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1\u7ED3\u679C\u4FDD\u7559\u3002\u786E\u8BA4\u53D6\u6D88\uFF1F", okText: "\u786E\u8BA4\u53D6\u6D88", okType: "danger" },
  };

  const handlePlanAction = (action, label) => {
    const confirmCfg = PLAN_ACTION_CONFIRM[action] || { title: "\u786E\u8BA4" + label, content: "\u786E\u5B9A\u8981" + label + "\u8BE5\u4EFB\u52A1\u5417\uFF1F", okText: "\u786E\u8BA4" };
    Modal.confirm({
      title: confirmCfg.title,
      content: confirmCfg.content,
      okText: confirmCfg.okText || "\u786E\u8BA4",
      okType: confirmCfg.okType || "primary",
      cancelText: "\u8FD4\u56DE",
      onOk: async () => {
        try {
          await api.put("/plans/" + planId + "/" + action);
          message.success(label + "\u6210\u529F");
          fetchPlan();
          fetchTasks();
        } catch (e) {
          message.error(label + "\u5931\u8D25: " + (e.response?.data?.message || e.message));
        }
      },
    });
  };

  const handleRetryTask = (taskId) => {
    Modal.confirm({
      title: "\u786E\u8BA4\u91CD\u8BD5",
      content: "\u5C06\u91CD\u65B0\u6267\u884C\u8BE5\u5931\u8D25\u4EFB\u52A1\uFF0C\u662F\u5426\u7EE7\u7EED\uFF1F",
      okText: "\u786E\u8BA4\u91CD\u8BD5",
      cancelText: "\u8FD4\u56DE",
      onOk: async () => {
        try {
          await api.post("/tasks/" + taskId + "/retry");
          message.success("\u91CD\u8BD5\u5DF2\u63D0\u4EA4");
          fetchTasks();
        } catch (e) {
          message.error("\u91CD\u8BD5\u5931\u8D25: " + (e.response?.data?.message || e.message));
        }
      },
    });
  };

  const handleRetryAllFailed = () => {
    const failedTasks = tasks.filter(t => t.status === "FAILED");
    if (failedTasks.length === 0) {
      message.info("\u6CA1\u6709\u5931\u8D25\u7684\u4EFB\u52A1\u9700\u8981\u91CD\u8BD5");
      return;
    }
    Modal.confirm({
      title: "\u786E\u8BA4\u91CD\u8BD5\u5168\u90E8\u5931\u8D25\u4EFB\u52A1",
      content: "\u5C06\u91CD\u8BD5 " + failedTasks.length + " \u4E2A\u5931\u8D25\u4EFB\u52A1\uFF0C\u662F\u5426\u7EE7\u7EED\uFF1F",
      okText: "\u786E\u8BA4\u91CD\u8BD5",
      cancelText: "\u8FD4\u56DE",
      onOk: async () => {
        try {
          await Promise.all(failedTasks.map(t => api.post("/tasks/" + t.id + "/retry")));
          message.success("\u5DF2\u63D0\u4EA4 " + failedTasks.length + " \u4E2A\u91CD\u8BD5\u4EFB\u52A1");
          fetchTasks();
        } catch (e) {
          message.error("\u90E8\u5206\u91CD\u8BD5\u5931\u8D25");
          fetchTasks();
        }
      },
    });
  };

  const handleSkipTask = async (taskId) => {
    try {
      await api.post("/tasks/" + taskId + "/skip");
      message.success("\u5DF2\u8DF3\u8FC7\u8BE5\u4EFB\u52A1");
      fetchTasks();
      fetchPlan();
    } catch (e) {
      message.error("\u8DF3\u8FC7\u5931\u8D25: " + (e.response?.data?.message || e.message));
    }
  };

  /* ── 统计 ── */
  const statCounts = {
    completed: tasks.filter((t) => t.status === "COMPLETED").length,
    running:   tasks.filter((t) => t.status === "RUNNING").length,
    pending:   tasks.filter((t) => ["PENDING", "QUEUED"].includes(t.status)).length,
    failed:    tasks.filter((t) => t.status === "FAILED").length,
    skipped:   tasks.filter((t) => t.status === "SKIPPED").length,
  };

  const progressPercent = plan && plan.totalTasks > 0
    ? Math.round(((statCounts.completed + statCounts.skipped) / plan.totalTasks) * 100)
    : 0;

  const progressStatus = plan
    ? plan.status === "COMPLETED" ? "success"
    : plan.status === "FAILED" ? "exception"
    : statCounts.running > 0 ? "active" : "normal"
    : "normal";

  const elapsed = Date.now() - startTimeRef.current;
  const elapsedStr = formatDuration(new Date(startTimeRef.current).toISOString(), null);
  const done = statCounts.completed + statCounts.skipped + statCounts.failed;
  const remaining = tasks.length > 0 && done > 0 && done < tasks.length
    ? Math.round((elapsed / done) * (tasks.length - done) / 1000) : 0;
  const remainStr = remaining > 0
    ? remaining < 60 ? "~" + remaining + "s"
    : remaining < 3600 ? "~" + Math.floor(remaining / 60) + "m"
    : "~" + Math.floor(remaining / 3600) + "h " + Math.floor((remaining % 3600) / 60) + "m"
    : plan?.status === "COMPLETED" ? "\u5DF2\u5B8C\u6210" : "-";

  /* ── 按 testSubject 分组 ── */
  const grouped = {};
  tasks.forEach((t) => {
    const key = t.testSubject || "OTHER";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  /* ── 日志过滤 (#234: 级别 + 类型 + 任务 + 关键字) ── */
  const filteredLogs = logs.filter(log => {
    if (logFilter !== "all" && String(log.taskId) !== String(logFilter)) return false;
    if (logLevelFilter !== "ALL" && (log.level || "INFO").toUpperCase() !== logLevelFilter) return false;
    if (logTypeFilter !== "ALL" && (log.logType || "TEXT").toUpperCase() !== logTypeFilter) return false;
    if (logSearch && !(log.message || "").toLowerCase().includes(logSearch.toLowerCase())) return false;
    return true;
  });

  /* ── 渲染单条日志 (#233: 增强 METRIC 渲染) ── */
  const renderLogEntry = (log, i) => {
    const level = (log.level || "INFO").toUpperCase();
    const logType = (log.logType || "TEXT").toUpperCase();
    const metrics = parseMetrics(log.metrics);

    // Style by level
    let style = {
      padding: "4px 8px",
      lineHeight: 1.6,
      borderLeft: "3px solid transparent",
      fontFamily: "'JetBrains Mono', Consolas, Monaco, 'Courier New', monospace",
      fontSize: 12,
    };
    if (level === "ERROR") {
      style.background = "#fff2f0";
      style.borderLeftColor = "#ff4d4f";
      style.color = "#cf1322";
    } else if (level === "WARN") {
      style.background = "#fff7e6";
      style.borderLeftColor = "#fa8c16";
      style.color = "#ad6800";
    } else {
      style.color = "#333";
    }

    const levelColor = level === "ERROR" ? "#ff4d4f"
      : level === "WARN" ? "#fa8c16"
      : level === "DEBUG" ? "#999" : "#1890ff";

    const typeColor = logType === "METRIC" ? "#722ed1"
      : logType === "PROGRESS" ? "#13c2c2"
      : logType === "SYSTEM" ? "#52c41a"
      : logType === "ERROR" ? "#ff4d4f" : "#999";

    // Extract progress info for PROGRESS type
    let progressValue = null;
    if (logType === "PROGRESS") {
      const pctMatch = (log.message || "").match(/(\d+(?:\.\d+)?)%/);
      const fracMatch = (log.message || "").match(/(\d+)\s*\/\s*(\d+)/);
      if (pctMatch) {
        progressValue = parseFloat(pctMatch[1]);
      } else if (fracMatch) {
        progressValue = Math.round((parseInt(fracMatch[1]) / parseInt(fracMatch[2])) * 100);
      }
    }

    return (
      <div key={log.id || i} style={style}>
        <span style={{ color: "#999" }}>{formatTimestamp(log.createdAt)}</span>
        {" "}
        <span style={{ color: levelColor, fontWeight: 600 }}>{"[" + level + "]"}</span>
        {" "}
        {logType !== "TEXT" && (
          <span style={{ color: typeColor }}>{"[" + logType + "]"}{" "}</span>
        )}
        <span>{log.message}</span>

        {/* #233 P1-3: METRIC 性能指标增强渲染 */}
        {logType === "METRIC" && metrics && (
          <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap", marginLeft: 16 }}>
            {metrics.latency_ms_p50 != null && <Tag color="blue">{"P50: " + metrics.latency_ms_p50 + "ms"}</Tag>}
            {metrics.latency_ms_p95 != null && <Tag color="orange">{"P95: " + metrics.latency_ms_p95 + "ms"}</Tag>}
            {metrics.latency_ms_p99 != null && <Tag color="red">{"P99: " + metrics.latency_ms_p99 + "ms"}</Tag>}
            {metrics.throughput_qps != null && <Tag color="green">{"QPS: " + metrics.throughput_qps}</Tag>}
            {metrics.cpu_util_percent != null && <Tag color="purple">{"CPU: " + metrics.cpu_util_percent + "%"}</Tag>}
            {metrics.memory_util_percent != null && <Tag color="cyan">{"MEM: " + metrics.memory_util_percent + "%"}</Tag>}
            {metrics.status && <Tag color={metrics.status === "PASS" ? "success" : "error"}>{metrics.status}</Tag>}
            {/* Fallback: show all other numeric metrics */}
            {Object.entries(metrics)
              .filter(([k]) => !["latency_ms_p50", "latency_ms_p95", "latency_ms_p99", "throughput_qps",
                                  "cpu_util_percent", "memory_util_percent", "status"].includes(k))
              .map(([k, v]) => (
                <Tag key={k} color="default" style={{ marginBottom: 2 }}>
                  {k + ": " + (typeof v === "number" ? v.toFixed(2) : String(v))}
                </Tag>
              ))
            }
          </div>
        )}

        {/* PROGRESS: show progress bar */}
        {logType === "PROGRESS" && progressValue !== null && (
          <div style={{ marginTop: 4, marginLeft: 16, maxWidth: 300 }}>
            <Progress percent={progressValue} size="small" status="active" />
          </div>
        )}
      </div>
    );
  };

  /* ── 渲染任务行 ── */
  const renderTaskRow = (task) => {
    const st = TASK_STATUS_MAP[task.status] || { color: "default", text: task.status };
    return (
      <div key={task.id} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: "1px solid #f0f0f0",
      }}>
        <Space style={{ flex: 1 }}>
          <Text style={{ width: 200, display: "inline-block" }}>{task.testItem || task.name}</Text>
          <Tag color={st.color} icon={st.icon}>{st.text}</Tag>
        </Space>
        <Space>
          {task.progress !== undefined && task.progress > 0 && task.status === "RUNNING" && (
            <Text type="secondary" style={{ fontSize: 12 }}>{task.progress}%</Text>
          )}
          <Text type="secondary" style={{ fontSize: 12, width: 80, textAlign: "right" }}>
            {formatDuration(task.startedAt, task.completedAt)}
          </Text>
          {task.status === "FAILED" && (
            <Space size={4}>
              <Tooltip title={task.errorMessage || "\u6267\u884C\u5931\u8D25\uFF0C\u65E0\u8BE6\u7EC6\u9519\u8BEF\u4FE1\u606F"}>
                <ExclamationCircleOutlined style={{ color: "#ff4d4f", cursor: "pointer" }} />
              </Tooltip>
              <Popconfirm title={"\u786E\u5B9A\u91CD\u8BD5\u8BE5\u4EFB\u52A1\uFF1F"} onConfirm={() => handleRetryTask(task.id)}>
                <Button type="link" size="small" icon={<ReloadOutlined />}>
                  {"\u91CD\u8BD5"}
                </Button>
              </Popconfirm>
              <Popconfirm title={"\u786E\u5B9A\u8DF3\u8FC7\u8BE5\u4EFB\u52A1\uFF1F\u8DF3\u8FC7\u540E\u4E0D\u4F1A\u518D\u6267\u884C"} onConfirm={() => handleSkipTask(task.id)}>
                <Button type="link" size="small" icon={<ForwardOutlined />} style={{ color: "#faad14" }}>
                  {"\u8DF3\u8FC7"}
                </Button>
              </Popconfirm>
            </Space>
          )}
        </Space>
      </div>
    );
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" tip={"\u52A0\u8F7D\u4E2D..."} /></div>;
  }

  const planStatus = plan ? (PLAN_STATUS_MAP[plan.status] || { text: plan.status, badge: "default" }) : {};

  return (
    <div>
      {/* 返回按钮 */}
      <Button type="link" icon={<ArrowLeftOutlined />} onClick={onBack}
        style={{ marginBottom: 12, paddingLeft: 0 }}>
        {"\u8FD4\u56DE\u4EFB\u52A1\u5217\u8868"}
      </Button>

      {/* ── 顶部: 资源仪表盘 ── */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={24} align="middle">
          <Col xs={24} md={5} style={{ textAlign: "center" }}>
            <DashboardOutlined style={{ fontSize: 18, color: "#1890ff", marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"CPU \u4F7F\u7528\u7387"}</div>
            <Progress
              type="circle"
              percent={resource.cpu}
              size={80}
              strokeColor={resource.cpu > 80 ? "#ff4d4f" : resource.cpu > 60 ? "#faad14" : "#52c41a"}
              format={p => <span style={{ fontSize: 16, fontWeight: "bold" }}>{p}%</span>}
            />
          </Col>
          <Col xs={24} md={5} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"\u5185\u5B58\u4F7F\u7528\u7387"}</div>
            <Progress
              type="circle"
              percent={resource.memory}
              size={80}
              strokeColor={resource.memory > 80 ? "#ff4d4f" : resource.memory > 60 ? "#faad14" : "#1890ff"}
              format={p => <span style={{ fontSize: 16, fontWeight: "bold" }}>{p}%</span>}
            />
          </Col>
          <Col xs={12} md={4}>
            <Statistic title={"\u5DF2\u8017\u65F6"} value={elapsedStr} valueStyle={{ fontSize: 18 }} />
          </Col>
          <Col xs={12} md={4}>
            <Statistic title={"\u9884\u4F30\u5269\u4F59"} value={remainStr} valueStyle={{ fontSize: 18, color: "#1890ff" }} />
          </Col>
          <Col xs={12} md={3}>
            <Statistic title={"\u4EFB\u52A1\u8FDB\u5EA6"}
              value={(statCounts.completed + statCounts.skipped) + "/" + (plan?.totalTasks || tasks.length)}
              valueStyle={{ fontSize: 18 }} />
          </Col>
          <Col xs={12} md={3}>
            <Statistic title={"\u5931\u8D25/\u8DF3\u8FC7"}
              value={statCounts.failed + "/" + statCounts.skipped}
              valueStyle={{ fontSize: 18, color: statCounts.failed > 0 ? "#ff4d4f" : "#999" }} />
          </Col>
        </Row>
      </Card>

      {/* ── 任务信息 + 整体进度 ── */}
      <Card style={{ marginBottom: 16 }}>
        <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
          <Col>
            <Space size="middle">
              <Title level={4} style={{ margin: 0 }}>{plan?.name || "-"}</Title>
              <Badge status={planStatus.badge} text={planStatus.text} />
              <Text type="secondary">{"\u82AF\u7247 #" + (plan?.chipId || "")}</Text>
            </Space>
          </Col>
          <Col>
            <Space>
              {plan?.status === "RUNNING" && (
                <Popconfirm title={"\u786E\u5B9A\u8981\u6682\u505C\u8BC4\u6D4B\uFF1F\u6682\u505C\u540E\u53EF\u6062\u590D\u7EE7\u7EED\u6267\u884C"} onConfirm={() => handlePlanAction("pause", "\u6682\u505C")}>
                  <Button icon={<PauseCircleOutlined />}>
                    {"\u6682\u505C"}
                  </Button>
                </Popconfirm>
              )}
              {plan?.status === "PAUSED" && (
                <Button type="primary" icon={<PlayCircleOutlined />}
                  onClick={() => handlePlanAction("resume", "\u6062\u590D")}>
                  {"\u6062\u590D"}
                </Button>
              )}
              {plan?.status === "DRAFT" && (
                <Button type="primary" icon={<PlayCircleOutlined />}
                  onClick={() => handlePlanAction("start", "\u542F\u52A8")}>
                  {"\u542F\u52A8\u6267\u884C"}
                </Button>
              )}
              {(plan?.status === "RUNNING" || plan?.status === "PAUSED") && (
                <Button danger icon={<StopOutlined />}
                  onClick={() => handlePlanAction("cancel", "\u53D6\u6D88")}>{"\u53D6\u6D88"}</Button>
              )}
              <Tooltip title={"\u624B\u52A8\u5237\u65B0"}>
                <Button icon={<ReloadOutlined />} onClick={() => { fetchPlan(); fetchTasks(); }} />
              </Tooltip>
            </Space>
          </Col>
        </Row>

        <Progress percent={progressPercent} status={progressStatus}
          format={() => (statCounts.completed + statCounts.skipped) + "/" + (plan?.totalTasks || tasks.length)}
          style={{ marginBottom: 16 }} />

        <Row gutter={24}>
          <Col xs={12} sm={5}>
            <Statistic title={"\u5DF2\u5B8C\u6210"} value={statCounts.completed}
              valueStyle={{ color: "#52c41a" }}
              prefix={<CheckCircleOutlined />} />
          </Col>
          <Col xs={12} sm={5}>
            <Statistic title={"\u8FD0\u884C\u4E2D"} value={statCounts.running}
              valueStyle={{ color: "#1890ff" }}
              prefix={<SyncOutlined />} />
          </Col>
          <Col xs={12} sm={5}>
            <Statistic title={"\u6392\u961F\u4E2D"} value={statCounts.pending}
              prefix={<ClockCircleOutlined />} />
          </Col>
          <Col xs={12} sm={5}>
            <Statistic title={"\u5931\u8D25"} value={statCounts.failed}
              valueStyle={{ color: "#ff4d4f" }}
              prefix={<ExclamationCircleOutlined />} />
          </Col>
          <Col xs={12} sm={4}>
            <Statistic title={"\u5DF2\u8DF3\u8FC7"} value={statCounts.skipped}
              valueStyle={{ color: "#faad14" }}
              prefix={<ForwardOutlined />} />
          </Col>
        </Row>
      </Card>

      {/* ── 中部：分组任务列表 ── */}
      <Card title={"\u4EFB\u52A1\u5217\u8868"} style={{ marginBottom: 16 }}>
        {Object.keys(grouped).length === 0 ? (
          <Text type="secondary">{"\u6682\u65E0\u4EFB\u52A1"}</Text>
        ) : (
          <Collapse defaultActiveKey={Object.keys(grouped)} ghost>
            {Object.entries(grouped).map(([subject, subjectTasks]) => {
              const completed = subjectTasks.filter((t) => t.status === "COMPLETED").length;
              const failed = subjectTasks.filter((t) => t.status === "FAILED").length;
              const running = subjectTasks.filter((t) => t.status === "RUNNING").length;
              const skipped = subjectTasks.filter((t) => t.status === "SKIPPED").length;
              return (
                <Collapse.Panel
                  key={subject}
                  header={
                    <Space>
                      {SUBJECT_ICONS[subject] || <ExperimentOutlined />}
                      <Text strong>{SUBJECT_LABELS[subject] || subject}</Text>
                      <Text type="secondary">{"(" + subjectTasks.length + " \u9879)"}</Text>
                      {completed > 0 && <Tag color="green">{completed + " \u5B8C\u6210"}</Tag>}
                      {running > 0 && <Tag color="blue">{running + " \u8FD0\u884C\u4E2D"}</Tag>}
                      {failed > 0 && <Tag color="red">{failed + " \u5931\u8D25"}</Tag>}
                      {skipped > 0 && <Tag color="gold">{skipped + " \u8DF3\u8FC7"}</Tag>}
                    </Space>
                  }
                >
                  {subjectTasks.map(renderTaskRow)}
                </Collapse.Panel>
              );
            })}
          </Collapse>
        )}
      </Card>

      {/* ── 底部：实时日志面板 (#229, #233, #234) ── */}
      <Card
        title={
          <Space>
            <span>{"\u5B9E\u65F6\u6267\u884C\u65E5\u5FD7"}</span>
            {wsConnected ? (
              <Tag color="green" style={{ fontSize: 11 }}>{"WebSocket \u5DF2\u8FDE\u63A5"}</Tag>
            ) : tasks.some(t => t.status === "RUNNING") ? (
              <Tag color="orange" style={{ fontSize: 11 }}>{"HTTP \u8F6E\u8BE2\u4E2D"}</Tag>
            ) : null}
          </Space>
        }
        size="small"
        extra={
          <Space wrap>
            {/* #234: 任务过滤 */}
            <Select
              value={logFilter}
              onChange={(v) => { setLogFilter(v); setLogs([]); lastLogIdRef.current = null; }}
              style={{ width: 160 }}
              size="small"
            >
              <Select.Option value="all">{"\u5168\u90E8\u4EFB\u52A1"}</Select.Option>
              {tasks.map(t => (
                <Select.Option key={t.id} value={String(t.id)}>
                  {t.testItem || t.name}
                </Select.Option>
              ))}
            </Select>
            {/* #234: 级别过滤 */}
            <Select
              value={logLevelFilter}
              onChange={setLogLevelFilter}
              style={{ width: 100 }}
              size="small"
            >
              <Select.Option value="ALL">{"\u5168\u90E8\u7EA7\u522B"}</Select.Option>
              <Select.Option value="INFO">INFO</Select.Option>
              <Select.Option value="WARN">WARN</Select.Option>
              <Select.Option value="ERROR">ERROR</Select.Option>
              <Select.Option value="DEBUG">DEBUG</Select.Option>
            </Select>
            {/* #234: 类型过滤 */}
            <Select
              value={logTypeFilter}
              onChange={setLogTypeFilter}
              style={{ width: 120 }}
              size="small"
            >
              <Select.Option value="ALL">{"\u5168\u90E8\u7C7B\u578B"}</Select.Option>
              <Select.Option value="TEXT">TEXT</Select.Option>
              <Select.Option value="METRIC">METRIC</Select.Option>
              <Select.Option value="PROGRESS">PROGRESS</Select.Option>
              <Select.Option value="ERROR">ERROR</Select.Option>
              <Select.Option value="SYSTEM">SYSTEM</Select.Option>
            </Select>
            {/* #234: 关键字搜索 */}
            <Input
              placeholder={"\u641C\u7D22\u65E5\u5FD7..."}
              prefix={<SearchOutlined />}
              value={logSearch}
              onChange={e => setLogSearch(e.target.value)}
              style={{ width: 160 }}
              size="small"
              allowClear
            />
          </Space>
        }
      >
        <div
          ref={logContainerRef}
          onScroll={handleLogScroll}
          style={{
            background: "#fafafa",
            border: "1px solid #e8e8e8",
            borderRadius: 6,
            maxHeight: 400,
            overflowY: "auto",
            minHeight: 80,
            position: "relative",
          }}
        >
          {filteredLogs.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#999" }}>
              {tasks.some(t => t.status === "RUNNING")
                ? "\u7B49\u5F85\u4EFB\u52A1\u6267\u884C\u65E5\u5FD7..."
                : "\u6682\u65E0\u65E5\u5FD7\u8BB0\u5F55"}
            </div>
          ) : (
            filteredLogs.map(renderLogEntry)
          )}
        </div>
        {/* 新日志提示按钮 */}
        {hasNewLogs && !autoScroll && (
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <Button
              type="primary"
              size="small"
              icon={<ArrowDownOutlined />}
              onClick={scrollToBottom}
            >
              {"\u2193 \u6709\u65B0\u65E5\u5FD7"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
