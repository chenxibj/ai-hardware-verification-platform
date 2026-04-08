/**
 * @file TaskResult.js
 * @description 评测结果详情页面 — 3个Tab：执行信息/结果数据/执行日志
 * Issue: #164, #173 (日志增强)
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  Card, Row, Col, Statistic, Progress, Tag, Typography, Spin,
  Button, Space, Tabs, Descriptions, Empty, Input, message, Badge,
} from "antd";
import {
  ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ClockCircleOutlined, ExperimentOutlined, SyncOutlined,
  SearchOutlined, DownloadOutlined, TrophyOutlined,
  ExclamationCircleOutlined, PauseCircleOutlined,
  StopOutlined, ForwardOutlined, LoadingOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text } = Typography;

/* 状态映射 */
const STATUS_MAP = {
  COMPLETED: { color: "success", text: "已完成", icon: <CheckCircleOutlined /> },
  RUNNING:   { color: "processing", text: "运行中", icon: <SyncOutlined spin /> },
  PENDING:   { color: "default", text: "排队中", icon: <ClockCircleOutlined /> },
  QUEUED:    { color: "default", text: "排队中", icon: <ClockCircleOutlined /> },
  FAILED:    { color: "error", text: "失败", icon: <ExclamationCircleOutlined /> },
  PAUSED:    { color: "warning", text: "已暂停", icon: <PauseCircleOutlined /> },
  CANCELLED: { color: "default", text: "已取消", icon: <StopOutlined /> },
  SKIPPED:   { color: "warning", text: "已跳过", icon: <ForwardOutlined /> },
};

function scoreColor(score) {
  if (score >= 80) return "#52c41a";
  if (score >= 60) return "#1890ff";
  if (score >= 40) return "#faad14";
  return "#ff4d4f";
}

const safeParse = (str) => {
  if (!str) return null;
  if (typeof str === "object") return str;
  try { return JSON.parse(str); } catch (_) { return null; }
};

