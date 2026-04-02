import React, { useState, useEffect, useMemo } from "react";
import { Card, Table, Tag, Space, Button, Row, Col, Select, Tabs, Descriptions, Modal, message, Tooltip, Badge, Progress, Statistic, Divider, Empty, Spin, Radio, DatePicker, Typography, Drawer, Alert } from "antd";
import { BarChartOutlined, LineChartOutlined, RadarChartOutlined, DotChartOutlined, HeatMapOutlined, PieChartOutlined, DownloadOutlined, CompressOutlined, EyeOutlined, FileTextOutlined, ShareAltOutlined, PrinterOutlined, ReloadOutlined, FilterOutlined, FullscreenOutlined, SwapOutlined, ExperimentOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, DesktopOutlined, InfoCircleOutlined } from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import api from "../utils/api";
import dayjs from "dayjs";
const { Text, Title, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const CHART_COLORS = ["#1890ff","#52c41a","#722ed1","#fa8c16","#eb2f96","#13c2c2","#faad14","#2f54eb","#a0d911","#f5222d"];

// ====== 详情页图表构建函数 ======

// 延迟柱状图 - 基于真实 metrics.results 数据
const buildDetailLatencyChart = (results) => {
  if (!results || results.length === 0) return null;
  const items = results.filter(r => r.avg_time_ms != null);
  return {
    title: { text: "推理延迟对比", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "axis", formatter: (params) => {
      let html = `<b>${params[0].name}</b><br/>`;
      params.forEach(p => { html += `${p.marker} ${p.seriesName}: ${p.value} ms<br/>`; });
      return html;
    }},
    xAxis: { type: "category", data: items.map(r => r.operator || r.name || "未知"), axisLabel: { rotate: items.length > 6 ? 30 : 0, fontSize: 11 } },
    yAxis: { type: "value", name: "延迟 (ms)" },
    series: [{
      name: "平均延迟",
      type: "bar",
      data: items.map(r => ({ value: r.avg_time_ms?.toFixed(2) || 0, itemStyle: { color: r.status === "FAIL" ? "#ff4d4f" : "#1890ff" } })),
      barWidth: "50%",
      label: { show: true, position: "top", fontSize: 10, formatter: "{c} ms" }
    }],
    grid: { bottom: 60, left: 60, right: 20, top: 50 }
  };
};

// 通过率饼图
const buildDetailPassRateChart = (summary) => {
  if (!summary) return null;
  return {
    title: { text: "测试通过率", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    series: [{
      type: "pie",
      radius: ["45%", "70%"],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
      data: [
        { value: summary.pass_count || 0, name: "通过", itemStyle: { color: "#52c41a" } },
        { value: summary.fail_count || 0, name: "失败", itemStyle: { color: "#ff4d4f" } }
      ],
      label: { show: true, formatter: "{b}\n{c}项 ({d}%)", fontSize: 12 },
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: "rgba(0,0,0,0.3)" } }
    }]
  };
};

// 延迟分布散点图
const buildDetailScatterChart = (results) => {
  if (!results || results.length === 0) return null;
  const items = results.filter(r => r.avg_time_ms != null);
  return {
    title: { text: "延迟 vs 迭代次数", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "item", formatter: (p) => `<b>${p.data[2]}</b><br/>延迟: ${p.data[0]} ms<br/>迭代: ${p.data[1]} 次<br/>状态: ${p.data[3]}` },
    xAxis: { type: "value", name: "平均延迟 (ms)" },
    yAxis: { type: "value", name: "迭代次数" },
    series: [{
      type: "scatter",
      data: items.map(r => [r.avg_time_ms || 0, r.iterations || 0, r.operator || r.name || "未知", r.status || "UNKNOWN"]),
      symbolSize: (d) => Math.max(12, Math.min(40, Math.sqrt(d[1]) * 3)),
      itemStyle: { color: (p) => p.data[3] === "FAIL" ? "#ff4d4f" : "#1890ff", opacity: 0.8 },
      label: { show: true, formatter: (p) => p.data[2], position: "top", fontSize: 10 }
    }],
    grid: { bottom: 40, left: 60, right: 20, top: 50 }
  };
};

// GPU/吞吐量柱状图 (for MODEL type)
const buildDetailThroughputChart = (results) => {
  if (!results || results.length === 0) return null;
  const items = results.filter(r => r.throughput_qps != null);
  if (items.length === 0) return null;
  return {
    title: { text: "吞吐量对比 (QPS)", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: items.map(r => r.operator || r.name || "未知"), axisLabel: { rotate: items.length > 6 ? 30 : 0 } },
    yAxis: { type: "value", name: "QPS" },
    series: [{
      name: "吞吐量",
      type: "bar",
      data: items.map(r => r.throughput_qps || 0),
      itemStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#1890ff" }, { offset: 1, color: "#722ed1" }] } },
      barWidth: "45%",
      label: { show: true, position: "top", fontSize: 10, formatter: "{c} QPS" }
    }],
    grid: { bottom: 40, left: 60, right: 20, top: 50 }
  };
};

// GPU 资源使用图
const buildDetailGpuChart = (results) => {
  if (!results || results.length === 0) return null;
  const items = results.filter(r => r.gpu_util_pct != null || r.gpu_memory_mb != null);
  if (items.length === 0) return null;
  return {
    title: { text: "GPU 资源使用", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "axis" },
    legend: { data: ["GPU 利用率 (%)", "显存 (MB)"], bottom: 0 },
    xAxis: { type: "category", data: items.map(r => r.operator || r.name || "未知") },
    yAxis: [
      { type: "value", name: "利用率 (%)", max: 100 },
      { type: "value", name: "显存 (MB)" }
    ],
    series: [
      { name: "GPU 利用率 (%)", type: "bar", data: items.map(r => r.gpu_util_pct || 0), itemStyle: { color: "#722ed1" }, barWidth: "30%" },
      { name: "显存 (MB)", type: "line", yAxisIndex: 1, data: items.map(r => r.gpu_memory_mb || 0), itemStyle: { color: "#fa8c16" }, lineStyle: { width: 2 }, symbol: "circle", symbolSize: 8 }
    ],
    grid: { bottom: 40, left: 60, right: 60, top: 50 }
  };
};

