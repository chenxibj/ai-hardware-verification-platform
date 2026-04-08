/**
 * @file ResourceMonitor.js
 * @description 资源监控与运维页面 — 概览+节点状态图+资源趋势+告警
 * Issue: #176 资源监控与运维
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card, Row, Col, Statistic, Tag, Space, Typography, Spin, message,
  Badge, Alert, Tooltip, Divider,
} from "antd";
import {
  CloudServerOutlined, CheckCircleOutlined, CloseCircleOutlined,
  WarningOutlined, ReloadOutlined, DashboardOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text } = Typography;

/* SVG折线图组件 — 简易资源使用趋势 */
const TrendChart = ({ title, data, color = "#1890ff", unit = "" }) => {
  const w = 400, h = 120, pad = 30;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  }).join(" ");

  return (
    <Card size="small" title={title} style={{ height: "100%" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 120 }}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const y = h - pad - p * (h - 2 * pad);
          const val = (min + p * range).toFixed(1);
          return (
            <g key={i}>
              <line x1={pad} y1={y} x2={w - pad} y2={y} stroke="#f0f0f0" strokeWidth="1" />
              <text x={pad - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#999">{val}</text>
            </g>
          );
        })}
        {/* Line */}
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {/* Area */}
        <polygon
          points={`${pad},${h - pad} ${points} ${w - pad},${h - pad}`}
          fill={color} fillOpacity="0.1"
        />
        {/* Dots */}
        {data.map((v, i) => {
          const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
          const y = h - pad - ((v - min) / range) * (h - 2 * pad);
          return <circle key={i} cx={x} cy={y} r="3" fill={color} />;
        })}
        {/* X Labels */}
        {data.map((_, i) => {
          if (i % 2 !== 0 && i !== data.length - 1) return null;
          const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
          return <text key={i} x={x} y={h - 8} textAnchor="middle" fontSize="9" fill="#999">{`${i}h`}</text>;
        })}
      </svg>
      <div style={{ textAlign: "center", marginTop: 4 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>最近 {data.length} 小时趋势 ({unit})</Text>
      </div>
    </Card>
  );
};

/* 节点状态色块矩阵 */
const NodeStatusMatrix = ({ nodes }) => {
  if (!nodes || nodes.length === 0) return <Empty description="暂无节点" />;
  const statusColor = { ONLINE: "#52c41a", OFFLINE: "#d9d9d9", BUSY: "#1890ff", ERROR: "#ff4d4f", MAINTENANCE: "#faad14" };
  const statusLabel = { ONLINE: "在线", OFFLINE: "离线", BUSY: "繁忙", ERROR: "异常", MAINTENANCE: "维护" };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {nodes.map(node => (
        <Tooltip key={node.id} title={`${node.name} — ${statusLabel[node.status] || node.status}${node.ipAddress ? ` (${node.ipAddress})` : ""}`}>
          <div style={{
            width: 36, height: 36, borderRadius: 6,
            background: statusColor[node.status] || "#d9d9d9",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: 10, color: "#fff", fontWeight: "bold",
            boxShadow: node.status === "OFFLINE" ? "none" : `0 2px 4px ${statusColor[node.status]}44`,
          }}>
            {node.name?.substring(0, 2)}
          </div>
        </Tooltip>
      ))}
    </div>
  );
};

/* 空状态备用 */
const Empty = ({ description }) => (
  <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
    <CloudServerOutlined style={{ fontSize: 40, marginBottom: 8 }} />
    <div>{description}</div>
  </div>
);

