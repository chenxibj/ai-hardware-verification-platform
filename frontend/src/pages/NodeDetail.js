/**
 * @file NodeDetail.js
 * @description 计算节点详情页 — 基本信息 + 指标折线图(ECharts) + 告警面板
 * @feat #167, #176 资源监控与运维 (US-5.3)
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Card, Row, Col, Descriptions, Tag, Badge, Progress, Button,
  Typography, Space, Empty, Spin, Tooltip, message, Tabs
} from "antd";
import {
  ArrowLeftOutlined, ReloadOutlined, ClusterOutlined,
  DashboardOutlined, BellOutlined, LineChartOutlined
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import api from "../utils/api";
import AlertPanel from "./AlertPanel";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const { Text, Title } = Typography;

const NODE_STATUS_MAP = {
  ONLINE: { text: "在线", color: "#52c41a", badge: "success" },
  OFFLINE: { text: "离线", color: "#ff4d4f", badge: "error" },
  MAINTENANCE: { text: "维护中", color: "#faad14", badge: "warning" },
  BUSY: { text: "忙碌", color: "#1890ff", badge: "processing" },
  ERROR: { text: "异常", color: "#ff4d4f", badge: "error" },
};

export default function NodeDetail({ nodeId, onBack }) {
  const [node, setNode] = useState(null);
  const [envInfo, setEnvInfo] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metricsHours, setMetricsHours] = useState(1);
  const refreshTimer = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [nodeRes, envRes] = await Promise.allSettled([
        api.get(`/nodes/${nodeId}`),
        api.get(`/nodes/${nodeId}/env-info`),
      ]);
      if (nodeRes.status === "fulfilled" && nodeRes.value.data.code === 0) {
        setNode(nodeRes.value.data.data);
      }
      if (envRes.status === "fulfilled" && envRes.value.data.code === 0) {
        setEnvInfo(envRes.value.data.data);
      }
    } catch {
      message.error("获取节点详情失败");
    }
    setLoading(false);
  }, [nodeId]);

  const fetchMetrics = useCallback(async (hours) => {
    try {
      const res = await api.get(`/nodes/${nodeId}/metrics`, { params: { hours } });
      if (res.data.code === 0) setMetrics(res.data.data);
    } catch (err) {}
  }, [nodeId]);

  useEffect(() => {
    fetchData();
    fetchMetrics(metricsHours);
    // 30秒自动刷新
    refreshTimer.current = setInterval(() => {
      fetchMetrics(metricsHours);
    }, 30000);
    return () => clearInterval(refreshTimer.current);
  }, [nodeId, fetchData, fetchMetrics, metricsHours]);

  if (loading) {
    return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  }

  if (!node) {
    return <Empty description="节点不存在" />;
  }

  const statusInfo = NODE_STATUS_MAP[node.status] || { text: node.status, badge: "default" };

  const parseHw = (str) => {
    if (!str) return {};
    try { return typeof str === "string" ? JSON.parse(str) : str; } catch { return {}; }
  };
  const hw = parseHw(node.hardwareInfo);

  const extractType = (tags) => {
    if (!tags) return "未知";
    const upper = tags.toUpperCase();
    if (upper.includes("GPU")) return "GPU";
    if (upper.includes("NPU")) return "NPU";
    if (upper.includes("CPU")) return "CPU";
    if (upper.includes("FPGA")) return "FPGA";
    return "其他";
  };

  // ECharts option for metrics history
  const getMetricsChartOption = () => {
    const history = metrics?.history || [];
    const times = history.map(p => dayjs(p.timestamp).format("HH:mm"));

    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["CPU %", "内存 %", "磁盘 %", "GPU %"], bottom: 0 },
      grid: { top: 30, right: 20, bottom: 50, left: 50 },
      xAxis: { type: "category", data: times, axisLabel: { rotate: 45, fontSize: 10 } },
      yAxis: { type: "value", name: "%", max: 100, min: 0 },
      series: [
        {
          name: "CPU %", type: "line", smooth: true, symbol: "none",
          data: history.map(p => p.cpuUsage),
          itemStyle: { color: "#1890ff" }, areaStyle: { opacity: 0.08 },
        },
        {
          name: "内存 %", type: "line", smooth: true, symbol: "none",
          data: history.map(p => p.memoryUsage),
          itemStyle: { color: "#52c41a" }, areaStyle: { opacity: 0.08 },
        },
        {
          name: "磁盘 %", type: "line", smooth: true, symbol: "none",
          data: history.map(p => p.diskUsage),
          itemStyle: { color: "#faad14" }, areaStyle: { opacity: 0.08 },
        },
        ...(history.some(p => p.gpuUsage != null) ? [{
          name: "GPU %", type: "line", smooth: true, symbol: "none",
          data: history.map(p => p.gpuUsage),
          itemStyle: { color: "#722ed1" }, areaStyle: { opacity: 0.08 },
        }] : []),
      ],
    };
  };

  // Temperature chart
  const getTempChartOption = () => {
    const history = metrics?.history || [];
    if (!history.some(p => p.gpuTemperature)) return null;
    const times = history.map(p => dayjs(p.timestamp).format("HH:mm"));

    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["GPU温度 (℃)"], bottom: 0 },
      grid: { top: 30, right: 20, bottom: 50, left: 50 },
      xAxis: { type: "category", data: times, axisLabel: { rotate: 45, fontSize: 10 } },
      yAxis: { type: "value", name: "℃", min: 20 },
      series: [{
        name: "GPU温度 (℃)", type: "line", smooth: true, symbol: "none",
        data: history.map(p => p.gpuTemperature),
        itemStyle: { color: "#ff4d4f" },
        markLine: {
          data: [{ yAxis: 85, name: "告警阈值", lineStyle: { color: "#ff4d4f", type: "dashed" } }],
        },
      }],
    };
  };

  const tempOption = getTempChartOption();

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack} style={{ marginRight: 12 }}>返回</Button>
        <Title level={4} style={{ display: "inline", verticalAlign: "middle" }}>
          <ClusterOutlined style={{ marginRight: 8 }} />{node.name}
        </Title>
        <Badge status={statusInfo.badge} text={statusInfo.text} style={{ marginLeft: 12 }} />
        <Button icon={<ReloadOutlined />} style={{ float: "right" }} onClick={() => { fetchData(); fetchMetrics(metricsHours); }}>刷新</Button>
      </div>

      <Tabs defaultActiveKey="overview" items={[
        {
          key: "overview",
          label: <span><DashboardOutlined /> 概览</span>,
          children: (
            <Row gutter={[16, 16]}>
              {/* 基本信息 */}
              <Col xs={24} lg={12}>
                <Card title="基本信息" size="small">
                  <Descriptions column={2} size="small">
                    <Descriptions.Item label="名称">{node.name}</Descriptions.Item>
                    <Descriptions.Item label="状态"><Badge status={statusInfo.badge} text={statusInfo.text} /></Descriptions.Item>
                    <Descriptions.Item label="IP地址"><Text copyable>{node.ipAddress || "-"}</Text></Descriptions.Item>
                    <Descriptions.Item label="端口">{node.agentPort || "-"}</Descriptions.Item>
                    <Descriptions.Item label="类型"><Tag color="blue">{extractType(node.tags)}</Tag></Descriptions.Item>
                    <Descriptions.Item label="标签">{node.tags || "-"}</Descriptions.Item>
                    <Descriptions.Item label="描述" span={2}>{node.description || "-"}</Descriptions.Item>
                    <Descriptions.Item label="最后心跳">
                      {node.lastHeartbeat ? (
                        <Tooltip title={dayjs(node.lastHeartbeat).format("YYYY-MM-DD HH:mm:ss")}>
                          {dayjs(node.lastHeartbeat).fromNow()}
                        </Tooltip>
                      ) : "从未"}
                    </Descriptions.Item>
                    <Descriptions.Item label="创建时间">
                      {node.createdAt ? dayjs(node.createdAt).format("YYYY-MM-DD HH:mm") : "-"}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>

              {/* 当前资源使用率 */}
              <Col xs={24} lg={12}>
                <Card title="资源使用率" size="small">
                  {[
                    { label: "CPU 使用率", value: metrics?.cpuUsage ?? hw.cpuUsage, color: null },
                    { label: "内存使用率", value: metrics?.memoryUsage ?? hw.memoryUsage, color: null },
                    { label: "GPU 使用率", value: metrics?.gpuUsage ?? hw.gpuUsage, color: "#722ed1" },
                    { label: "磁盘使用率", value: metrics?.diskUsage ?? hw.diskUsage, color: "#1890ff" },
                  ].filter(m => m.value != null).map(m => (
                    <div key={m.label} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text>{m.label}</Text>
                        <Text strong>{Math.round(m.value)}%</Text>
                      </div>
                      <Progress
                        percent={Math.round(m.value)}
                        strokeColor={m.color || (m.value > 80 ? "#ff4d4f" : m.value > 60 ? "#faad14" : "#52c41a")}
                        showInfo={false}
                      />
                    </div>
                  ))}
                  {metrics?.gpuTemperature != null && (
                    <div style={{ marginTop: 8 }}>
                      <Text>GPU温度: </Text>
                      <Text strong style={{ color: metrics.gpuTemperature > 85 ? "#ff4d4f" : metrics.gpuTemperature > 70 ? "#faad14" : "#52c41a" }}>
                        {metrics.gpuTemperature}℃
                      </Text>
                    </div>
                  )}
                </Card>
              </Col>
            </Row>
          ),
        },
        {
          key: "metrics",
          label: <span><LineChartOutlined /> 指标图表</span>,
          children: (
            <div>
              <Card
                title="性能指标趋势"
                size="small"
                extra={
                  <Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>30秒自动刷新</Text>
                    {[1, 6, 24].map(h => (
                      <Button key={h} size="small" type={metricsHours === h ? "primary" : "default"}
                        onClick={() => { setMetricsHours(h); fetchMetrics(h); }}>
                        {h === 1 ? "1小时" : h === 6 ? "6小时" : "24小时"}
                      </Button>
                    ))}
                  </Space>
                }
                style={{ marginBottom: 16 }}
              >
                {metrics?.history?.length > 0 ? (
                  <ReactECharts option={getMetricsChartOption()} style={{ height: 300 }} />
                ) : (
                  <Empty description="暂无指标数据" />
                )}
              </Card>

              {tempOption && (
                <Card title="温度趋势" size="small">
                  <ReactECharts option={tempOption} style={{ height: 250 }} />
                </Card>
              )}
            </div>
          ),
        },
        {
          key: "alerts",
          label: <span><BellOutlined /> 告警</span>,
          children: <AlertPanel nodeId={nodeId} />,
        },
      ]} />
    </div>
  );
}
