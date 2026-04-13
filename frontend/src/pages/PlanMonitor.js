/**
import { useParams, useNavigate } from "react-router-dom";
 * @file PlanMonitor.js
import { useParams, useNavigate } from "react-router-dom";
 * @description 执行监控页面 — 资源仪表盘 + 任务列表(含重试/跳过) + 实时日志
import { useParams, useNavigate } from "react-router-dom";
 * Issue: #134, #163, #229-#234, #244, #245
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
  ForwardOutlined, DashboardOutlined, SearchOutlined, WarningOutlined,
  DownloadOutlined, ArrowDownOutlined, ExpandOutlined, CompressOutlined,
  UpOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import useLogWebSocket from "../hooks/useLogWebSocket";

const { Title, Text } = Typography;

/* ── 状态颜色映射 ── */
const TASK_STATUS_MAP = {
  COMPLETED: { color: "green",      text: "已完成", icon: <CheckCircleOutlined /> },
  RUNNING:   { color: "blue",       text: "运行中", icon: <SyncOutlined spin /> },
  PENDING:   { color: "default",    text: "排队中", icon: <ClockCircleOutlined /> },
  QUEUED:    { color: "default",    text: "排队中", icon: <ClockCircleOutlined /> },
  FAILED:    { color: "red",        text: "失败",   icon: <ExclamationCircleOutlined /> },
  PAUSED:    { color: "orange",     text: "已暂停", icon: <PauseCircleOutlined /> },
  CANCELLED: { color: "default",    text: "已取消", icon: <StopOutlined /> },
  SKIPPED:   { color: "gold",       text: "已跳过", icon: <ForwardOutlined /> },
};

const PLAN_STATUS_MAP = {
  DRAFT:     { text: "草稿",   badge: "default" },
  RUNNING:   { text: "运行中", badge: "processing" },
  PAUSED:    { text: "已暂停", badge: "warning" },
  COMPLETED: { text: "已完成", badge: "success" },
  FAILED:    { text: "失败",   badge: "error" },
  CANCELLED: { text: "已取消", badge: "default" },
};

const SUBJECT_ICONS = {
  OPERATOR: <ExperimentOutlined />,
  MODEL: <RobotOutlined />,
};

