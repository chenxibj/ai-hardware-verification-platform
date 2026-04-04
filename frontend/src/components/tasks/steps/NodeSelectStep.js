/**
 * @file NodeSelectStep.js
 * @description 节点选择与资源分配步骤 — 卡片展示+状态灯+资源模式图标卡片 (#180 US-1.5)
 */
import React, { useState } from "react";
import {
  Row, Col, Card, Space, Badge, Tag, Alert, Divider, Typography, Radio, Tooltip, Progress,
} from "antd";
import {
  CloudServerOutlined, CheckCircleOutlined, WarningOutlined,
  CloseCircleOutlined, LaptopOutlined, TeamOutlined,
  ClusterOutlined, DeploymentUnitOutlined, ApartmentOutlined,
  LockOutlined,
} from "@ant-design/icons";

const { Text, Title } = Typography;

/* ── 资源模式定义 ── */
const RESOURCE_MODES = [
  {
    key: "exclusive",
    label: "独占模式",
    icon: <LockOutlined style={{ fontSize: 28 }} />,
    color: "#1890ff",
    desc: "独享全部计算资源，不与其他任务共享",
  },
  {
    key: "shared",
    label: "共享模式",
    icon: <TeamOutlined style={{ fontSize: 28 }} />,
    color: "#52c41a",
    desc: "与其他任务共享节点资源",
  },
  {
    key: "gpu_exclusive",
    label: "GPU独占",
    icon: <DeploymentUnitOutlined style={{ fontSize: 28 }} />,
    color: "#722ed1",
    desc: "独占GPU资源，CPU/内存可共享",
  },
  {
    key: "multi_gpu",
    label: "多GPU",
    icon: <ClusterOutlined style={{ fontSize: 28 }} />,
    color: "#fa8c16",
    desc: "使用单节点多块GPU并行计算",
  },
  {
    key: "multi_node",
    label: "多节点",
    icon: <ApartmentOutlined style={{ fontSize: 28 }} />,
    color: "#eb2f96",
    desc: "跨多个节点分布式计算",
  },
];

/* ── 节点匹配度检测 ── */
function getMatchStatus(node) {
  if (!node) return { level: "unknown", label: "未知", color: "default", icon: null };
  const hasGPU = node.tags && (node.tags.includes("GPU") || node.tags.includes("NPU"));
  const isOnline = node.status === "ONLINE";
  if (!isOnline) return { level: "offline", label: "离线", color: "default", icon: <CloseCircleOutlined /> };
  if (hasGPU) return { level: "full", label: "完全匹配", color: "success", icon: <CheckCircleOutlined style={{ color: "#52c41a" }} /> };
  return { level: "partial", label: "部分匹配(CPU)", color: "warning", icon: <WarningOutlined style={{ color: "#faad14" }} /> };
}

/* ── 状态灯 ── */
function StatusLight({ status }) {
  const map = {
    ONLINE: { emoji: "🟢", text: "在线" },
    OFFLINE: { emoji: "🔴", text: "离线" },
    BUSY: { emoji: "🟡", text: "繁忙" },
    MAINTENANCE: { emoji: "🟡", text: "维护中" },
  };
  const s = map[status] || map.OFFLINE;
  return <span>{s.emoji} {s.text}</span>;
}