// 雷达图 - 多维度对比
const buildDetailRadarChart = (results) => {
  if (!results || results.length < 2) return null;
  const hasGpu = results.some(r => r.gpu_util_pct != null);
  const hasThroughput = results.some(r => r.throughput_qps != null);
  
  const maxLatency = Math.max(...results.map(r => r.avg_time_ms || 0));
  const maxThroughput = Math.max(...results.map(r => r.throughput_qps || 1));
  const maxIter = Math.max(...results.map(r => r.iterations || 1));
  
  const indicators = [
    { name: "速度", max: 100, min: 0 },
    { name: "迭代次数", max: maxIter * 1.2 || 100 },
  ];
  if (hasThroughput) indicators.push({ name: "吞吐量", max: maxThroughput * 1.2 || 100 });
  if (hasGpu) indicators.push({ name: "GPU利用率", max: 100 });

  return {
    title: { text: "多维性能雷达图", left: "center", textStyle: { fontSize: 14 } },
    tooltip: {},
    legend: { data: results.slice(0, 4).map(r => r.operator || r.name || "未知"), bottom: 0 },
    radar: { indicator: indicators, radius: "55%" },
    series: [{
      type: "radar",
      data: results.slice(0, 4).map((r, i) => {
        const values = [
          maxLatency > 0 ? Math.round((1 - (r.avg_time_ms || 0) / maxLatency) * 100) : 50,
          r.iterations || 0,
        ];
        if (hasThroughput) values.push(r.throughput_qps || 0);
        if (hasGpu) values.push(r.gpu_util_pct || 0);
        return {
          value: values,
          name: r.operator || r.name || "未知",
          lineStyle: { color: CHART_COLORS[i] },
          areaStyle: { color: CHART_COLORS[i], opacity: 0.1 }
        };
      })
    }]
  };
};

// ====== 解析列表中每条报告的 metrics JSON ======
const parseReportMetrics = (report) => {
  let metrics = report.metrics;
  if (!metrics) return {};
  if (typeof metrics === "string") {
    try { metrics = JSON.parse(metrics); } catch(e) { return {}; }
  }
  const summary = metrics.summary || {};
  const results = Array.isArray(metrics.results) ? metrics.results : [];
  // Compute real aggregated values from results
  const latencies = results.filter(r => r.latency_ms_mean != null).map(r => r.latency_ms_mean);
  const p95s = results.filter(r => r.latency_ms_p95 != null).map(r => r.latency_ms_p95);
  const p99s = results.filter(r => r.latency_ms_p99 != null).map(r => r.latency_ms_p99);
  const throughputs = results.filter(r => r.throughput_ops != null).map(r => r.throughput_ops);
  return {
    avgLatency: summary.avg_latency_ms || (latencies.length > 0 ? latencies.reduce((a,b)=>a+b,0)/latencies.length : null),
    avgP95: p95s.length > 0 ? p95s.reduce((a,b)=>a+b,0)/p95s.length : null,
    avgP99: p99s.length > 0 ? p99s.reduce((a,b)=>a+b,0)/p99s.length : null,
    avgThroughput: throughputs.length > 0 ? throughputs.reduce((a,b)=>a+b,0)/throughputs.length : null,
    passRate: summary.pass_rate != null ? summary.pass_rate : null,
    totalOps: summary.total_operators || 0,
    passed: summary.passed || 0,
    failed: summary.failed || 0,
    results: results,
  };
};

// ====== 列表图表构建（基于真实 metrics 数据）======

