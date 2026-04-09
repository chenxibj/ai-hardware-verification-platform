/**
 * @file ResourceMonitor.js
 * @description 资源监控面板 — 概览卡片+节点资源进度条+状态矩阵+告警
 * Issue: #255 基础资源监控面板 (增强版)
 * @feat #176, #255
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Row, Col, Statistic, Tag, Space, Typography, Spin, message,
  Badge, Alert, Tooltip, Progress, Table, Divider, Button,
} from "antd";
import {
  CloudServerOutlined, CheckCircleOutlined, CloseCircleOutlined,
  WarningOutlined, ReloadOutlined, DashboardOutlined,
  DesktopOutlined, HddOutlined, ThunderboltOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text } = Typography;

/* ============ 工具函数 ============ */

/** 解析 hardwareInfo JSON 字符串 */
const parseHardwareInfo = (node) => {
  try {
    const hw = typeof node.hardwareInfo === "string"
      ? JSON.parse(node.hardwareInfo)
      : (node.hardwareInfo || {});
    return {
      cpuCores: hw.cpu_cores_logical || hw.cpu_cores_physical || 0,
      cpuModel: hw.cpu_model || "未知",
      cpuFreqMhz: hw.cpu_freq_mhz || 0,
      memoryTotalGb: hw.memory_total_gb || 0,
      diskTotalGb: hw.disk_total_gb || 0,
      diskFreeGb: hw.disk_free_gb || 0,
      os: hw.os || hw.hostname || "未知",
      arch: hw.arch || "",
      hostname: hw.hostname || "",
    };
  } catch {
    return { cpuCores: 0, memoryTotalGb: 0, diskTotalGb: 0, diskFreeGb: 0 };
  }
};

/** 解析 envInfo JSON 字符串 */
const parseEnvInfo = (node) => {
  try {
    const env = typeof node.envInfo === "string"
      ? JSON.parse(node.envInfo)
      : (node.envInfo || {});
    return {
      osPretty: env.os_pretty || "",
      cpuModel: env.cpu_model || "",
      kernelVersion: env.kernel_version || "",
      pythonVersion: env.python_version || "",
      cpuFlags: env.cpu_flags || [],
      dlFrameworks: env.dl_frameworks || {},
    };
  } catch {
    return {};
  }
};

/** 解析 tags JSON 字符串 */
const parseTags = (node) => {
  try {
    const tags = typeof node.tags === "string" ? JSON.parse(node.tags) : (node.tags || []);
    return Array.isArray(tags) ? tags : [];
  } catch {
    return [];
  }
};

/* ============ 子组件 ============ */

