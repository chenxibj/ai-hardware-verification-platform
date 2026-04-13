/**
import { useParams, useNavigate } from "react-router-dom";
 * @file TaskResult.js
import { useParams, useNavigate } from "react-router-dom";
 * @description 评测结果详情页面 — 4个Tab：执行信息/结果数据/原因分析/执行日志
import { useParams, useNavigate } from "react-router-dom";
 * Issue: #164, #173 (日志增强), 算子结果展示增强 + 错误原因分析
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  Card, Row, Col, Statistic, Progress, Tag, Typography, Spin,
  Button, Space, Tabs, Descriptions, Empty, Input, message, Badge,
  Table, Alert, Collapse, Tooltip, Divider,
} from "antd";
import {
  ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ClockCircleOutlined, ExperimentOutlined, SyncOutlined,
  SearchOutlined, DownloadOutlined, TrophyOutlined,
  ExclamationCircleOutlined, PauseCircleOutlined,
  StopOutlined, ForwardOutlined, LoadingOutlined,
  WarningOutlined, BugOutlined, InfoCircleOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

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

/**
 * Unified metric extraction: tries multiple key names.
 * Handles both new format (latency_ms_mean) and old format (latencyMean, latency_mean).
 */
function getMetric(metrics, ...keys) {
  for (const k of keys) {
    if (metrics && metrics[k] != null && metrics[k] !== "") return metrics[k];
  }
  return null;
}

/**
 * Try to extract eval data from raw_data when metrics_summary is incomplete.
 * Returns a parsed eval_result object or null.
 */
function extractEvalFromRawData(rawData) {
  if (!rawData) return null;
  const parsed = safeParse(rawData);
  if (!parsed) return null;

  // Standard agent format: { result: { eval_result: {...} } }
  const evalResult = parsed?.result?.eval_result;
  if (evalResult && typeof evalResult === "object" && !evalResult.raw_output) {
    return evalResult;
  }

  // If eval_result is raw_output string, try extracting JSON from it
  if (evalResult?.raw_output) {
    const lines = evalResult.raw_output.split("\n").reverse();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("{")) {
        try {
          const obj = JSON.parse(trimmed);
          if (obj && typeof obj === "object") return obj;
        } catch (_) { /* skip */ }
      }
    }
  }

  return null;
}

/**
 * Diagnose why a task might have failed or scored low.
 * Returns an array of { type: 'error'|'warning'|'info', message: string }
 */
function diagnoseResult(metrics, rawData, result, task) {
  const issues = [];

  if (!result) {
    issues.push({ type: "error", message: "未找到评测结果数据，可能是任务执行异常或结果上报失败。" });
    return issues;
  }

  if (result.errorMessage) {
    issues.push({ type: "error", message: "执行错误: " + result.errorMessage });
  }

  if (!metrics && !rawData) {
    issues.push({ type: "error", message: "评测结果为空，任务可能在执行过程中崩溃。" });
    return issues;
  }

  // Check for incomplete metrics_summary (benchmark_name=unknown is a strong signal)
  if (metrics) {
    const benchName = metrics.benchmark_name;
    const hasOperators = metrics.operators && metrics.operators.length > 0;
    const hasDetails = metrics.details && metrics.details.length > 0;
    const hasLatency = getMetric(metrics, "latency_ms_mean", "latency_mean", "latencyMean", "avg_latency_ms") != null;

    if (benchName === "unknown" && !hasOperators && !hasDetails && !hasLatency) {
      issues.push({
        type: "warning",
        message: "指标摘要数据不完整（benchmark_name=unknown，缺少核心指标）。这通常是因为评测脚本输出格式未被后端正确解析。系统已尝试从原始数据中恢复指标。",
      });
    }

    if (metrics.score != null && metrics.score < 60) {
      if (metrics.score === 50 && !hasLatency && !hasOperators) {
        issues.push({
          type: "warning",
          message: "评分为默认值 50 分（而非基于实际指标计算），表明评分系统未能识别有效指标。请检查原始数据中是否包含正确的结果。",
        });
      } else if (hasLatency) {
        const latency = getMetric(metrics, "latency_ms_mean", "avg_latency_ms");
        if (latency && latency > 100) {
          issues.push({ type: "warning", message: `延迟较高 (${latency.toFixed(2)}ms)，可能是由于 CPU 负载过高或算子实现未优化。` });
        }
        const passRate = metrics.pass_rate;
        if (passRate != null && passRate < 100) {
          issues.push({ type: "error", message: `通过率仅 ${passRate}%，部分算子测试未通过。请查看详细结果了解失败原因。` });
        }
      }
    }
  }

  // Try extracting from raw_data for additional insight
  const evalData = extractEvalFromRawData(rawData);
  if (evalData) {
    const results = evalData.results || [];
    const failedOps = results.filter(r => r.status !== "PASS");
    if (failedOps.length > 0) {
      for (const op of failedOps) {
        issues.push({
          type: "error",
          message: `算子 ${op.operator || op.model || "unknown"} 测试失败 (status: ${op.status})${op.error ? ": " + op.error : ""}`,
        });
      }
    }

    // Check for FP16 issues
    const config = evalData.config || {};
    if (config.dtypes && config.dtypes.includes("FP16")) {
      const fp16Results = results.filter(r => r.dtype === "FP16");
      const fp16Fails = fp16Results.filter(r => r.status !== "PASS");
      if (fp16Fails.length > 0) {
        issues.push({
          type: "info",
          message: "部分 FP16 精度算子未通过。如果 CPU 不支持 FP16 指令集，建议使用 FP32 精度重新评测。",
        });
      }
    }
  }

  // Check task status vs result.passed mismatch
  if (task && task.status === "COMPLETED" && result && !result.passed) {
    issues.push({
      type: "info",
      message: "任务执行已完成，但评测结果标记为未通过。可能是评分未达到通过阈值（60分），或指标解析异常。",
    });
  }

  if (issues.length === 0 && result && result.passed) {
    issues.push({ type: "info", message: "评测任务执行正常，所有指标均在预期范围内。" });
  }

  return issues;
}