const buildLatencyChart = (data) => {
  const items = data.filter(d => d._metrics && d._metrics.avgLatency != null);
  if (items.length === 0) return { title: { text: "推理延迟分布", left: "center", textStyle: { fontSize: 14 } }, xAxis: { type: "category", data: [] }, yAxis: { type: "value" }, series: [] };
  return {
    title: { text: "推理延迟分布（平均值）", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "axis" },
    legend: { data: ["平均延迟", "P95", "P99"], bottom: 0 },
    xAxis: { type: "category", data: items.map(d => d.name || d.title || "未知"), axisLabel: { rotate: items.length > 4 ? 15 : 0 } },
    yAxis: { type: "value", name: "延迟(ms)" },
    series: [
      { name: "平均延迟", type: "bar", data: items.map(d => (d._metrics.avgLatency || 0).toFixed(1)), itemStyle: { color: CHART_COLORS[0] } },
      { name: "P95", type: "bar", data: items.map(d => (d._metrics.avgP95 || 0).toFixed(1)), itemStyle: { color: CHART_COLORS[1] } },
      { name: "P99", type: "bar", data: items.map(d => (d._metrics.avgP99 || 0).toFixed(1)), itemStyle: { color: CHART_COLORS[2] } },
    ],
  };
};
const buildThroughputChart = (data) => {
  const items = data.filter(d => d._metrics && d._metrics.avgThroughput != null);
  if (items.length === 0) return { title: { text: "吞吐量对比", left: "center", textStyle: { fontSize: 14 } }, xAxis: { type: "category", data: [] }, yAxis: { type: "value" }, series: [] };
  return {
    title: { text: "平均吞吐量对比", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: items.map(d => d.name || d.title || "未知"), axisLabel: { rotate: items.length > 4 ? 15 : 0 } },
    yAxis: { type: "value", name: "吞吐量(ops/s)" },
    series: [{ type: "bar", data: items.map(d => (d._metrics.avgThroughput || 0).toFixed(0)), itemStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "#1890ff" }, { offset: 1, color: "#722ed1" }] } }, barWidth: "40%" }],
  };
};
const buildRadarChart = (data) => {
  const items = data.filter(d => d._metrics && d._metrics.avgLatency != null).slice(0, 5);
  if (items.length < 2) return { title: { text: "多维性能雷达图", left: "center", textStyle: { fontSize: 14 } }, radar: { indicator: [] }, series: [] };
  const maxLat = Math.max(...items.map(d => d._metrics.avgLatency || 1));
  const maxThroughput = Math.max(...items.map(d => d._metrics.avgThroughput || 1));
  const indicators = [
    { name: "速度(越高越快)", max: 100 },
    { name: "吞吐量", max: maxThroughput * 1.2 || 100 },
    { name: "通过率", max: 100 },
    { name: "测试项数", max: Math.max(...items.map(d => d._metrics.totalOps || 1)) * 1.2 || 20 },
  ];
  return {
    title: { text: "多维性能雷达图", left: "center", textStyle: { fontSize: 14 } },
    tooltip: {},
    legend: { data: items.map(d => d.name || d.title || "未知"), bottom: 0 },
    radar: { indicator: indicators, radius: "60%" },
    series: [{ type: "radar", data: items.map((d, i) => ({
      value: [
        maxLat > 0 ? Math.round((1 - (d._metrics.avgLatency || 0) / maxLat) * 100) : 50,
        d._metrics.avgThroughput || 0,
        d._metrics.passRate != null ? d._metrics.passRate : 0,
        d._metrics.totalOps || 0,
      ],
      name: d.name || d.title || "未知",
      lineStyle: { color: CHART_COLORS[i] },
      areaStyle: { color: CHART_COLORS[i], opacity: 0.1 }
    })) }],
  };
};
const buildScatterChart = (data) => {
  const items = data.filter(d => d._metrics && d._metrics.avgP95 != null && d._metrics.avgThroughput != null);
  if (items.length === 0) return { title: { text: "延迟-吞吐量分布", left: "center", textStyle: { fontSize: 14 } }, xAxis: { type: "value" }, yAxis: { type: "value" }, series: [] };
  return {
    title: { text: "延迟-吞吐量分布", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "item", formatter: p => `${p.data[2]}<br/>P95延迟: ${p.data[0].toFixed(1)}ms<br/>吞吐: ${p.data[1].toFixed(0)} ops/s` },
    xAxis: { type: "value", name: "平均P95延迟(ms)" },
    yAxis: { type: "value", name: "平均吞吐量(ops/s)" },
    series: [{ type: "scatter", data: items.map(d => [d._metrics.avgP95 || 0, d._metrics.avgThroughput || 0, d.name || d.title || "未知"]), symbolSize: d => Math.max(10, Math.sqrt(d[1]) * 2), itemStyle: { color: CHART_COLORS[0], opacity: 0.7 }, label: { show: true, formatter: p => p.data[2], position: "top", fontSize: 10 } }],
  };
};
const buildHeatmapChart = (data) => {
  const items = data.filter(d => d._metrics && d._metrics.avgLatency != null);
  if (items.length === 0) return { title: { text: "性能热力图", left: "center", textStyle: { fontSize: 14 } }, xAxis: { type: "category", data: [] }, yAxis: { type: "category", data: [] }, series: [] };
  const metrics = ["延迟评分", "吞吐量评分", "通过率"];
  const maxLat = Math.max(...items.map(d => d._metrics.avgLatency || 1));
  const maxThr = Math.max(...items.map(d => d._metrics.avgThroughput || 1));
  const heatData = [];
  items.forEach((d, i) => {
    const latScore = maxLat > 0 ? Math.round((1 - (d._metrics.avgLatency || 0) / maxLat) * 100) : 0;
    const thrScore = maxThr > 0 ? Math.round(((d._metrics.avgThroughput || 0) / maxThr) * 100) : 0;
    const passScore = d._metrics.passRate != null ? Math.round(d._metrics.passRate) : 0;
    [latScore, thrScore, passScore].forEach((v, j) => { heatData.push([j, i, v]); });
  });
  return {
    title: { text: "性能热力图", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { formatter: p => `${items[p.data[1]]?.name || items[p.data[1]]?.title || ""}<br/>${metrics[p.data[0]]}: ${p.data[2]}%` },
    xAxis: { type: "category", data: metrics },
    yAxis: { type: "category", data: items.map(d => d.name || d.title || "未知") },
    visualMap: { min: 0, max: 100, calculable: true, orient: "horizontal", left: "center", bottom: 0, inRange: { color: ["#f5f5f5", "#bae7ff", "#1890ff", "#003a8c"] } },
    series: [{ type: "heatmap", data: heatData, label: { show: true, fontSize: 10 }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.5)" } } }],
  };
};
const buildTrendChart = (data) => {
  // 按创建时间排序展示各报告的延迟趋势
  const sorted = [...data].filter(d => d._metrics && d._metrics.avgLatency != null && d.createdAt).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (sorted.length === 0) return { title: { text: "延迟趋势", left: "center", textStyle: { fontSize: 14 } }, xAxis: { type: "category", data: [] }, yAxis: { type: "value" }, series: [] };
  const labels = sorted.map(d => dayjs(d.createdAt).format("MM-DD HH:mm"));
  return {
    title: { text: "延迟趋势（按报告时间）", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "axis" },
    legend: { data: ["平均延迟", "P95延迟"], bottom: 0 },
    xAxis: { type: "category", data: labels, axisLabel: { rotate: 30, fontSize: 10 } },
    yAxis: [{ type: "value", name: "延迟(ms)" }],
    series: [
      { name: "平均延迟", type: "line", smooth: true, data: sorted.map(d => (d._metrics.avgLatency || 0).toFixed(1)), itemStyle: { color: CHART_COLORS[0] } },
      { name: "P95延迟", type: "line", smooth: true, data: sorted.map(d => (d._metrics.avgP95 || 0).toFixed(1)), itemStyle: { color: CHART_COLORS[4] }, areaStyle: { opacity: 0.1 } },
    ],
  };
};
const buildPieChart = (data) => ({
  title: { text: "评测类型分布", left: "center", textStyle: { fontSize: 14 } },
  tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
  legend: { bottom: 0 },
  series: [{ type: "pie", radius: ["40%", "65%"], avoidLabelOverlap: true, itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
    data: [...new Set(data.map(d => d.evalType || "GENERAL"))].map((c, i) => ({ value: data.filter(d => (d.evalType || "GENERAL") === c).length, name: c, itemStyle: { color: CHART_COLORS[i] } })),
    label: { show: true, formatter: "{b}\n{d}%" } }],
});

// ====== 提取 metrics 辅助函数 ======
function extractMetrics(reportDetail) {
  const m = reportDetail.metrics;
  if (!m || typeof m !== "object") return {};

  return {
    summary: m.summary || null,
    results: Array.isArray(m.results) ? m.results : [],
    environment: m.environment || null,
    conclusion: m.conclusion || null,
    performanceSummary: m.performance_summary || null,
  };
}

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reportStats, setReportStats] = useState({});
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportDetail, setReportDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [chartType, setChartType] = useState("bar");
  const [detailVisible, setDetailVisible] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const r = await api.get("/reports", { params: { size: 100 } });
      if (r.data.code === 0) {
        const data = (r.data.data || []).map(report => ({
          ...report,
          name: report.title || "未命名报告",
          _metrics: parseReportMetrics(report),
        }));
        setReports(data);
      }
    } catch(e) { message.error("获取报告列表失败"); }
    finally { setLoading(false); }
  };

  const fetchStats = async () => {
    try { const r = await api.get("/reports/stats"); if(r.data.code===0) setReportStats(r.data.data); } catch(e){}
  };

  const fetchReportDetail = async (id) => {
    setDetailLoading(true);
    try {
      const r = await api.get(`/reports/${id}`);
      if (r.data.code === 0) {
        const detail = r.data.data;
        // metrics 可能已经是对象（详情API解析了），也可能是字符串（兼容）
        if (detail.metrics && typeof detail.metrics === "string") {
          try { detail.metrics = JSON.parse(detail.metrics); } catch(e) {}
        }
        setReportDetail(detail);
      }
    } catch(e) { message.error("获取报告详情失败"); }
    finally { setDetailLoading(false); }
  };

  useEffect(() => { fetchReports(); fetchStats(); }, []);

  const compareData = useMemo(() => compareIds.length > 0 ? reports.filter(r => compareIds.includes(r.id)) : reports, [reports, compareIds]);

  const handleExport = (format) => { message.success(`报告导出为 ${format} 格式（功能开发中）`); };

  const openDetail = (record) => {
    setSelectedReport(record);
    setDetailVisible(true);
    setReportDetail(null);
    fetchReportDetail(record.id);
  };

  const columns = [
    { title: "报告编号", dataIndex: "reportNo", width: 180, ellipsis: true },
    { title: "标题", dataIndex: "title", width: 220, ellipsis: true, render: (v, r) => <a onClick={() => openDetail(r)} style={{ cursor: "pointer" }}>{v}</a> },
    { title: "评测类型", dataIndex: "evalType", width: 100, render: v => {
      const colorMap = { OPERATOR: "blue", MODEL: "purple", GENERAL: "cyan", PERFORMANCE: "green" };
      return <Tag color={colorMap[v] || "default"}>{v || "-"}</Tag>;
    }},
    { title: "状态", dataIndex: "status", width: 100, render: v => {
      const map = { PUBLISHED: { s: "success", t: "已发布" }, REVIEWING: { s: "processing", t: "审核中" }, DRAFT: { s: "default", t: "草稿" } };
      const cfg = map[v] || { s: "default", t: v || "-" };
      return <Badge status={cfg.s} text={cfg.t}/>;
    }},
    { title: "评分", dataIndex: "score", width: 80, render: v => v != null ? <Text style={{ color: v > 80 ? "#52c41a" : v > 60 ? "#1890ff" : "#fa8c16", fontWeight: "bold" }}>{(typeof v === "number" ? v.toFixed(1) : v)}%</Text> : "-" },
    { title: "关联任务", dataIndex: "taskId", width: 90, render: v => v ? <Tag>任务#{v}</Tag> : "-" },
    { title: "创建时间", dataIndex: "createdAt", width: 160, render: v => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-", sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt) },
    { title: "操作", key: "action", width: 150, render: (_, r) => (
      <Space>
        <Button type="link" size="small" icon={<EyeOutlined/>} onClick={() => openDetail(r)}>详情</Button>
        <Button type="link" size="small" icon={<DownloadOutlined/>} onClick={() => handleExport("PDF")}>导出</Button>
      </Space>
    )},
  ];

  // ====== 渲染报告详情页 ======
  const renderReportDetail = () => {
    if (!reportDetail) return <Spin tip="加载中..." />;
    const { summary, results, environment, conclusion, performanceSummary } = extractMetrics(reportDetail);
    const hasRealData = results.length > 0 || summary != null;
    const passRate = summary?.pass_rate != null ? summary.pass_rate : null;
    const hasGpuData = results.some(r => r.gpu_util_pct != null || r.gpu_memory_mb != null);
    const hasThroughputData = results.some(r => r.throughput_qps != null);

    return (
      <Tabs defaultActiveKey="overview" items={[
        // ====== Tab 1: 概览 ======
        { key: "overview", label: <span><FileTextOutlined /> 概览</span>, children: (
          <div>
            {/* 评分与关键指标 */}
            <Row gutter={16} style={{ marginBottom: 20 }}>
              <Col span={6}>
                <Card size="small" style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 36, fontWeight: "bold", color: reportDetail.score > 80 ? "#52c41a" : reportDetail.score > 60 ? "#1890ff" : "#fa8c16" }}>
                    {reportDetail.score != null ? `${reportDetail.score}` : "-"}
                  </div>
                  <Text type="secondary">综合评分</Text>
                  {reportDetail.score != null && <Progress percent={reportDetail.score} showInfo={false} strokeColor={reportDetail.score > 80 ? "#52c41a" : reportDetail.score > 60 ? "#1890ff" : "#fa8c16"} size="small" style={{ marginTop: 8 }} />}
                </Card>
              </Col>
              {summary && <>
                <Col span={4}><Card size="small"><Statistic title="总测试项" value={summary.total_operators || 0} prefix={<ExperimentOutlined style={{ color: "#1890ff" }} />} /></Card></Col>
                <Col span={4}><Card size="small"><Statistic title="通过" value={summary.pass_count || 0} valueStyle={{ color: "#52c41a" }} prefix={<CheckCircleOutlined />} /></Card></Col>
                <Col span={4}><Card size="small"><Statistic title="失败" value={summary.fail_count || 0} valueStyle={{ color: (summary.fail_count || 0) > 0 ? "#ff4d4f" : "#52c41a" }} prefix={<CloseCircleOutlined />} /></Card></Col>
                <Col span={6}><Card size="small"><Statistic title="通过率" value={passRate != null ? `${(passRate * 100).toFixed(1)}%` : "-"} valueStyle={{ color: passRate > 0.8 ? "#52c41a" : passRate > 0.6 ? "#1890ff" : "#fa8c16" }} />
                  {passRate != null && <Progress percent={Math.round(passRate * 100)} showInfo={false} strokeColor={passRate > 0.8 ? "#52c41a" : passRate > 0.6 ? "#1890ff" : "#fa8c16"} size="small" style={{ marginTop: 4 }} />}
                </Card></Col>
              </>}
            </Row>

            {/* 基本信息 */}
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="报告编号"><Text copyable>{reportDetail.reportNo}</Text></Descriptions.Item>
              <Descriptions.Item label="标题">{reportDetail.title}</Descriptions.Item>
              <Descriptions.Item label="评测类型"><Tag color="blue">{reportDetail.evalType || "-"}</Tag></Descriptions.Item>
              <Descriptions.Item label="状态">
                <Badge status={reportDetail.status === "PUBLISHED" ? "success" : reportDetail.status === "REVIEWING" ? "processing" : "default"}
                  text={reportDetail.status === "PUBLISHED" ? "已发布" : reportDetail.status === "REVIEWING" ? "审核中" : reportDetail.status === "DRAFT" ? "草稿" : reportDetail.status} />
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{reportDetail.createdAt ? dayjs(reportDetail.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Descriptions.Item>
              <Descriptions.Item label="发布时间">{reportDetail.publishedAt ? dayjs(reportDetail.publishedAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Descriptions.Item>
              <Descriptions.Item label="摘要" span={2}><Paragraph ellipsis={{ rows: 3, expandable: true }}>{reportDetail.summary || "-"}</Paragraph></Descriptions.Item>
            </Descriptions>

            {/* 关联任务 */}
            {reportDetail.task && (
              <Card size="small" title={<span><InfoCircleOutlined style={{ marginRight: 8 }} />关联任务信息</span>} style={{ marginBottom: 16 }}>
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="任务编号">{reportDetail.task.taskNo}</Descriptions.Item>
                  <Descriptions.Item label="任务名称">{reportDetail.task.name}</Descriptions.Item>
                  <Descriptions.Item label="评测对象">{reportDetail.task.targetModel || "-"}</Descriptions.Item>
                  <Descriptions.Item label="评测类型"><Tag>{reportDetail.task.evalType || "-"}</Tag> / <Tag>{reportDetail.task.evalObject || "-"}</Tag></Descriptions.Item>
                  <Descriptions.Item label="任务状态">
                    <Badge status={reportDetail.task.status === "COMPLETED" ? "success" : reportDetail.task.status === "RUNNING" ? "processing" : reportDetail.task.status === "FAILED" ? "error" : "default"} text={reportDetail.task.status} />
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            {/* 评测结论 */}
            {conclusion && (
              <Card size="small" title="评测结论" style={{ marginBottom: 16, borderLeft: `3px solid ${passRate > 0.8 ? "#52c41a" : passRate > 0.6 ? "#1890ff" : "#fa8c16"}` }}>
                <Paragraph style={{ fontSize: 14, lineHeight: 1.8, margin: 0 }}>{conclusion}</Paragraph>
              </Card>
            )}
          </div>
        )},

        // ====== Tab 2: 测试结果 ======
        { key: "results", label: <span><ExperimentOutlined /> 测试结果</span>, children: (
          <div>
            {results.length > 0 ? (
              <>
                {summary && (
                  <Row gutter={[16, 8]} style={{ marginBottom: 16 }}>
                    <Col span={6}><Statistic title="总测试项" value={summary.total_operators || 0} /></Col>
                    <Col span={6}><Statistic title="平均延迟" value={`${summary.avg_latency_ms?.toFixed(2) || "-"} ms`} /></Col>
                    {summary.total_test_cases && <Col span={6}><Statistic title="总测试用例" value={summary.total_test_cases} /></Col>}
                    {performanceSummary && <Col span={6}><Statistic title="中位延迟" value={`${performanceSummary.median_latency_ms?.toFixed(2) || "-"} ms`} /></Col>}
                  </Row>
                )}

                <Table
                  size="small"
                  dataSource={results}
                  rowKey={(r, i) => `${r.operator || r.name}-${i}`}
                  pagination={results.length > 20 ? { pageSize: 20, showTotal: t => `共 ${t} 项` } : false}
                  scroll={{ x: "max-content" }}
                  columns={[
                    {
                      title: "序号", width: 50, render: (_, __, i) => i + 1, align: "center"
                    },
                    {
                      title: "测试项", dataIndex: "operator", key: "operator", width: 140,
                      render: (v, r) => <Text strong>{v || r.name || "未知"}</Text>
                    },
                    {
                      title: "状态", dataIndex: "status", key: "status", width: 80, align: "center",
                      render: v => <Tag color={v === "PASS" ? "green" : v === "FAIL" ? "red" : "orange"} icon={v === "PASS" ? <CheckCircleOutlined /> : v === "FAIL" ? <CloseCircleOutlined /> : <ClockCircleOutlined />}>{v === "PASS" ? "通过" : v === "FAIL" ? "失败" : v}</Tag>,
                      filters: [{ text: "通过", value: "PASS" }, { text: "失败", value: "FAIL" }],
                      onFilter: (val, r) => r.status === val,
                    },
                    {
                      title: "平均延迟 (ms)", dataIndex: "avg_time_ms", key: "latency", width: 120, align: "right",
                      render: v => v != null ? <Text style={{ color: v > 50 ? "#fa8c16" : v > 20 ? "#1890ff" : "#52c41a", fontWeight: 500 }}>{v.toFixed(2)}</Text> : <Text type="secondary">-</Text>,
                      sorter: (a, b) => (a.avg_time_ms || 0) - (b.avg_time_ms || 0),
                    },
                    {
                      title: "输入形状", dataIndex: "input_shape", key: "shape", width: 160,
                      render: v => v ? <Text code style={{ fontSize: 11 }}>{JSON.stringify(v)}</Text> : "-"
                    },
                    ...(hasThroughputData ? [{
                      title: "吞吐量 (QPS)", dataIndex: "throughput_qps", key: "throughput", width: 120, align: "right",
                      render: v => v != null ? <Text style={{ fontWeight: 500 }}>{v.toFixed(1)}</Text> : "-",
                      sorter: (a, b) => (a.throughput_qps || 0) - (b.throughput_qps || 0),
                    }] : []),
                    ...(hasGpuData ? [
                      { title: "GPU利用率", dataIndex: "gpu_util_pct", key: "gpu", width: 100, align: "right", render: v => v != null ? `${v}%` : "-" },
                      { title: "显存 (MB)", dataIndex: "gpu_memory_mb", key: "mem", width: 100, align: "right", render: v => v != null ? v.toLocaleString() : "-" },
                    ] : []),
                    {
                      title: "精度偏差", dataIndex: "max_diff", key: "diff", width: 100, align: "right",
                      render: v => v != null ? (v === 0 ? <Text style={{ color: "#52c41a" }}>0</Text> : <Text>{v < 0.001 ? v.toExponential(1) : v.toFixed(4)}</Text>) : "-"
                    },
                    {
                      title: "迭代次数", dataIndex: "iterations", key: "iter", width: 80, align: "right",
                      render: v => v || "-"
                    },
                    {
                      title: "错误信息", dataIndex: "error", key: "error", width: 200, ellipsis: true,
                      render: v => v ? <Tooltip title={v}><Text type="danger" ellipsis>{v}</Text></Tooltip> : <Text type="secondary">-</Text>
                    },
                  ]}
                  rowClassName={(r) => r.status === "FAIL" ? "ant-table-row-fail" : ""}
                  summary={() => summary ? (
                    <Table.Summary fixed>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={2}><Text strong>汇总</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="center">
                          <Text style={{ color: "#52c41a" }}>{summary.pass_count || 0}</Text> / <Text style={{ color: "#ff4d4f" }}>{summary.fail_count || 0}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right">
                          <Text strong>avg: {summary.avg_latency_ms?.toFixed(2) || "-"} ms</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={4} colSpan={10}><Text>通过率: <Text strong style={{ color: passRate > 0.8 ? "#52c41a" : "#fa8c16" }}>{passRate != null ? `${(passRate * 100).toFixed(1)}%` : "-"}</Text></Text></Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  ) : null}
                />
              </>
            ) : <Empty description="暂无测试结果数据" />}
          </div>
        )},

        // ====== Tab 3: 性能图表 ======
        { key: "charts", label: <span><BarChartOutlined /> 性能图表</span>, children: (
          <div>
            {results.length > 0 ? (
              <>
                {/* 第一行：延迟柱状图 + 通过率饼图 */}
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={14}>
                    {buildDetailLatencyChart(results) && <Card size="small"><ReactECharts option={buildDetailLatencyChart(results)} style={{ height: 340 }} /></Card>}
                  </Col>
                  <Col span={10}>
                    {buildDetailPassRateChart(summary) && <Card size="small"><ReactECharts option={buildDetailPassRateChart(summary)} style={{ height: 340 }} /></Card>}
                  </Col>
                </Row>

                {/* 第二行：吞吐量 + GPU资源（如有）或 散点图 + 雷达图 */}
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  {hasThroughputData ? (
                    <>
                      <Col span={12}>
                        {buildDetailThroughputChart(results) && <Card size="small"><ReactECharts option={buildDetailThroughputChart(results)} style={{ height: 340 }} /></Card>}
                      </Col>
                      <Col span={12}>
                        {hasGpuData && buildDetailGpuChart(results) ? (
                          <Card size="small"><ReactECharts option={buildDetailGpuChart(results)} style={{ height: 340 }} /></Card>
                        ) : buildDetailRadarChart(results) ? (
                          <Card size="small"><ReactECharts option={buildDetailRadarChart(results)} style={{ height: 340 }} /></Card>
                        ) : null}
                      </Col>
                    </>
                  ) : (
                    <>
                      <Col span={12}>
                        {buildDetailScatterChart(results) && <Card size="small"><ReactECharts option={buildDetailScatterChart(results)} style={{ height: 340 }} /></Card>}
                      </Col>
                      <Col span={12}>
                        {buildDetailRadarChart(results) && <Card size="small"><ReactECharts option={buildDetailRadarChart(results)} style={{ height: 340 }} /></Card>}
                      </Col>
                    </>
                  )}
                </Row>

                {/* GPU 数据有额外图表 */}
                {hasGpuData && hasThroughputData && buildDetailRadarChart(results) && (
                  <Row gutter={16}>
                    <Col span={12}>
                      {buildDetailScatterChart(results) && <Card size="small"><ReactECharts option={buildDetailScatterChart(results)} style={{ height: 340 }} /></Card>}
                    </Col>
                    <Col span={12}>
                      <Card size="small"><ReactECharts option={buildDetailRadarChart(results)} style={{ height: 340 }} /></Card>
                    </Col>
                  </Row>
                )}
              </>
            ) : <Empty description="暂无性能数据可供图表展示" />}
          </div>
        )},

        // ====== Tab 4: 系统信息 ======
        { key: "system", label: <span><DesktopOutlined /> 系统信息</span>, children: (
          <div>
            {environment ? (
              <Card size="small">
                <Descriptions bordered column={2} size="small" title="评测环境">
                  <Descriptions.Item label="操作系统">{environment.os || "-"}</Descriptions.Item>
                  <Descriptions.Item label="CPU">{environment.cpu || "-"}</Descriptions.Item>
                  <Descriptions.Item label="内存">{environment.memory || "-"}</Descriptions.Item>
                  <Descriptions.Item label="运行设备">{environment.device || "-"}</Descriptions.Item>
                  {environment.gpu && <Descriptions.Item label="GPU">{environment.gpu}</Descriptions.Item>}
                  <Descriptions.Item label="Python 版本">{environment.python || "-"}</Descriptions.Item>
                  <Descriptions.Item label="推理框架">{environment.framework || "-"}</Descriptions.Item>
                  {environment.cuda && <Descriptions.Item label="CUDA 版本">{environment.cuda}</Descriptions.Item>}
                </Descriptions>

                {performanceSummary && (
                  <div style={{ marginTop: 16 }}>
                    <Divider orientation="left">性能摘要</Divider>
                    <Row gutter={16}>
                      {performanceSummary.fastest_op && (
                        <Col span={8}>
                          <Statistic title="最快算子" value={performanceSummary.fastest_op.name} suffix={<Text type="secondary" style={{ fontSize: 12 }}>({performanceSummary.fastest_op.latency_ms} ms)</Text>} valueStyle={{ fontSize: 16, color: "#52c41a" }} />
                        </Col>
                      )}
                      {performanceSummary.slowest_op && (
                        <Col span={8}>
                          <Statistic title="最慢算子" value={performanceSummary.slowest_op.name} suffix={<Text type="secondary" style={{ fontSize: 12 }}>({performanceSummary.slowest_op.latency_ms} ms)</Text>} valueStyle={{ fontSize: 16, color: "#fa8c16" }} />
                        </Col>
                      )}
                      {performanceSummary.median_latency_ms != null && (
                        <Col span={8}><Statistic title="中位延迟" value={`${performanceSummary.median_latency_ms} ms`} /></Col>
                      )}
                      {performanceSummary.avg_gpu_util_pct != null && (
                        <Col span={8}><Statistic title="平均 GPU 利用率" value={`${performanceSummary.avg_gpu_util_pct.toFixed(1)}%`} /></Col>
                      )}
                      {performanceSummary.total_gpu_memory_mb != null && (
                        <Col span={8}><Statistic title="总显存使用" value={`${performanceSummary.total_gpu_memory_mb} MB`} /></Col>
                      )}
                    </Row>
                  </div>
                )}
              </Card>
            ) : <Empty description="暂无系统信息" />}

            {/* 执行记录 */}
            {reportDetail.executions && reportDetail.executions.length > 0 && (
              <Card size="small" title="执行记录" style={{ marginTop: 16 }}>
                <Table size="small" dataSource={reportDetail.executions} rowKey="id" pagination={false}
                  columns={[
                    { title: "执行ID", dataIndex: "id", width: 80 },
                    { title: "节点ID", dataIndex: "nodeId", width: 80 },
                    { title: "状态", dataIndex: "status", width: 100, render: v => <Badge status={v === "COMPLETED" ? "success" : v === "FAILED" ? "error" : "processing"} text={v} /> },
                    { title: "耗时", dataIndex: "durationSec", width: 100, render: v => v != null ? `${v.toFixed(1)}s` : "-" },
                    { title: "开始时间", dataIndex: "startedAt", width: 180, render: v => v ? dayjs(v).format("YYYY-MM-DD HH:mm:ss") : "-" },
                    { title: "完成时间", dataIndex: "completedAt", width: 180, render: v => v ? dayjs(v).format("YYYY-MM-DD HH:mm:ss") : "-" },
                  ]}
                  expandable={{
                    expandedRowRender: (r) => (
                      <div>
                        {r.logs && (
                          <div style={{ background: "#1e1e1e", color: "#d4d4d4", padding: 12, borderRadius: 6, maxHeight: 300, overflow: "auto", fontFamily: "monospace", fontSize: 11, whiteSpace: "pre-wrap" }}>
                            {r.logs}
                          </div>
                        )}
                        {r.result && (
                          <div style={{ marginTop: 8 }}>
                            <Text type="secondary">执行结果：</Text>
                            <pre style={{ background: "#f5f5f5", padding: 8, borderRadius: 4, maxHeight: 200, overflow: "auto", fontSize: 11 }}>
                              {typeof r.result === "object" ? JSON.stringify(r.result, null, 2) : r.result}
                            </pre>
                          </div>
                        )}
                        {!r.logs && !r.result && <Text type="secondary">无详细日志</Text>}
                      </div>
                    ),
                    rowExpandable: (r) => !!(r.logs || r.result),
                  }}
                />
              </Card>
            )}
          </div>
        )},

        // ====== Tab 5: 结论与导出 ======
        { key: "conclusion", label: <span><FileTextOutlined /> 结论</span>, children: (
          <div>
            <Card style={{ background: hasRealData && passRate > 0.8 ? "#f6ffed" : hasRealData ? "#fffbe6" : "#f5f5f5", border: hasRealData && passRate > 0.8 ? "1px solid #b7eb8f" : hasRealData ? "1px solid #ffe58f" : "1px solid #d9d9d9", marginBottom: 16 }}>
              <Title level={5} style={{ color: hasRealData && passRate > 0.8 ? "#389e0d" : hasRealData ? "#d48806" : "#595959" }}>
                {hasRealData ? "评测结论" : "暂无评测数据"}
              </Title>
              <Paragraph style={{ fontSize: 14, lineHeight: 2, margin: 0 }}>
                {conclusion || reportDetail.summary || "评测已完成，详细结论请查看各项指标数据。"}
              </Paragraph>
            </Card>

            {/* 关键发现 */}
            {results.length > 0 && (
              <Card size="small" title="关键发现" style={{ marginBottom: 16 }}>
                <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 2 }}>
                  {summary && <li>共测试 <Text strong>{summary.total_operators}</Text> 个项目，通过 <Text strong style={{ color: "#52c41a" }}>{summary.pass_count}</Text> 个，失败 <Text strong style={{ color: "#ff4d4f" }}>{summary.fail_count}</Text> 个</li>}
                  {summary?.avg_latency_ms && <li>平均推理延迟 <Text strong>{summary.avg_latency_ms.toFixed(2)} ms</Text></li>}
                  {performanceSummary?.fastest_op && <li>最快算子：<Text strong style={{ color: "#52c41a" }}>{performanceSummary.fastest_op.name}</Text>（{performanceSummary.fastest_op.latency_ms} ms）</li>}
                  {performanceSummary?.slowest_op && <li>最慢算子：<Text strong style={{ color: "#fa8c16" }}>{performanceSummary.slowest_op.name}</Text>（{performanceSummary.slowest_op.latency_ms} ms）</li>}
                  {results.filter(r => r.status === "FAIL").map((r, i) => (
                    <li key={i}>❌ <Text type="danger">{r.operator || r.name}：{r.error || "测试失败"}</Text></li>
                  ))}
                </ul>
              </Card>
            )}

            <Divider />
            <Space>
              <Button icon={<DownloadOutlined />} type="primary" onClick={() => handleExport("PDF")}>导出PDF</Button>
              <Button icon={<DownloadOutlined />} onClick={() => handleExport("Excel")}>导出Excel</Button>
              <Button icon={<ShareAltOutlined />} onClick={() => message.info("分享功能开发中")}>分享</Button>
              <Button icon={<PrinterOutlined />} onClick={() => window.print()}>打印</Button>
            </Space>
          </div>
        )},
      ]} />
    );
  };

  return (
    <Spin spinning={loading}>
    <div>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {[["评测报告", reportStats.total || reports.length, <FileTextOutlined />, "#1890ff"],
          ["已发布", reportStats.published || 0, <BarChartOutlined />, "#52c41a"],
          ["审核中", reportStats.reviewing || 0, <LineChartOutlined />, "#fa8c16"],
          ["平均评分", (reportStats.avgScore || 0).toFixed?.(1) || "0", null, "#722ed1"]
        ].map(([t, v, icon, color], i) => (
          <Col xs={24} sm={12} md={6} key={i}><Card size="small"><Statistic title={t} value={v} prefix={typeof icon === "object" && icon ? React.cloneElement(icon, { style: { color } }) : null} valueStyle={{ color }} /></Card></Col>
        ))}
      </Row>

      {/* 图表区域 */}
      {reports.length > 0 && <Card title="性能可视化" size="small" style={{ marginBottom: 16 }} extra={<Space>
        <Radio.Group value={chartType} onChange={e => setChartType(e.target.value)} size="small" buttonStyle="solid">
          <Radio.Button value="bar"><BarChartOutlined /> 柱状图</Radio.Button>
          <Radio.Button value="line"><LineChartOutlined /> 趋势图</Radio.Button>
          <Radio.Button value="radar"><RadarChartOutlined /> 雷达图</Radio.Button>
          <Radio.Button value="scatter"><DotChartOutlined /> 散点图</Radio.Button>
          <Radio.Button value="heatmap"><HeatMapOutlined /> 热力图</Radio.Button>
          <Radio.Button value="pie"><PieChartOutlined /> 饼图</Radio.Button>
        </Radio.Group>
        <Button icon={<SwapOutlined />} onClick={() => { setCompareMode(!compareMode); setCompareIds([]); }} type={compareMode ? "primary" : "default"} size="small">对比模式</Button>
      </Space>}>
        {compareMode && <div style={{ marginBottom: 12 }}><Select mode="multiple" placeholder="选择要对比的报告（2-10份）" style={{ width: "100%" }} value={compareIds} onChange={setCompareIds} options={reports.map(r => ({ value: r.id, label: r.title || r.reportNo }))} maxTagCount={5} /></div>}
        <Row gutter={16}>
          <Col span={12}>
            <ReactECharts option={chartType === "bar" ? buildLatencyChart(compareData) : chartType === "line" ? buildTrendChart(compareData) : chartType === "radar" ? buildRadarChart(compareData) : chartType === "scatter" ? buildScatterChart(compareData) : chartType === "heatmap" ? buildHeatmapChart(compareData) : buildPieChart(compareData)} style={{ height: 360 }} />
          </Col>
          <Col span={12}>
            <ReactECharts option={chartType === "bar" ? buildThroughputChart(compareData) : chartType === "line" ? buildLatencyChart(compareData) : chartType === "radar" ? buildScatterChart(compareData) : chartType === "scatter" ? buildRadarChart(compareData) : chartType === "heatmap" ? buildTrendChart(compareData) : buildThroughputChart(compareData)} style={{ height: 360 }} />
          </Col>
        </Row>
      </Card>}

      {/* 报告列表 */}
      <Card title="评测报告列表" size="small" extra={<Space>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => { fetchReports(); fetchStats(); }}>刷新</Button>
        <Button size="small" icon={<DownloadOutlined />} onClick={() => handleExport("Excel")}>批量导出</Button>
      </Space>}>
        <Table columns={columns} dataSource={reports} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showTotal: (total) => `共 ${total} 条` }}
          scroll={{ x: 'max-content' }}
          rowSelection={compareMode ? { selectedRowKeys: compareIds, onChange: setCompareIds } : undefined} />
      </Card>

      {/* 详情 Drawer */}
      <Drawer
        title={<Space><FileTextOutlined /><span>评测报告详情</span>{reportDetail && <Tag color="blue">{reportDetail.reportNo}</Tag>}</Space>}
        open={detailVisible}
        onClose={() => { setDetailVisible(false); setReportDetail(null); }}
        width={1000}
        extra={<Space>
          <Button icon={<DownloadOutlined />} type="primary" onClick={() => handleExport("PDF")}>导出PDF</Button>
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>打印</Button>
        </Space>}
      >
        {detailLoading ? <div style={{ textAlign: "center", marginTop: 100 }}><Spin size="large" tip="加载报告详情..." /></div> :
          reportDetail ? renderReportDetail() : <Empty description="未获取到报告数据" />}
      </Drawer>

      {/* 失败行样式 */}
      <style>{`.ant-table-row-fail { background: #fff2f0 !important; } .ant-table-row-fail:hover > td { background: #ffeded !important; }`}</style>
    </div>
    </Spin>
  );
}