/** 节点状态色块矩阵 */
const NodeStatusMatrix = ({ nodes }) => {
  if (!nodes || nodes.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
        <CloudServerOutlined style={{ fontSize: 40, marginBottom: 8 }} />
        <div>暂无节点</div>
      </div>
    );
  }
  const statusColor = {
    ONLINE: "#52c41a", OFFLINE: "#d9d9d9", BUSY: "#1890ff",
    ERROR: "#ff4d4f", MAINTENANCE: "#faad14",
  };
  const statusLabel = {
    ONLINE: "在线", OFFLINE: "离线", BUSY: "繁忙",
    ERROR: "异常", MAINTENANCE: "维护",
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {nodes.map(node => (
        <Tooltip
          key={node.id}
          title={`${node.name} — ${statusLabel[node.status] || node.status}${node.ipAddress ? ` (${node.ipAddress})` : ""}`}
        >
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

/** 资源使用进度条 */
const ResourceBar = ({ label, used, total, unit, color, icon }) => {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const status = pct > 90 ? "exception" : pct > 70 ? "active" : "normal";
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <Space size={4}>
          {icon}
          <Text style={{ fontSize: 12 }}>{label}</Text>
        </Space>
        <Text style={{ fontSize: 12 }} type="secondary">
          {used.toFixed(1)} / {total.toFixed(1)} {unit}
        </Text>
      </div>
      <Progress
        percent={pct}
        size="small"
        strokeColor={pct > 90 ? "#ff4d4f" : pct > 70 ? "#faad14" : color || "#1890ff"}
        status={status}
        showInfo={false}
      />
    </div>
  );
};

/* ============ 主组件 ============ */

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
    } catch (e) {
      message.error("获取监控数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 每 30 秒自动刷新
  useEffect(() => {
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // 按状态分类
  const onlineNodes = nodes.filter(n => n.status === "ONLINE");
  const offlineNodes = nodes.filter(n => n.status === "OFFLINE" || n.status === "ERROR");
  const maintenanceNodes = nodes.filter(n => n.status === "MAINTENANCE");
  const busyNodes = nodes.filter(n => n.status === "BUSY");

  // 汇总各节点硬件信息
  const nodeResources = nodes.map(n => {
    const hw = parseHardwareInfo(n);
    const env = parseEnvInfo(n);
    const tags = parseTags(n);
    return { ...n, hw, env, tags: tags };
  });

  // 节点列表表格列
  const columns = [
    {
      title: "节点", dataIndex: "name", width: 160,
      render: (v, r) => (
        <Space>
          <Badge status={
            r.status === "ONLINE" ? "success" :
            r.status === "OFFLINE" ? "default" :
            r.status === "ERROR" ? "error" :
            r.status === "BUSY" ? "processing" : "warning"
          } />
          <div>
            <div style={{ fontWeight: 500 }}>{v}</div>
            <Text type="secondary" style={{ fontSize: 11 }}>{r.ipAddress || "-"}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: "状态", dataIndex: "status", width: 80,
      render: v => {
        const map = {
          ONLINE: { color: "green", text: "在线" },
          OFFLINE: { color: "default", text: "离线" },
          BUSY: { color: "blue", text: "繁忙" },
          ERROR: { color: "red", text: "异常" },
          MAINTENANCE: { color: "orange", text: "维护" },
        };
        const info = map[v] || { color: "default", text: v };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: "CPU", width: 200,
      render: (_, r) => {
        const hw = r.hw || {};
        // TODO: 对接实时 CPU 使用率 API（如 /api/nodes/{id}/metrics）
        // 当前用静态核心数展示，使用率需要后端支持
        return (
          <div>
            <Progress
              percent={r.status === "ONLINE" ? 35 : 0}
              size="small"
              strokeColor={r.status === "ONLINE" ? "#1890ff" : "#d9d9d9"}
              format={() => `${hw.cpuCores || 0} 核`}
              style={{ width: 150 }}
            />
            <div>
              <Text type="secondary" style={{ fontSize: 10 }}>
                {hw.cpuFreqMhz ? `${(hw.cpuFreqMhz / 1000).toFixed(1)} GHz` : ""}
              </Text>
            </div>
          </div>
        );
      },
    },
    {
      title: "内存", width: 200,
      render: (_, r) => {
        const hw = r.hw || {};
        // TODO: 对接实时内存使用率 API
        return (
          <Progress
            percent={r.status === "ONLINE" ? 45 : 0}
            size="small"
            strokeColor={r.status === "ONLINE" ? "#722ed1" : "#d9d9d9"}
            format={() => `${hw.memoryTotalGb ? hw.memoryTotalGb.toFixed(1) : 0} GB`}
            style={{ width: 150 }}
          />
        );
      },
    },
    {
      title: "磁盘", width: 200,
      render: (_, r) => {
        const hw = r.hw || {};
        const diskUsed = hw.diskTotalGb - hw.diskFreeGb;
        const pct = hw.diskTotalGb > 0 ? Math.round((diskUsed / hw.diskTotalGb) * 100) : 0;
        return (
          <Tooltip title={`已用 ${diskUsed.toFixed(1)} GB / 总共 ${hw.diskTotalGb.toFixed(1)} GB`}>
            <Progress
              percent={pct}
              size="small"
              strokeColor={pct > 90 ? "#ff4d4f" : pct > 70 ? "#faad14" : "#13c2c2"}
              format={() => `${hw.diskFreeGb.toFixed(1)} GB 可用`}
              style={{ width: 150 }}
            />
          </Tooltip>
        );
      },
    },
    {
      title: "标签", width: 160,
      render: (_, r) => {
        const tags = r.tags || [];
        return (
          <Space wrap size={2}>
            {tags.slice(0, 3).map((t, i) => (
              <Tag key={i} style={{ fontSize: 10, margin: 0 }}>
                {t.key}:{t.value}
              </Tag>
            ))}
            {tags.length > 3 && <Text type="secondary" style={{ fontSize: 10 }}>+{tags.length - 3}</Text>}
          </Space>
        );
      },
    },
    {
      title: "最后心跳", dataIndex: "lastHeartbeat", width: 140,
      render: v => {
        if (!v) return <Text type="secondary">-</Text>;
        const d = new Date(v);
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return <Text type="success" style={{ fontSize: 12 }}>刚刚</Text>;
        if (diffMin < 60) return <Text style={{ fontSize: 12 }}>{diffMin} 分钟前</Text>;
        const diffH = Math.floor(diffMin / 60);
        if (diffH < 24) return <Text type="warning" style={{ fontSize: 12 }}>{diffH} 小时前</Text>;
        return <Text type="danger" style={{ fontSize: 12 }}>{Math.floor(diffH / 24)} 天前</Text>;
      },
    },
  ];

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          <DashboardOutlined style={{ fontSize: 20, color: "#1890ff" }} />
          <Title level={4} style={{ margin: 0 }}>资源监控</Title>
        </Space>
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>自动刷新: 30s</Text>
          <Button type="text" icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </div>

      {/* === 概览卡片 === */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" hoverable>
            <Statistic
              title="总节点"
              value={stats?.totalNodes || 0}
              prefix={<CloudServerOutlined />}
              valueStyle={{ color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" hoverable>
            <Statistic
              title="在线"
              value={stats?.onlineNodes || 0}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: "#52c41a" }}
              suffix={stats?.totalNodes > 0
                ? <Text type="secondary" style={{ fontSize: 14 }}> / {stats.totalNodes}</Text>
                : null}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" hoverable>
            <Statistic
              title="离线/异常"
              value={(stats?.offlineNodes || 0) + (stats?.errorNodes || 0)}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: (stats?.offlineNodes || 0) + (stats?.errorNodes || 0) > 0 ? "#ff4d4f" : "#999" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" hoverable>
            <Statistic
              title="总 CPU"
              value={stats?.totalCpu || 0}
              suffix="核"
              prefix={<DesktopOutlined />}
              valueStyle={{ color: "#722ed1" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" hoverable>
            <Statistic
              title="总内存"
              value={stats?.totalMemoryGb ? stats.totalMemoryGb.toFixed(1) : 0}
              suffix="GB"
              prefix={<HddOutlined />}
              valueStyle={{ color: "#eb2f96" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" hoverable>
            <Statistic
              title="总 GPU"
              value={stats?.totalGpu || 0}
              suffix="卡"
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: stats?.totalGpu > 0 ? "#fa8c16" : "#999" }}
            />
          </Card>
        </Col>
      </Row>

      {/* === 节点状态矩阵 + 告警 === */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={14}>
          <Card
            title="节点状态矩阵"
            size="small"
            extra={
              <Space size={12}>
                {[
                  { color: "#52c41a", label: "在线" },
                  { color: "#d9d9d9", label: "离线" },
                  { color: "#1890ff", label: "繁忙" },
                  { color: "#faad14", label: "维护" },
                  { color: "#ff4d4f", label: "异常" },
                ].map(({ color, label }) => (
                  <Space key={label} size={4}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                    <Text style={{ fontSize: 11 }}>{label}</Text>
                  </Space>
                ))}
              </Space>
            }
          >
            <NodeStatusMatrix nodes={nodes} />
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card
            title={<Space><WarningOutlined style={{ color: "#faad14" }} /><span>告警信息</span></Space>}
            size="small"
            style={{ height: "100%" }}
          >
            {offlineNodes.length === 0 && maintenanceNodes.length === 0 ? (
              <Alert message="所有节点运行正常" type="success" showIcon style={{ marginBottom: 8 }} />
            ) : (
              <Space direction="vertical" style={{ width: "100%" }} size={8}>
                {offlineNodes.length > 0 && (
                  <Alert
                    type="error"
                    showIcon
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
                  <Alert
                    type="warning"
                    showIcon
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

      {/* === 节点资源列表（带进度条）=== */}
      <Card
        title={
          <Space>
            <CloudServerOutlined />
            <span>节点资源详情</span>
            <Text type="secondary" style={{ fontSize: 12 }}>
              （共 {nodes.length} 个节点）
            </Text>
          </Space>
        }
        size="small"
        style={{ marginBottom: 16 }}
      >
        {/* TODO: 对接实时 CPU/内存使用率 API（如 Prometheus 或 /api/nodes/{id}/metrics）
            当前 CPU/内存进度条显示的是静态占位值，磁盘使用率是 hardwareInfo 中的真实数据 */}
        <Table
          columns={columns}
          dataSource={nodeResources}
          rowKey="id"
          size="small"
          pagination={nodes.length > 10 ? { pageSize: 10, showTotal: t => `共 ${t} 个节点` } : false}
          scroll={{ x: 1100 }}
        />
      </Card>

      {/* === 资源汇总条 === */}
      {nodeResources.length > 0 && (
        <Card title="资源汇总" size="small">
          <Row gutter={[24, 16]}>
            <Col xs={24} md={8}>
              <ResourceBar
                label="CPU 总量"
                used={onlineNodes.length > 0 ? stats?.totalCpu * 0.35 : 0}
                total={stats?.totalCpu || 0}
                unit="核"
                color="#1890ff"
                icon={<DesktopOutlined style={{ fontSize: 12, color: "#1890ff" }} />}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                {/* TODO: 替换为实时 CPU 使用率 */}
                在线节点: {onlineNodes.length} / {nodes.length}
              </Text>
            </Col>
            <Col xs={24} md={8}>
              <ResourceBar
                label="内存总量"
                used={onlineNodes.length > 0 ? (stats?.totalMemoryGb || 0) * 0.45 : 0}
                total={stats?.totalMemoryGb || 0}
                unit="GB"
                color="#722ed1"
                icon={<HddOutlined style={{ fontSize: 12, color: "#722ed1" }} />}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                {/* TODO: 替换为实时内存使用率 */}
                总内存: {stats?.totalMemoryGb ? stats.totalMemoryGb.toFixed(1) : 0} GB
              </Text>
            </Col>
            <Col xs={24} md={8}>
              {(() => {
                const totalDisk = nodeResources.reduce((s, n) => s + (n.hw?.diskTotalGb || 0), 0);
                const freeDisk = nodeResources.reduce((s, n) => s + (n.hw?.diskFreeGb || 0), 0);
                const usedDisk = totalDisk - freeDisk;
                return (
                  <>
                    <ResourceBar
                      label="磁盘总量"
                      used={usedDisk}
                      total={totalDisk}
                      unit="GB"
                      color="#13c2c2"
                      icon={<HddOutlined style={{ fontSize: 12, color: "#13c2c2" }} />}
                    />
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      可用: {freeDisk.toFixed(1)} GB / 总共: {totalDisk.toFixed(1)} GB
                    </Text>
                  </>
                );
              })()}
            </Col>
          </Row>
        </Card>
      )}
    </Spin>
  );
}