export default function TaskResult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const taskId = Number(id);
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

  const metrics = result ? safeParse(result.metricsSummary) : null;
  const rawData = result ? (typeof result.rawData === "string" ? result.rawData : JSON.stringify(result.rawData)) : null;

  // Try to get complete eval data - first from metrics_summary, fallback to raw_data
  const evalFromRaw = extractEvalFromRawData(rawData);
  // Merge: use metrics as base, enrich with raw data if metrics is incomplete
  const effectiveMetrics = useMemo(() => {
    if (!metrics && !evalFromRaw) return null;
    const m = { ...(metrics || {}) };

    // If metrics_summary is incomplete (no operators, no latency), enrich from raw
    if (evalFromRaw) {
      const hasFullMetrics = m.operators && m.operators.length > 0 && m.latency_ms_mean != null;
      if (!hasFullMetrics) {
        // Pull from eval raw data
        const summary = evalFromRaw.summary || {};
        const results = evalFromRaw.results || [];

        // Fill in summary fields if missing
        if (!m.pass_rate && summary.pass_rate != null) m.pass_rate = summary.pass_rate;
        if (!m.avg_latency_ms && summary.avg_latency_ms != null) m.avg_latency_ms = summary.avg_latency_ms;
        if (!m.avg_gflops && summary.avg_gflops != null) m.avg_gflops = summary.avg_gflops;
        if (!m.max_gflops && summary.max_gflops != null) m.max_gflops = summary.max_gflops;
        if (!m.total_operators && summary.total_operators != null) m.total_operators = summary.total_operators;
        if (!m.fastest_op && summary.fastest_op) m.fastest_op = summary.fastest_op;
        if (!m.slowest_op && summary.slowest_op) m.slowest_op = summary.slowest_op;
        if (!m.dtypes_tested && summary.dtypes_tested) m.dtypes_tested = summary.dtypes_tested;

        // Fill in details/operators from results
        if ((!m.details || m.details.length === 0) && results.length > 0) {
          m.details = results;
        }
        if ((!m.operators || m.operators.length === 0) && results.length > 0) {
          m.operators = results.map(r => ({
            name: r.operator || r.model || "unknown",
            status: r.status || "N/A",
            ...Object.fromEntries(Object.entries(r).filter(([_, v]) => typeof v === "number")),
          }));
        }

        // Fill in single-result top-level metrics
        if (results.length === 1) {
          const s = results[0];
          for (const [k, v] of Object.entries(s)) {
            if ((typeof v === "number" || k === "status") && m[k] == null) {
              m[k] = v;
            }
          }
        }

        if (!m.benchmark_name || m.benchmark_name === "unknown") {
          m.benchmark_name = evalFromRaw.benchmark_name || m.benchmark_name;
        }
        if (!m.config && evalFromRaw.config) {
          m.config = evalFromRaw.config;
        }

        m._enrichedFromRawData = true;
      }
    }
    return m;
  }, [metrics, evalFromRaw]);

  const statusInfo = STATUS_MAP[task?.status] || { color: "default", text: task?.status };

  if (loading) {
    return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" tip="加载中..." /></div>;
  }

  if (!task) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Empty description="任务不存在" />
        {<Button onClick={() => navigate(-1)} icon={<ArrowLeftOutlined />}>返回</Button>}
      </div>
    );
  }

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

  /* Tab 2: 结果数据 — Enhanced */
  const ResultDataTab = () => {
    const m = effectiveMetrics;
    if (!result || !m) return <Empty description="暂无结果数据" />;

    const score = m.score ?? 0;
    const latencyMean = getMetric(m, "latency_ms_mean", "latency_mean", "latencyMean", "avg_latency_ms");
    const latencyP50 = getMetric(m, "latency_ms_p50", "latency_p50", "p50", "latencyP50");
    const latencyP95 = getMetric(m, "latency_ms_p95", "latency_p95", "p95", "latencyP95");
    const latencyP99 = getMetric(m, "latency_ms_p99", "latency_p99", "p99", "latencyP99");
    const latencyMin = getMetric(m, "latency_ms_min");
    const latencyMax = getMetric(m, "latency_ms_max");
    const throughput = getMetric(m, "throughput_ops", "throughput", "throughput_fps");
    const cpuUtil = getMetric(m, "cpu_util_percent", "cpu_utilization", "cpuUtilization", "cpuUtil");
    const gflops = getMetric(m, "gflops", "avg_gflops");
    const maxGflops = getMetric(m, "max_gflops");
    const passRate = m.pass_rate;
    const benchmarkName = m.benchmark_name;
    const operators = m.operators || [];
    const details = m.details || [];

    const hasLatencyData = latencyMean != null || latencyP50 != null;
    const hasPerformanceData = throughput != null || gflops != null;

    // Operator detail table columns
    const operatorColumns = [
      {
        title: "算子名称",
        dataIndex: "name",
        key: "name",
        render: (v, r) => (
          <Space>
            <ThunderboltOutlined style={{ color: "#1890ff" }} />
            <Text strong>{v || r.operator || "unknown"}</Text>
          </Space>
        ),
      },
      {
        title: "状态",
        dataIndex: "status",
        key: "status",
        width: 80,
        render: v => v === "PASS"
          ? <Tag color="success" icon={<CheckCircleOutlined />}>PASS</Tag>
          : <Tag color="error" icon={<CloseCircleOutlined />}>FAIL</Tag>,
      },
      {
        title: "延迟 Mean (ms)",
        dataIndex: "latency_ms_mean",
        key: "latency_mean",
        width: 120,
        render: v => v != null ? <Text style={{ color: "#1890ff" }}>{v.toFixed(3)}</Text> : "-",
      },
      {
        title: "P50 (ms)",
        dataIndex: "latency_ms_p50",
        key: "p50",
        width: 100,
        render: v => v != null ? v.toFixed(3) : "-",
      },
      {
        title: "P95 (ms)",
        dataIndex: "latency_ms_p95",
        key: "p95",
        width: 100,
        render: v => v != null ? <Text style={{ color: "#faad14" }}>{v.toFixed(3)}</Text> : "-",
      },
      {
        title: "P99 (ms)",
        dataIndex: "latency_ms_p99",
        key: "p99",
        width: 100,
        render: v => v != null ? <Text style={{ color: "#ff4d4f" }}>{v.toFixed(3)}</Text> : "-",
      },
      {
        title: "吞吐量 (ops/s)",
        dataIndex: "throughput_ops",
        key: "throughput",
        width: 120,
        render: v => v != null ? <Text style={{ color: "#52c41a" }}>{v.toFixed(1)}</Text> : "-",
      },
      {
        title: "GFLOPS",
        dataIndex: "gflops",
        key: "gflops",
        width: 100,
        render: v => v != null ? <Text strong>{v.toFixed(1)}</Text> : "-",
      },
      {
        title: "内存增量 (MB)",
        dataIndex: "memory_delta_mb",
        key: "memory",
        width: 110,
        render: v => v != null ? v.toFixed(2) : "-",
      },
    ];

    return (
      <div>
        {/* Enrichment notice */}
        {m._enrichedFromRawData && (
          <Alert
            message="数据补充说明"
            description="部分指标数据从原始评测输出中提取补充，可能存在轻微差异。"
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
            style={{ marginBottom: 16 }}
            closable
          />
        )}

        {/* Score + Pass/Fail header */}
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={24} align="middle">
            <Col xs={24} sm={6} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, fontWeight: "bold", color: scoreColor(score) }}>
                {score.toFixed ? score.toFixed(1) : score}
              </div>
              <Text type="secondary">综合评分</Text>
            </Col>
            <Col xs={24} sm={6} style={{ textAlign: "center" }}>
              {result.passed
                ? <Tag icon={<CheckCircleOutlined />} color="success" style={{ fontSize: 18, padding: "8px 24px" }}>PASS</Tag>
                : <Tag icon={<CloseCircleOutlined />} color="error" style={{ fontSize: 18, padding: "8px 24px" }}>FAIL</Tag>}
            </Col>
            <Col xs={24} sm={12}>
              <Row gutter={[16, 8]}>
                {benchmarkName && benchmarkName !== "unknown" && (
                  <Col span={12}><Text type="secondary">基准测试：</Text><Tag color="blue">{benchmarkName}</Tag></Col>
                )}
                {passRate != null && (
                  <Col span={12}><Text type="secondary">通过率：</Text><Text strong style={{ color: passRate >= 100 ? "#52c41a" : "#ff4d4f" }}>{passRate}%</Text></Col>
                )}
                {m.total_operators != null && (
                  <Col span={12}><Text type="secondary">算子总数：</Text><Text>{m.total_operators}</Text></Col>
                )}
                {m.dtypes_tested && (
                  <Col span={12}><Text type="secondary">测试精度：</Text>{(Array.isArray(m.dtypes_tested) ? m.dtypes_tested : [m.dtypes_tested]).map(d => <Tag key={d}>{d}</Tag>)}</Col>
                )}
              </Row>
              {result.errorMessage && (
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">错误信息：</Text><Text type="danger">{result.errorMessage}</Text>
                </div>
              )}
            </Col>
          </Row>
        </Card>

        {/* Latency metrics */}
        {hasLatencyData && (
          <Card title="延迟指标" style={{ marginBottom: 16 }}>
            <Row gutter={24}>
              <Col xs={12} sm={4}><Statistic title="Mean (ms)" value={latencyMean != null ? latencyMean.toFixed(3) : "-"} valueStyle={{ color: "#1890ff" }} /></Col>
              <Col xs={12} sm={4}><Statistic title="P50 (ms)" value={latencyP50 != null ? latencyP50.toFixed(3) : "-"} valueStyle={{ color: "#52c41a" }} /></Col>
              <Col xs={12} sm={4}><Statistic title="P95 (ms)" value={latencyP95 != null ? latencyP95.toFixed(3) : "-"} valueStyle={{ color: "#faad14" }} /></Col>
              <Col xs={12} sm={4}><Statistic title="P99 (ms)" value={latencyP99 != null ? latencyP99.toFixed(3) : "-"} valueStyle={{ color: "#ff4d4f" }} /></Col>
              <Col xs={12} sm={4}><Statistic title="Min (ms)" value={latencyMin != null ? latencyMin.toFixed(3) : "-"} valueStyle={{ color: "#999" }} /></Col>
              <Col xs={12} sm={4}><Statistic title="Max (ms)" value={latencyMax != null ? latencyMax.toFixed(3) : "-"} valueStyle={{ color: "#999" }} /></Col>
            </Row>
          </Card>
        )}

        {/* Performance metrics */}
        {hasPerformanceData && (
          <Card title="性能指标" style={{ marginBottom: 16 }}>
            <Row gutter={24} align="middle">
              <Col xs={12} sm={6}>
                <Statistic title="吞吐量 (ops/sec)" value={throughput != null ? throughput.toFixed(1) : "-"}
                  prefix={<TrophyOutlined />} valueStyle={{ color: "#1890ff" }} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="GFLOPS" value={gflops != null ? gflops.toFixed(1) : "-"}
                  prefix={<ThunderboltOutlined />} valueStyle={{ color: "#722ed1" }} />
              </Col>
              {maxGflops != null && maxGflops !== gflops && (
                <Col xs={12} sm={6}>
                  <Statistic title="Max GFLOPS" value={maxGflops.toFixed(1)} valueStyle={{ color: "#eb2f96" }} />
                </Col>
              )}
              <Col xs={12} sm={6}>
                {cpuUtil != null ? (
                  <div>
                    <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>CPU 利用率</Text>
                    <Progress
                      percent={Math.min(Math.round(cpuUtil), 100)}
                      strokeColor={cpuUtil > 80 ? "#ff4d4f" : cpuUtil > 60 ? "#faad14" : "#52c41a"}
                      format={() => `${typeof cpuUtil === "number" ? cpuUtil.toFixed(1) : cpuUtil}%`}
                    />
                  </div>
                ) : <Statistic title="CPU 利用率" value="-" />}
              </Col>
            </Row>
          </Card>
        )}

        {/* Operator breakdown table */}
        {(details.length > 0 || operators.length > 0) && (
          <Card title={`算子详情 (${(details.length || operators.length)} 个)`} style={{ marginBottom: 16 }}>
            <Table
              dataSource={(details.length > 0 ? details : operators).map((d, i) => ({ ...d, key: i, name: d.name || d.operator || d.model || "unknown" }))}
              columns={operatorColumns}
              pagination={false}
              size="small"
              scroll={{ x: 900 }}
            />
          </Card>
        )}

        {/* Config info */}
        {m.config && (
          <Card title="评测配置" size="small">
            <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
              {m.config.matrix_size != null && <Descriptions.Item label="矩阵大小">{m.config.matrix_size}</Descriptions.Item>}
              {m.config.iterations != null && <Descriptions.Item label="迭代次数">{m.config.iterations}</Descriptions.Item>}
              {m.config.operator_filter && <Descriptions.Item label="算子过滤">{m.config.operator_filter}</Descriptions.Item>}
              {m.config.dtypes && <Descriptions.Item label="数据类型">{Array.isArray(m.config.dtypes) ? m.config.dtypes.join(", ") : m.config.dtypes}</Descriptions.Item>}
              {m.config.include_accuracy != null && <Descriptions.Item label="精度测试">{m.config.include_accuracy ? "是" : "否"}</Descriptions.Item>}
              {m.config.batch_size != null && <Descriptions.Item label="Batch Size">{m.config.batch_size}</Descriptions.Item>}
            </Descriptions>
          </Card>
        )}

        {/* No data at all */}
        {!hasLatencyData && !hasPerformanceData && details.length === 0 && operators.length === 0 && (
          <Alert
            message="缺少性能指标数据"
            description="评测结果中未包含可展示的性能指标。请查看「原因分析」标签了解详情，或查看「执行日志」获取原始输出。"
            type="warning"
            showIcon
          />
        )}
      </div>
    );
  };

  /* Tab 3: 原因分析 */
  const DiagnosisTab = () => {
    const issues = diagnoseResult(effectiveMetrics, rawData, result, task);
    const parsedRaw = safeParse(rawData);
    const evalFromRawData = extractEvalFromRawData(rawData);
    const logsFromRaw = parsedRaw?.logs;

    return (
      <div>
        {/* Diagnosis results */}
        <Card title={<Space><BugOutlined /> 诊断分析</Space>} style={{ marginBottom: 16 }}>
          {issues.length === 0 ? (
            <Alert message="未发现异常" type="success" showIcon />
          ) : (
            <div>
              {issues.map((issue, i) => (
                <Alert
                  key={i}
                  message={issue.message}
                  type={issue.type === "error" ? "error" : issue.type === "warning" ? "warning" : "info"}
                  showIcon
                  style={{ marginBottom: 8 }}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Raw eval result summary */}
        {evalFromRawData && (
          <Card title="原始评测结果摘要" style={{ marginBottom: 16 }}>
            <Descriptions column={2} size="small" bordered>
              {evalFromRawData.benchmark_name && (
                <Descriptions.Item label="基准测试">{evalFromRawData.benchmark_name}</Descriptions.Item>
              )}
              {evalFromRawData.benchmark_version && (
                <Descriptions.Item label="版本">{evalFromRawData.benchmark_version}</Descriptions.Item>
              )}
              {evalFromRawData.timestamp && (
                <Descriptions.Item label="执行时间">{evalFromRawData.timestamp}</Descriptions.Item>
              )}
              {evalFromRawData.conclusion && (
                <Descriptions.Item label="结论" span={2}>
                  <Text strong>{evalFromRawData.conclusion}</Text>
                </Descriptions.Item>
              )}
            </Descriptions>
            {evalFromRawData.system_info && (
              <div style={{ marginTop: 12 }}>
                <Text type="secondary" strong>系统信息：</Text>
                <div style={{ marginTop: 4 }}>
                  {Object.entries(evalFromRawData.system_info).map(([k, v]) => (
                    <Tag key={k} style={{ marginBottom: 4 }}>{k}: {String(v)}</Tag>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Runtime metrics */}
        {effectiveMetrics?.runtime && (
          <Card title="运行时资源使用" style={{ marginBottom: 16 }}>
            <Row gutter={24}>
              {effectiveMetrics.runtime.cpu_percent_avg != null && (
                <Col xs={12} sm={6}>
                  <Statistic title="CPU 平均使用率" value={effectiveMetrics.runtime.cpu_percent_avg} suffix="%" />
                </Col>
              )}
              {effectiveMetrics.runtime.cpu_percent_max != null && (
                <Col xs={12} sm={6}>
                  <Statistic title="CPU 峰值使用率" value={effectiveMetrics.runtime.cpu_percent_max} suffix="%" />
                </Col>
              )}
              {effectiveMetrics.runtime.memory_percent_avg != null && (
                <Col xs={12} sm={6}>
                  <Statistic title="内存平均使用率" value={effectiveMetrics.runtime.memory_percent_avg} suffix="%" />
                </Col>
              )}
              {effectiveMetrics.runtime.samples != null && (
                <Col xs={12} sm={6}>
                  <Statistic title="采样次数" value={effectiveMetrics.runtime.samples} />
                </Col>
              )}
            </Row>
          </Card>
        )}

        {/* Agent execution logs from raw_data */}
        {logsFromRaw && (
          <Collapse style={{ marginBottom: 16 }}>
            <Panel header={<Space><InfoCircleOutlined /> Agent 执行日志（原始输出）</Space>} key="agent-logs">
              <pre style={{
                background: "#1e1e1e", color: "#d4d4d4", padding: 12, borderRadius: 6,
                fontFamily: "'JetBrains Mono', Consolas, Monaco, 'Courier New', monospace",
                fontSize: 12, lineHeight: 1.6, maxHeight: 400, overflowY: "auto",
                margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>
                {typeof logsFromRaw === "string" ? logsFromRaw : JSON.stringify(logsFromRaw, null, 2)}
              </pre>
            </Panel>
          </Collapse>
        )}

        {/* Full raw_data JSON */}
        {rawData && (
          <Collapse>
            <Panel header={<Space><InfoCircleOutlined /> 完整原始数据 (raw_data)</Space>} key="raw-data">
              <pre style={{
                background: "#f5f5f5", padding: 12, borderRadius: 6,
                fontFamily: "'JetBrains Mono', Consolas, Monaco, 'Courier New', monospace",
                fontSize: 11, lineHeight: 1.5, maxHeight: 500, overflowY: "auto",
                margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(rawData), null, 2);
                  } catch (_) {
                    return rawData;
                  }
                })()}
              </pre>
            </Panel>
          </Collapse>
        )}
      </div>
    );
  };

  /* Tab 4: 执行日志 (增强 #173) */
  const LogTab = () => {
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
              else if (line.includes("[METRIC]")) color = "#1890ff";
              else if (line.includes("[EVAL]")) color = "#d3adf7";
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
    {
      key: "diagnosis",
      label: (
        <span>
          原因分析
          {result && !result.passed && <Badge dot offset={[6, -2]} />}
        </span>
      ),
      children: <DiagnosisTab />,
    },
    { key: "logs", label: "执行日志", children: <LogTab /> },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          {true {onBack &&{onBack && <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{ paddingLeft: 0 }}>返回</Button>}
          <Title level={4} style={{ margin: 0 }}>{task.testItem || task.name} — 评测结果</Title>
          <Badge status={statusInfo.color} text={statusInfo.text} />
        </Space>
      </div>
      <Tabs items={tabItems} defaultActiveKey={result && !result.passed ? "diagnosis" : "data"} />
    </div>
  );
}