const SUBJECT_LABELS = {
  OPERATOR: "算子评测",
  MODEL: "模型推理",
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

/* ── 任务统计 ── */
function computeTaskStats(tasks) {
  const running = tasks.filter(t => t.status === "RUNNING").length;
  const completed = tasks.filter(t => t.status === "COMPLETED").length;
  const failed = tasks.filter(t => t.status === "FAILED").length;
  const total = tasks.length;
  return { running, completed, failed, total };
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

export default function PlanMonitor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const planId = Number(id);
  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logLevelFilter, setLogLevelFilter] = useState("ALL");
  const [logTypeFilter, setLogTypeFilter] = useState("ALL");
  const [logSearch, setLogSearch] = useState("");
  const [taskStats, setTaskStats] = useState({ running: 0, completed: 0, failed: 0, total: 0 });
  const [autoScroll, setAutoScroll] = useState(true);
  const [hasNewLogs, setHasNewLogs] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const logContainerRef = useRef(null);

  // #245: WebSocket-based real-time logs
  const { logs, connectionState, loadOlderLogs, hasOlderLogs } = useLogWebSocket(planId, {
    enabled: true,
  });

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
        setTasks(newTasks);
        setTaskStats(computeTaskStats(newTasks));
      }
    } catch (e) {
      console.error("fetchTasks error", e);
    }
  }, [planId]);

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
    };
  }, [fetchPlan, fetchTasks]);

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
    pause:  { title: "确认暂停", content: "暂停后正在运行的任务将继续完成，新任务不再启动。", okText: "确认暂停" },
    resume: { title: "确认恢复", content: "恢复后将继续执行排队中的任务。", okText: "确认恢复" },
    start:  { title: "确认启动", content: "启动后将开始执行评测任务。", okText: "确认启动" },
    cancel: { title: "确认取消", content: "取消后该任务将停止执行，已完成的任务结果保留。确认取消？", okText: "确认取消", okType: "danger" },
  };

  const handlePlanAction = (action, label) => {
    const confirmCfg = PLAN_ACTION_CONFIRM[action] || { title: "确认" + label, content: "确定要" + label + "该任务吗？", okText: "确认" };
    Modal.confirm({
      title: confirmCfg.title,
      content: confirmCfg.content,
      okText: confirmCfg.okText || "确认",
      okType: confirmCfg.okType || "primary",
      cancelText: "返回",
      onOk: async () => {
        try {
          await api.put("/plans/" + planId + "/" + action);
          message.success(label + "成功");
          fetchPlan();
          fetchTasks();
        } catch (e) {
          message.error(label + "失败: " + (e.response?.data?.message || e.message));
        }
      },
    });
  };

  const handleRetryTask = (taskId) => {
    Modal.confirm({
      title: "确认重试",
      content: "将重新执行该失败任务，是否继续？",
      okText: "确认重试",
      cancelText: "返回",
      onOk: async () => {
        try {
          await api.post("/tasks/" + taskId + "/retry");
          message.success("重试已提交");
          fetchTasks();
        } catch (e) {
          message.error("重试失败: " + (e.response?.data?.message || e.message));
        }
      },
    });
  };

  const handleRetryAllFailed = () => {
    const failedTasks = tasks.filter(t => t.status === "FAILED");
    if (failedTasks.length === 0) {
      message.info("没有失败的任务需要重试");
      return;
    }
    Modal.confirm({
      title: "确认重试全部失败任务",
      content: "将重试 " + failedTasks.length + " 个失败任务，是否继续？",
      okText: "确认重试",
      cancelText: "返回",
      onOk: async () => {
        try {
          await Promise.all(failedTasks.map(t => api.post("/tasks/" + t.id + "/retry")));
          message.success("已提交 " + failedTasks.length + " 个重试任务");
          fetchTasks();
        } catch (e) {
          message.error("部分重试失败");
          fetchTasks();
        }
      },
    });
  };

  const handleSkipTask = async (taskId) => {
    try {
      await api.post("/tasks/" + taskId + "/skip");
      message.success("已跳过该任务");
      fetchTasks();
      fetchPlan();
    } catch (e) {
      message.error("跳过失败: " + (e.response?.data?.message || e.message));
    }
  };

  const handleCancelTask = (taskId) => {
    Modal.confirm({
      title: "确认取消任务",
      content: "取消后该任务将停止执行，确认取消？",
      okText: "确认取消",
      okType: "danger",
      cancelText: "返回",
      onOk: async () => {
        try {
          await api.post("/tasks/" + taskId + "/cancel");
          message.success("任务已取消");
          fetchTasks();
          fetchPlan();
        } catch (e) {
          message.error("取消失败: " + (e.response?.data?.message || e.message));
        }
      },
    });
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
    : plan?.status === "COMPLETED" ? "已完成" : "-";

  /* ── 排队序号计算 ── */
  const queuePosition = {};
  const pendingTasks = tasks
    .filter(t => ["PENDING", "QUEUED"].includes(t.status))
    .sort((a, b) => a.id - b.id);
  pendingTasks.forEach((t, idx) => {
    queuePosition[t.id] = idx + 1;
  });

  /* ── 按 testSubject 分组 ── */
  const grouped = {};
  tasks.forEach((t) => {
    const key = t.testSubject || "OTHER";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  /* ── #244: 日志过滤 (级别 + 类型 + 关键字) ── */
  const filteredLogs = logs.filter(log => {
    if (logLevelFilter !== "ALL" && (log.level || "INFO").toUpperCase() !== logLevelFilter) return false;
    if (logTypeFilter !== "ALL" && (log.logType || "TEXT").toUpperCase() !== logTypeFilter) return false;
    if (logSearch && !(log.message || "").toLowerCase().includes(logSearch.toLowerCase())) return false;
    return true;
  });

  /* ── 渲染单条日志 ── */
  const renderLogEntry = (log, i, lineNo) => {
    const level = (log.level || "INFO").toUpperCase();
    const logType = (log.logType || "TEXT").toUpperCase();
    const metrics = parseMetrics(log.metrics);

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

    let progressValue = null;
    if (logType === "PROGRESS") {
      const pctMatch = (log.message || "").match(/(\d+(?:\.\d+)?)%/);
      const fracMatch = (log.message || "").match(/(\d+)\s*\/\s*(\d+)/);
      if (pctMatch) progressValue = parseFloat(pctMatch[1]);
      else if (fracMatch) progressValue = Math.round((parseInt(fracMatch[1]) / parseInt(fracMatch[2])) * 100);
    }

    return (
      <div key={log.id || i} style={{ ...style, display: "flex", alignItems: "flex-start" }}>
        {/* Line number gutter */}
        <span
          style={{
            display: "inline-block",
            minWidth: 40,
            width: 40,
            textAlign: "right",
            paddingRight: 10,
            color: "#bbb",
            fontSize: 11,
            userSelect: "none",
            flexShrink: 0,
            borderRight: "1px solid #e8e8e8",
            marginRight: 8,
          }}
        >
          {lineNo}
        </span>
        <div style={{ flex: 1 }}>
        <span style={{ color: "#999" }}>{formatTimestamp(log.createdAt)}</span>
        {" "}
        <span style={{ color: levelColor, fontWeight: 600 }}>{"[" + level + "]"}</span>
        {" "}
        {logType !== "TEXT" && (
          <span style={{ color: typeColor }}>{"[" + logType + "]"}{" "}</span>
        )}
        <span>{log.message}</span>

        {logType === "METRIC" && metrics && (
          <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap", marginLeft: 16 }}>
            {metrics.latency_ms_p50 != null && <Tag color="blue">{"P50: " + metrics.latency_ms_p50 + "ms"}</Tag>}
            {metrics.latency_ms_p95 != null && <Tag color="orange">{"P95: " + metrics.latency_ms_p95 + "ms"}</Tag>}
            {metrics.latency_ms_p99 != null && <Tag color="red">{"P99: " + metrics.latency_ms_p99 + "ms"}</Tag>}
            {metrics.throughput_qps != null && <Tag color="green">{"QPS: " + metrics.throughput_qps}</Tag>}
            {metrics.cpu_util_percent != null && <Tag color="purple">{"CPU: " + metrics.cpu_util_percent + "%"}</Tag>}
            {metrics.memory_util_percent != null && <Tag color="cyan">{"MEM: " + metrics.memory_util_percent + "%"}</Tag>}
            {metrics.status && <Tag color={metrics.status === "PASS" ? "success" : "error"}>{metrics.status}</Tag>}
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

        {logType === "PROGRESS" && progressValue !== null && (
          <div style={{ marginTop: 4, marginLeft: 16, maxWidth: 300 }}>
            <Progress percent={progressValue} size="small" status="active" />
          </div>
        )}
        </div>
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
          {queuePosition[task.id] && (
            <Tag color="blue" style={{ minWidth: 28, textAlign: "center", fontWeight: 600 }}>{"#" + queuePosition[task.id]}</Tag>
          )}
          <Text style={{ width: 200, display: "inline-block" }}>{task.testItem || task.name}</Text>
          <Tag color={st.color} icon={st.icon}>
            {st.text}{queuePosition[task.id] ? (" (" + queuePosition[task.id] + "/" + pendingTasks.length + ")") : ""}
          </Tag>
          {task.queueReason && ["QUEUED", "PENDING"].includes(task.status) && (
            <Tooltip title={task.queueReason}>
              <Text type="warning" style={{ fontSize: 11, cursor: "pointer" }}>
                <ExclamationCircleOutlined /> {task.queueReason.length > 30 ? task.queueReason.substring(0, 30) + "..." : task.queueReason}
              </Text>
            </Tooltip>
          )}
          {/* Anomaly hint: COMPLETED but metrics may be missing */}
          {task.status === "COMPLETED" && task.evaluationResults && (() => {
            const metrics = parseMetrics(task.evaluationResults);
            const hasNoData = metrics && (metrics.passed === true || metrics.passed === "true")
              && (!metrics.latency_ms_mean || metrics.latency_ms_mean === 0);
            if (hasNoData) {
              return <Tooltip title="任务已执行完成，但未采集到性能指标数据"><Tag color="warning" icon={<WarningOutlined />} style={{ fontSize: 11 }}>无性能指标</Tag></Tooltip>;
            }
            return null;
          })()}
        </Space>
        <Space>
          {task.progress !== undefined && task.progress > 0 && task.status === "RUNNING" && (
            <Text type="secondary" style={{ fontSize: 12 }}>{task.progress}%</Text>
          )}
          <Text type="secondary" style={{ fontSize: 12, width: 80, textAlign: "right" }}>
            {formatDuration(task.startedAt, task.completedAt)}
          </Text>
          {task.status === "FAILED" && (
            <Space size={4} direction="vertical" style={{ width: "100%" }}>
              <Tooltip title={task.errorMessage || "执行失败，无详细错误信息"}>
                <Text type="danger" style={{ fontSize: 12, maxWidth: 400, display: "inline-block" }} ellipsis>
                  <ExclamationCircleOutlined /> {task.errorMessage ? task.errorMessage.substring(0, 80) + (task.errorMessage.length > 80 ? "..." : "") : "执行失败，无详细错误信息"}
                </Text>
              </Tooltip>
              <Space size={4}>
              <Popconfirm title="确定重试该任务？" onConfirm={() => handleRetryTask(task.id)}>
                <Button type="link" size="small" icon={<ReloadOutlined />}>重试</Button>
              </Popconfirm>
              <Popconfirm title="确定跳过该任务？跳过后不会再执行" onConfirm={() => handleSkipTask(task.id)}>
                <Button type="link" size="small" icon={<ForwardOutlined />} style={{ color: "#faad14" }}>跳过</Button>
              </Popconfirm>
              </Space>
            </Space>
          )}
          {["RUNNING", "QUEUED", "PENDING", "DISPATCHED"].includes(task.status) && (
            <Button type="link" size="small" danger icon={<StopOutlined />}
              onClick={() => handleCancelTask(task.id)}>取消</Button>
          )}
        </Space>
      </div>
    );
  };

  /* ── WebSocket 连接状态指示器 ── */
  const ConnectionIndicator = () => {
    if (connectionState === "connected") {
      return <Tag color="green" style={{ fontSize: 11 }}>🟢 WebSocket 已连接</Tag>;
    } else if (connectionState === "reconnecting") {
      return <Tag color="orange" style={{ fontSize: 11 }}>🟡 重连中...</Tag>;
    } else {
      return <Tag color="red" style={{ fontSize: 11 }}>🔴 离线 (HTTP 轮询)</Tag>;
    }
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" tip="加载中..." /></div>;
  }

  const planStatus = plan ? (PLAN_STATUS_MAP[plan.status] || { text: plan.status, badge: "default" }) : {};

  const logPanelHeight = expanded ? "calc(100vh - 120px)" : 600;

  return (
    <div>
      {/* 返回按钮 */}
      <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate("/plans")}
        style={{ marginBottom: 12, paddingLeft: 0 }}>
        返回任务列表
      </Button>

      {/* ── 顶部: 资源仪表盘 ── */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={24} align="middle">
          <Col xs={24} md={5} style={{ textAlign: "center" }}>
            <DashboardOutlined style={{ fontSize: 18, color: "#1890ff", marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>运行中任务</div>
            <div style={{ fontSize: 28, fontWeight: "bold", color: taskStats.running > 0 ? "#1890ff" : "#999" }}>
              {taskStats.running}
            </div>
          </Col>
          <Col xs={24} md={5} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>已完成 / 总计</div>
            <div style={{ fontSize: 28, fontWeight: "bold", color: "#52c41a" }}>
              {taskStats.completed}<span style={{ fontSize: 14, color: "#999", fontWeight: "normal" }}> / {taskStats.total}</span>
            </div>
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="已耗时" value={elapsedStr} valueStyle={{ fontSize: 18 }} />
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="预估剩余" value={remainStr} valueStyle={{ fontSize: 18, color: "#1890ff" }} />
          </Col>
          <Col xs={12} md={3}>
            <Statistic title="任务进度"
              value={(statCounts.completed + statCounts.skipped) + "/" + (plan?.totalTasks || tasks.length)}
              valueStyle={{ fontSize: 18 }} />
          </Col>
          <Col xs={12} md={3}>
            <Statistic title="失败/跳过"
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
              <Text type="secondary">{"芯片 #" + (plan?.chipId || "")}</Text>
            </Space>
          </Col>
          <Col>
            <Space>
              {plan?.status === "RUNNING" && (
                <Popconfirm title="确定要暂停评测？暂停后可恢复继续执行" onConfirm={() => handlePlanAction("pause", "暂停")}>
                  <Button icon={<PauseCircleOutlined />}>暂停</Button>
                </Popconfirm>
              )}
              {plan?.status === "PAUSED" && (
                <Button type="primary" icon={<PlayCircleOutlined />}
                  onClick={() => handlePlanAction("resume", "恢复")}>恢复</Button>
              )}
              {plan?.status === "DRAFT" && (
                <Button type="primary" icon={<PlayCircleOutlined />}
                  onClick={() => handlePlanAction("start", "启动")}>启动执行</Button>
              )}
              {(plan?.status === "RUNNING" || plan?.status === "PAUSED") && (
                <Button danger icon={<StopOutlined />}
                  onClick={() => handlePlanAction("cancel", "取消")}>取消</Button>
              )}
              <Tooltip title="手动刷新">
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
            <Statistic title="已完成" value={statCounts.completed}
              valueStyle={{ color: "#52c41a" }}
              prefix={<CheckCircleOutlined />} />
          </Col>
          <Col xs={12} sm={5}>
            <Statistic title="运行中" value={statCounts.running}
              valueStyle={{ color: "#1890ff" }}
              prefix={<SyncOutlined />} />
          </Col>
          <Col xs={12} sm={5}>
            <Statistic title="排队中" value={statCounts.pending}
              prefix={<ClockCircleOutlined />} />
          </Col>
          <Col xs={12} sm={5}>
            <Statistic title="失败" value={statCounts.failed}
              valueStyle={{ color: "#ff4d4f" }}
              prefix={<ExclamationCircleOutlined />} />
          </Col>
          <Col xs={12} sm={4}>
            <Statistic title="已跳过" value={statCounts.skipped}
              valueStyle={{ color: "#faad14" }}
              prefix={<ForwardOutlined />} />
          </Col>
        </Row>
      </Card>

      {/* ── 中部：分组任务列表 ── */}
      <Card title="任务列表" style={{ marginBottom: 16 }}
        extra={
          <Space>
            {statCounts.failed > 0 && (
              <Button size="small" icon={<ReloadOutlined />} onClick={handleRetryAllFailed}>
                重试全部失败 ({statCounts.failed})
              </Button>
            )}
          </Space>
        }>
        {Object.keys(grouped).length === 0 ? (
          <Text type="secondary">暂无任务</Text>
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
                      <Text type="secondary">{"(" + subjectTasks.length + " 项)"}</Text>
                      {completed > 0 && <Tag color="green">{completed + " 完成"}</Tag>}
                      {running > 0 && <Tag color="blue">{running + " 运行中"}</Tag>}
                      {failed > 0 && <Tag color="red">{failed + " 失败"}</Tag>}
                      {skipped > 0 && <Tag color="gold">{skipped + " 跳过"}</Tag>}
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

      {/* ── 底部：实时日志面板 (#244, #245) ── */}
      <Card
        title={
          <Space>
            <span>实时执行日志</span>
            <ConnectionIndicator />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {filteredLogs.length}/{logs.length} 条日志
            </Text>
          </Space>
        }
        size="small"
        extra={
          <Space wrap>
            {/* 级别过滤 */}
            <Select
              value={logLevelFilter}
              onChange={setLogLevelFilter}
              style={{ width: 100 }}
              size="small"
            >
              <Select.Option value="ALL">全部级别</Select.Option>
              <Select.Option value="INFO">INFO</Select.Option>
              <Select.Option value="WARN">WARN</Select.Option>
              <Select.Option value="ERROR">ERROR</Select.Option>
              <Select.Option value="DEBUG">DEBUG</Select.Option>
            </Select>
            {/* 类型过滤 */}
            <Select
              value={logTypeFilter}
              onChange={setLogTypeFilter}
              style={{ width: 120 }}
              size="small"
            >
              <Select.Option value="ALL">全部类型</Select.Option>
              <Select.Option value="SYSTEM">SYSTEM</Select.Option>
              <Select.Option value="EVAL">EVAL</Select.Option>
              <Select.Option value="METRIC">METRIC</Select.Option>
              <Select.Option value="TEXT">TEXT</Select.Option>
              <Select.Option value="PROGRESS">PROGRESS</Select.Option>
            </Select>
            {/* 关键字搜索 */}
            <Input
              placeholder="搜索日志..."
              prefix={<SearchOutlined />}
              value={logSearch}
              onChange={e => setLogSearch(e.target.value)}
              style={{ width: 160 }}
              size="small"
              allowClear
            />
            {/* 全屏切换 */}
            <Tooltip title={expanded ? "退出全屏" : "全屏"}>
              <Button
                size="small"
                icon={expanded ? <CompressOutlined /> : <ExpandOutlined />}
                onClick={() => setExpanded(!expanded)}
              />
            </Tooltip>
          </Space>
        }
      >
        {/* 加载更早日志按钮 */}
        {hasOlderLogs && (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <Button size="small" icon={<UpOutlined />} onClick={loadOlderLogs}>
              加载更早日志
            </Button>
          </div>
        )}

        <div
          ref={logContainerRef}
          onScroll={handleLogScroll}
          style={{
            background: "#fafafa",
            border: "1px solid #e8e8e8",
            borderRadius: 6,
            maxHeight: logPanelHeight,
            overflowY: "auto",
            minHeight: 80,
            position: "relative",
          }}
        >
          {filteredLogs.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#999" }}>
              {tasks.some(t => t.status === "RUNNING")
                ? "等待任务执行日志..."
                : "暂无日志记录"}
            </div>
          ) : (
            filteredLogs.map((log, i) => renderLogEntry(log, i, i + 1))
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
              ↓ 有新日志
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