export default function NodeSelectStep({ nodes, allNodes, selectedNodeId, setSelectedNodeId }) {
  const [resourceMode, setResourceMode] = useState("exclusive");

  // Use allNodes if provided, otherwise use nodes (which is online-only for backward compat)
  const displayNodes = allNodes || nodes || [];

  return (
    <div style={{ padding: "12px 0" }}>
      {/* ── 资源模式选择 ── */}
      <Divider orientation="left"><LaptopOutlined /> 资源模式</Divider>
      <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
        {RESOURCE_MODES.map(mode => (
          <Col xs={12} sm={8} md={4} lg={4} key={mode.key}>
            <Card
              hoverable
              size="small"
              onClick={() => setResourceMode(mode.key)}
              style={{
                textAlign: "center",
                borderColor: resourceMode === mode.key ? mode.color : "#f0f0f0",
                borderWidth: resourceMode === mode.key ? 2 : 1,
                background: resourceMode === mode.key ? `${mode.color}08` : "#fff",
                cursor: "pointer",
                height: "100%",
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: `${mode.color}15`, display: "inline-flex",
                alignItems: "center", justifyContent: "center", marginBottom: 8,
              }}>
                {React.cloneElement(mode.icon, { style: { ...mode.icon.props.style, color: mode.color } })}
              </div>
              <div>
                <Text strong style={{ fontSize: 13 }}>{mode.label}</Text>
              </div>
              <Text type="secondary" style={{ fontSize: 11 }}>{mode.desc}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── 节点选择 ── */}
      <Divider orientation="left"><CloudServerOutlined /> 选择计算节点</Divider>

      {displayNodes.length === 0 && (
        <Alert
          message="当前无可用计算节点"
          description="任务创建后将排队等待节点上线"
          type="warning" showIcon style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[16, 16]}>
        {displayNodes.map(node => {
          const isOnline = node.status === "ONLINE";
          const isSelected = selectedNodeId === node.id;
          const match = getMatchStatus(node);
          const hw = node.hardwareInfo || {};
          const metrics = node.latestMetrics || {};

          return (
            <Col xs={24} sm={12} md={8} key={node.id}>
              <Card
                hoverable={isOnline}
                onClick={() => isOnline && setSelectedNodeId(node.id)}
                style={{
                  borderColor: isSelected ? "#1890ff" : isOnline ? "#f0f0f0" : "#d9d9d9",
                  borderWidth: isSelected ? 2 : 1,
                  opacity: isOnline ? 1 : 0.5,
                  cursor: isOnline ? "pointer" : "not-allowed",
                  background: isSelected ? "#e6f7ff" : isOnline ? "#fff" : "#f5f5f5",
                }}
                size="small"
              >
                {/* Header: 名称 + 状态灯 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Space>
                    <Text strong style={{ fontSize: 14 }}>{node.name}</Text>
                    {isSelected && <Tag color="blue">已选</Tag>}
                  </Space>
                  <StatusLight status={node.status} />
                </div>

                {/* 硬件摘要 */}
                <div style={{ marginBottom: 8 }}>
                  <Space size={12} wrap>
                    {hw.cpu_cores_logical && (
                      <Text type="secondary" style={{ fontSize: 11 }}>CPU: {hw.cpu_cores_logical}核</Text>
                    )}
                    {hw.memory_total_gb && (
                      <Text type="secondary" style={{ fontSize: 11 }}>内存: {hw.memory_total_gb?.toFixed(1)}GB</Text>
                    )}
                    {hw.disk_free_gb && (
                      <Text type="secondary" style={{ fontSize: 11 }}>磁盘余: {hw.disk_free_gb?.toFixed(1)}GB</Text>
                    )}
                    {node.tags && (
                      <Tag color={node.tags.includes("GPU") ? "blue" : "green"} style={{ fontSize: 10 }}>
                        {node.tags.includes("GPU") ? "GPU" : "CPU"}
                      </Tag>
                    )}
                  </Space>
                </div>

                {/* 负载条 */}
                {isOnline && metrics.cpuPercent != null && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#999" }}>
                      <span>CPU {metrics.cpuPercent}%</span>
                      <span>内存 {metrics.memoryUsedPercent}%</span>
                    </div>
                    <Progress
                      percent={metrics.cpuPercent}
                      size="small"
                      showInfo={false}
                      strokeColor={metrics.cpuPercent > 80 ? "#ff4d4f" : metrics.cpuPercent > 50 ? "#faad14" : "#52c41a"}
                    />
                  </div>
                )}

                {/* 队列 */}
                {isOnline && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <Text type="secondary">队列: {node.queuedTasks || 0} 任务</Text>
                    <Tooltip title={match.label}>{match.icon} <Text style={{ fontSize: 11, color: match.level === "full" ? "#52c41a" : match.level === "partial" ? "#faad14" : "#ff4d4f" }}>{match.label}</Text></Tooltip>
                  </div>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>

      {displayNodes.filter(n => n.status === "ONLINE").length === 1 && (
        <Alert message="仅一个在线节点，已自动选中" type="info" showIcon style={{ marginTop: 12 }} />
      )}
    </div>
  );
}