export default function TaskResult({ taskId, onBack }) {
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState(null);
  const [result, setResult] = useState(null);
  const [logContent, setLogContent] = useState("");
  const [logLoading, setLogLoading] = useState(false);
  const [logSearch, setLogSearch] = useState("");

  useEffect(() => {
    if (!taskId) return;
    setLoading(true);
    Promise.all([
      api.get(`/tasks/${taskId}`).then(r => {
        if (r.data?.code === 0) setTask(r.data.data);
      }).catch(() => {}),
      api.get(`/results/by-task?taskId=${taskId}`).then(r => {
        if (r.data?.code === 0) setResult(r.data.data);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [taskId]);

  // 加载日志 — 从后端API获取
  const fetchLogs = async () => {
    setLogLoading(true);
    try {
      const res = await api.get(`/tasks/${taskId}/logs`);
      if (res.data?.code === 0 && res.data.data) {
        setLogContent(res.data.data.content || "");
      }
    } catch (e) {
      message.error("日志加载失败");
      setLogContent("");
    } finally {
      setLogLoading(false);
    }
  };

  // generateFallbackLog removed — 不再生成假日志

  if (loading) {
    return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" tip="加载中..." /></div>;
  }

  if (!task) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Empty description="任务不存在" />
        {onBack && <Button onClick={onBack} icon={<ArrowLeftOutlined />}>返回</Button>}
      </div>
    );
  }

  const metrics = result ? safeParse(result.metricsSummary) : null;
  const statusInfo = STATUS_MAP[task.status] || { color: "default", text: task.status };

  /* Tab 1: 执行信息 */
  const ExecutionInfoTab = () => (
    <Card>
      <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
        <Descriptions.Item label="任务编号">{task.taskNo}</Descriptions.Item>
        <Descriptions.Item label="任务名称">{task.name}</Descriptions.Item>
        <Descriptions.Item label="关联任务">{task.planId ? `任务 #${task.planId}` : "-"}</Descriptions.Item>
        <Descriptions.Item label="关联芯片">{task.chipId ? `芯片 #${task.chipId}` : "-"}</Descriptions.Item>
        <Descriptions.Item label="评测类型"><Tag icon={<ExperimentOutlined />}>{task.evalType || "-"}</Tag></Descriptions.Item>
        <Descriptions.Item label="测试对象">{task.testSubject || "-"} / {task.testItem || "-"}</Descriptions.Item>
        <Descriptions.Item label="维度">{task.dimension || "-"}</Descriptions.Item>
        <Descriptions.Item label="优先级">
          <Tag color={task.priority === "HIGH" ? "red" : task.priority === "MEDIUM" ? "orange" : "default"}>{task.priority}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="状态"><Badge status={statusInfo.color} text={statusInfo.text} /></Descriptions.Item>
        <Descriptions.Item label="进度">{task.progress || 0}%</Descriptions.Item>
        <Descriptions.Item label="开始时间">{task.startedAt ? new Date(task.startedAt).toLocaleString("zh-CN") : "-"}</Descriptions.Item>
        <Descriptions.Item label="结束时间">{task.completedAt ? new Date(task.completedAt).toLocaleString("zh-CN") : "-"}</Descriptions.Item>
        <Descriptions.Item label="创建时间" span={2}>{task.createdAt ? new Date(task.createdAt).toLocaleString("zh-CN") : "-"}</Descriptions.Item>
      </Descriptions>
    </Card>
  );

  /* Tab 2: 结果数据 */
  const ResultDataTab = () => {
    if (!result || !metrics) return <Empty description="暂无结果数据" />;
    const score = metrics.score ?? 0;
    const latencyMean = metrics.latency_mean ?? metrics.latencyMean;
    const latencyP50 = metrics.latency_p50 ?? metrics.p50;
    const latencyP95 = metrics.latency_p95 ?? metrics.p95;
    const latencyP99 = metrics.latency_p99 ?? metrics.p99;
    const throughput = metrics.throughput;
    const cpuUtil = metrics.cpu_utilization ?? metrics.cpuUtilization;
    return (
      <div>
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={24} align="middle">
            <Col xs={24} sm={8} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, fontWeight: "bold", color: scoreColor(score) }}>{score.toFixed ? score.toFixed(1) : score}</div>
              <Text type="secondary">综合评分</Text>
            </Col>
            <Col xs={24} sm={8} style={{ textAlign: "center" }}>
              {result.passed
                ? <Tag icon={<CheckCircleOutlined />} color="success" style={{ fontSize: 18, padding: "8px 24px" }}>PASS</Tag>
                : <Tag icon={<CloseCircleOutlined />} color="error" style={{ fontSize: 18, padding: "8px 24px" }}>FAIL</Tag>}
            </Col>
            <Col xs={24} sm={8}>
              {result.errorMessage && <div><Text type="secondary">错误信息：</Text><Text type="danger">{result.errorMessage}</Text></div>}
            </Col>
          </Row>
        </Card>
        {(latencyMean != null || latencyP50 != null) && (
          <Card title="延迟指标" style={{ marginBottom: 16 }}>
            <Row gutter={24}>
              <Col xs={12} sm={6}><Statistic title="Mean (ms)" value={latencyMean != null ? latencyMean.toFixed(2) : "-"} valueStyle={{ color: "#1890ff" }} /></Col>
              <Col xs={12} sm={6}><Statistic title="P50 (ms)" value={latencyP50 != null ? latencyP50.toFixed(2) : "-"} valueStyle={{ color: "#52c41a" }} /></Col>
              <Col xs={12} sm={6}><Statistic title="P95 (ms)" value={latencyP95 != null ? latencyP95.toFixed(2) : "-"} valueStyle={{ color: "#faad14" }} /></Col>
              <Col xs={12} sm={6}><Statistic title="P99 (ms)" value={latencyP99 != null ? latencyP99.toFixed(2) : "-"} valueStyle={{ color: "#ff4d4f" }} /></Col>
            </Row>
          </Card>
        )}
        <Card title="性能指标" style={{ marginBottom: 16 }}>
          <Row gutter={24} align="middle">
            <Col xs={24} sm={12}>
              <Statistic title="吞吐量 (ops/sec)" value={throughput != null ? throughput.toFixed(1) : "-"} prefix={<TrophyOutlined />} valueStyle={{ color: "#1890ff" }} />
            </Col>
            <Col xs={24} sm={12}>
              {cpuUtil != null ? (
                <div>
                  <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>CPU 利用率</Text>
                  <Progress percent={Math.round(cpuUtil)} strokeColor={cpuUtil > 80 ? "#ff4d4f" : cpuUtil > 60 ? "#faad14" : "#52c41a"} format={p => `${p}%`} />
                </div>
              ) : <Statistic title="CPU 利用率" value="-" />}
            </Col>
          </Row>
        </Card>
      </div>
    );
  };

  /* Tab 3: 执行日志 (增强 #173) */
  const LogTab = () => {
    // 首次打开时加载日志
    useEffect(() => {
      if (!logContent && !logLoading) fetchLogs();
    }, []);

    const logLines = useMemo(() => {
      if (!logContent) return [];
      return logContent.split("\n").filter(l => l.trim());
    }, [logContent]);

    const filtered = useMemo(() => {
      if (!logSearch) return logLines;
      return logLines.filter(l => l.toLowerCase().includes(logSearch.toLowerCase()));
    }, [logLines, logSearch]);

    const highlightSearch = (line) => {
      if (!logSearch) return line;
      const regex = new RegExp(`(${logSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const parts = line.split(regex);
      return parts.map((part, i) =>
        regex.test(part) ? <mark key={i} style={{ background: "#ffe58f", padding: "0 2px" }}>{part}</mark> : part
      );
    };

    const handleDownload = async () => {
      try {
        const res = await api.get(`/tasks/${taskId}/logs/download`, { responseType: "blob" });
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement("a");
        a.href = url;
        a.download = `task-${task.taskNo || taskId}-log.txt`;
        document.body.appendChild(a); a.click(); a.remove();
        window.URL.revokeObjectURL(url);
        message.success("日志下载成功");
      } catch (e) {
        // fallback: 用内存中的日志
        const blob = new Blob([logContent], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `task-${task.taskNo || taskId}-log.txt`;
        a.click(); URL.revokeObjectURL(url);
        message.success("日志下载成功");
      }
    };

    return (
      <Card
        extra={
          <Space>
            <Input placeholder="搜索日志..." prefix={<SearchOutlined />}
              value={logSearch} onChange={e => setLogSearch(e.target.value)}
              style={{ width: 220 }} size="small" allowClear />
            <Button icon={<DownloadOutlined />} size="small" onClick={handleDownload}>下载日志</Button>
            <Button size="small" onClick={fetchLogs} loading={logLoading}>刷新</Button>
          </Space>
        }
      >
        {logLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}><Spin indicator={<LoadingOutlined />} tip="加载日志中..." /></div>
        ) : (
          <pre style={{
            background: "#1e1e1e", color: "#d4d4d4", padding: 16, borderRadius: 6,
            fontFamily: "'JetBrains Mono', Consolas, Monaco, 'Courier New', monospace",
            fontSize: 12, lineHeight: 1.8, maxHeight: 560, overflowY: "auto",
            margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}>
            {filtered.length === 0 ? "暂无日志" : filtered.map((line, i) => {
              let color = "#d4d4d4";
              if (line.includes("ERROR")) color = "#ff4d4f";
              else if (line.includes("WARN")) color = "#faad14";
              else if (line.includes("DEBUG")) color = "#888";
              else if (line.includes("INFO")) color = "#73d13d";
              return <div key={i} style={{ color }}>{highlightSearch(line)}</div>;
            })}
          </pre>
        )}
        <div style={{ marginTop: 8, color: "#999", fontSize: 12 }}>
          共 {logLines.length} 行 {logSearch && `| 匹配 ${filtered.length} 行`}
        </div>
      </Card>
    );
  };

  const tabItems = [
    { key: "info", label: "执行信息", children: <ExecutionInfoTab /> },
    { key: "data", label: "结果数据", children: <ResultDataTab /> },
    { key: "logs", label: "执行日志", children: <LogTab /> },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          {onBack && <Button type="link" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ paddingLeft: 0 }}>返回</Button>}
          <Title level={4} style={{ margin: 0 }}>{task.testItem || task.name} — 评测结果</Title>
          <Badge status={statusInfo.color} text={statusInfo.text} />
        </Space>
      </div>
      <Tabs items={tabItems} defaultActiveKey="info" />
    </div>
  );
}
