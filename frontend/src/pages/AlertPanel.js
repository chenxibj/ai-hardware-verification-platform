/**
 * @file AlertPanel.js
 * @description 告警列表面板
 * @feat #176 资源监控与运维 (US-5.3)
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Tag, Badge, Button, Space, Select, Typography, message, Tooltip, Popconfirm
} from "antd";
import {
  BellOutlined, ReloadOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
  WarningOutlined, InfoCircleOutlined
} from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const { Text } = Typography;

const LEVEL_MAP = {
  CRITICAL: { text: "严重", color: "#ff4d4f", icon: <ExclamationCircleOutlined />, tag: "red" },
  WARNING: { text: "警告", color: "#faad14", icon: <WarningOutlined />, tag: "orange" },
  INFO: { text: "信息", color: "#1890ff", icon: <InfoCircleOutlined />, tag: "blue" },
};

const STATUS_MAP = {
  ACTIVE: { text: "活跃", badge: "error" },
  ACKNOWLEDGED: { text: "已确认", badge: "warning" },
  RESOLVED: { text: "已解决", badge: "success" },
};

export default function AlertPanel({ nodeId }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState(null);
  const [levelFilter, setLevelFilter] = useState(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (nodeId) params.nodeId = nodeId;
      if (statusFilter) params.status = statusFilter;
      if (levelFilter) params.level = levelFilter;
      const res = await api.get("/alerts", { params });
      if (res.data.code === 0) setAlerts(res.data.data || []);
    } catch (err) {
      // silently fail
    }
    setLoading(false);
  }, [nodeId, statusFilter, levelFilter]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const handleAcknowledge = async (id) => {
    try {
      await api.post(`/alerts/${id}/acknowledge`);
      message.success("告警已确认");
      fetchAlerts();
    } catch { message.error("确认失败"); }
  };

  const columns = [
    {
      title: "级别", dataIndex: "level", width: 90,
      render: (v) => {
        const info = LEVEL_MAP[v] || { text: v, tag: "default" };
        return <Tag color={info.tag} icon={info.icon}>{info.text}</Tag>;
      },
    },
    { title: "节点", dataIndex: "nodeName", width: 120, render: v => v || "-" },
    { title: "规则", dataIndex: "ruleName", width: 120, render: v => v || "-" },
    { title: "描述", dataIndex: "message", ellipsis: true },
    {
      title: "状态", dataIndex: "status", width: 100,
      render: (v) => {
        const info = STATUS_MAP[v] || { text: v, badge: "default" };
        return <Badge status={info.badge} text={info.text} />;
      },
    },
    {
      title: "时间", dataIndex: "createdAt", width: 140,
      render: v => v ? (
        <Tooltip title={dayjs(v).format("YYYY-MM-DD HH:mm:ss")}>
          {dayjs(v).fromNow()}
        </Tooltip>
      ) : "-",
    },
    {
      title: "操作", width: 100,
      render: (_, record) => record.status === "ACTIVE" ? (
        <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handleAcknowledge(record.id)}>
          确认
        </Button>
      ) : (
        <Text type="secondary">{record.acknowledgedAt ? dayjs(record.acknowledgedAt).format("MM-DD HH:mm") : "-"}</Text>
      ),
    },
  ];

  const activeCount = alerts.filter(a => a.status === "ACTIVE").length;
  const criticalCount = alerts.filter(a => a.level === "CRITICAL" && a.status === "ACTIVE").length;

  return (
    <Card
      title={
        <Space>
          <BellOutlined />
          <span>告警列表</span>
          {activeCount > 0 && <Badge count={activeCount} style={{ backgroundColor: criticalCount > 0 ? "#ff4d4f" : "#faad14" }} />}
        </Space>
      }
      extra={
        <Space>
          <Select placeholder="级别" allowClear style={{ width: 100 }} value={levelFilter} onChange={setLevelFilter}
            options={Object.entries(LEVEL_MAP).map(([k, v]) => ({ value: k, label: v.text }))} />
          <Select placeholder="状态" allowClear style={{ width: 100 }} value={statusFilter} onChange={setStatusFilter}
            options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.text }))} />
          <Button icon={<ReloadOutlined />} onClick={fetchAlerts} size="small">刷新</Button>
        </Space>
      }
      size="small"
    >
      <Table columns={columns} dataSource={alerts} rowKey="id" loading={loading}
        pagination={{ pageSize: 10, showTotal: t => `共 ${t} 条告警` }} size="small" />
    </Card>
  );
}