export default function ResourceMonitor() {
  const [stats, setStats] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsResp, nodesResp] = await Promise.all([
        api.get("/nodes/stats"),
        api.get("/nodes"),
      ]);
      if (statsResp.data.code === 0) setStats(statsResp.data.data);
      if (nodesResp.data.code === 0) setNodes(nodesResp.data.data || []);
    } catch (e) { message.error("获取监控数据失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // 趋势数据需要接入监控系统
  const cpuTrend = null;
  const memTrend = null;

  // Alert: offline nodes and high-load nodes
  const offlineNodes = nodes.filter(n => n.status === "OFFLINE" || n.status === "ERROR");
  const maintenanceNodes = nodes.filter(n => n.status === "MAINTENANCE");

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          <DashboardOutlined style={{ fontSize: 20, color: "#1890ff" }} />
          <Title level={4} style={{ margin: 0 }}>资源监控</Title>
        </Space>
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>自动刷新: 30s</Text>
          <ReloadOutlined style={{ cursor: "pointer", color: "#1890ff" }} onClick={fetchData} />
        </Space>
      </div>

      {/* Overview Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="总节点数" value={stats?.totalNodes || 0} prefix={<CloudServerOutlined />}
              valueStyle={{ color: "#1890ff" }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="在线节点" value={stats?.onlineNodes || 0} prefix={<CheckCircleOutlined />}
              valueStyle={{ color: "#52c41a" }}
              suffix={stats?.totalNodes > 0 ? <Text type="secondary" style={{ fontSize: 14 }}> / {stats.totalNodes}</Text> : null} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="总 CPU" value={stats?.totalCpu || 0} suffix="核"
              valueStyle={{ color: "#722ed1" }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="总内存" value={stats?.totalMemoryGb || 0} suffix="GB"
              valueStyle={{ color: "#eb2f96" }} />
          </Card>
        </Col>
      </Row>

      {/* Node Status Matrix + Alerts */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={14}>
          <Card title="节点状态矩阵" size="small"
            extra={
              <Space size={12}>
                <Space size={4}><div style={{ width: 10, height: 10, borderRadius: 2, background: "#52c41a" }} /><Text style={{ fontSize: 11 }}>在线</Text></Space>
                <Space size={4}><div style={{ width: 10, height: 10, borderRadius: 2, background: "#d9d9d9" }} /><Text style={{ fontSize: 11 }}>离线</Text></Space>
                <Space size={4}><div style={{ width: 10, height: 10, borderRadius: 2, background: "#1890ff" }} /><Text style={{ fontSize: 11 }}>繁忙</Text></Space>
                <Space size={4}><div style={{ width: 10, height: 10, borderRadius: 2, background: "#faad14" }} /><Text style={{ fontSize: 11 }}>维护</Text></Space>
                <Space size={4}><div style={{ width: 10, height: 10, borderRadius: 2, background: "#ff4d4f" }} /><Text style={{ fontSize: 11 }}>异常</Text></Space>
              </Space>
            }>
            <NodeStatusMatrix nodes={nodes} />
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title={<Space><WarningOutlined style={{ color: "#faad14" }} /><span>告警信息</span></Space>} size="small" style={{ height: "100%" }}>
            {offlineNodes.length === 0 && maintenanceNodes.length === 0 ? (
              <Alert message="所有节点运行正常" type="success" showIcon style={{ marginBottom: 8 }} />
            ) : (
              <Space direction="vertical" style={{ width: "100%" }} size={8}>
                {offlineNodes.length > 0 && (
                  <Alert type="error" showIcon
                    message={`${offlineNodes.length} 个节点离线/异常`}
                    description={
                      <Space wrap size={4}>
                        {offlineNodes.map(n => (
                          <Tag key={n.id} color="red">{n.name}</Tag>
                        ))}
                      </Space>
                    }
                  />
                )}
                {maintenanceNodes.length > 0 && (
                  <Alert type="warning" showIcon
                    message={`${maintenanceNodes.length} 个节点维护中`}
                    description={
                      <Space wrap size={4}>
                        {maintenanceNodes.map(n => (
                          <Tag key={n.id} color="orange">{n.name}</Tag>
                        ))}
                      </Space>
                    }
                  />
                )}
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {/* Resource Trend Charts — 需接入监控系统 */}
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card size="small" title="资源趋势">
            <Alert
              type="info"
              showIcon
              message="趋势数据需要接入监控系统"
              description="资源使用率趋势图需对接 Prometheus 等监控系统后启用。当前可通过节点状态矩阵查看实时节点情况。"
            />
          </Card>
        </Col>
      </Row>
    </Spin>
  );
}
