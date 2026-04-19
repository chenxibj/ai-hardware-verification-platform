/**
 * @file AssetRecycleBin.js
 * @description 资产回收站 — 软删除、恢复、30天自动清理
 * @feat #273
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Button, Tag, Space, Typography, Alert, Empty, Modal,
  message, Popconfirm, Tooltip, Statistic, Row, Col, Badge,
} from "antd";
import {
  DeleteOutlined, UndoOutlined, RestOutlined, ExclamationCircleOutlined,
  ClockCircleOutlined, WarningOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;

const LS_KEY = "ahvp_recycle_bin";
const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function loadBin() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function saveBin(items) { localStorage.setItem(LS_KEY, JSON.stringify(items)); }

/** Clean expired items (>30 days) */
function cleanExpired(items) {
  const now = Date.now();
  return items.filter((i) => now - i.deletedAt < RETENTION_DAYS * DAY_MS);
}

/** Load bin data — no seed/demo data */
function loadBinOrEmpty() {
  return loadBin();
}

function formatSize(bytes) {
  if (!bytes) return "-";
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function AssetRecycleBin() {
  const [items, setItems] = useState([]);

  const refresh = useCallback(() => {
    const cleaned = cleanExpired(loadBinOrEmpty());
    saveBin(cleaned);
    setItems(cleaned);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-clean timer every 60s
  useEffect(() => {
    const timer = setInterval(() => {
      const cleaned = cleanExpired(loadBin());
      saveBin(cleaned);
      setItems(cleaned);
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const handleRestore = (record) => {
    const updated = loadBin().filter((i) => i.id !== record.id);
    saveBin(updated);
    setItems(updated);
    message.success(`"${record.name}" 已恢复`);
  };

  const handlePermanentDelete = (record) => {
    const updated = loadBin().filter((i) => i.id !== record.id);
    saveBin(updated);
    setItems(updated);
    message.success(`"${record.name}" 已永久删除`);
  };

  const handleClearAll = () => {
    Modal.confirm({
      title: "清空回收站",
      icon: <ExclamationCircleOutlined />,
      content: "此操作将永久删除回收站中的所有资产，无法恢复。确认继续？",
      okText: "确认清空",
      okType: "danger",
      onOk() {
        saveBin([]);
        setItems([]);
        message.success("回收站已清空");
      },
    });
  };

  const getRemainingDays = (deletedAt) => {
    const elapsed = Date.now() - deletedAt;
    const remaining = RETENTION_DAYS - Math.floor(elapsed / DAY_MS);
    return Math.max(0, remaining);
  };

  const columns = [
    { title: "资产名称", dataIndex: "name", ellipsis: true },
    {
      title: "类型", dataIndex: "assetType", width: 120,
      render: (t) => {
        const colors = { MODEL: "blue", DATASET: "green", SCRIPT: "orange", CONFIG: "purple" };
        return <Tag color={colors[t] || "default"}>{t}</Tag>;
      },
    },
    { title: "大小", dataIndex: "size", width: 120, render: formatSize },
    {
      title: "删除时间", dataIndex: "deletedAt", width: 180,
      render: (t) => new Date(t).toLocaleString(),
      sorter: (a, b) => a.deletedAt - b.deletedAt,
      defaultSortOrder: "descend",
    },
    {
      title: "剩余天数", dataIndex: "deletedAt", width: 120, key: "remaining",
      render: (t) => {
        const days = getRemainingDays(t);
        const color = days <= 3 ? "red" : days <= 7 ? "orange" : "green";
        return (
          <Tooltip title={`${RETENTION_DAYS} 天后自动永久删除`}>
            <Badge color={color} text={<Text type={days <= 3 ? "danger" : undefined}>{days} 天</Text>} />
          </Tooltip>
        );
      },
    },
    { title: "删除者", dataIndex: "deletedBy", width: 140 },
    {
      title: "操作", width: 200, key: "actions",
      render: (_, record) => (
        <Space>
          <Button size="small" type="primary" icon={<UndoOutlined />} onClick={() => handleRestore(record)}>
            恢复
          </Button>
          <Popconfirm title="确认永久删除？此操作不可恢复" onConfirm={() => handlePermanentDelete(record)}
            okText="永久删除" okType="danger">
            <Button size="small" danger icon={<DeleteOutlined />}>永久删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const expiringSoon = items.filter((i) => getRemainingDays(i.deletedAt) <= 3).length;

  return (
    <div>
      <Title level={4}><RestOutlined /> 资产回收站</Title>
      <Alert message={`已删除的资产将保留 ${RETENTION_DAYS} 天，到期后自动永久删除`}
        type="info" showIcon style={{ marginBottom: 16 }} />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card><Statistic title="回收站资产" value={items.length} suffix="个" /></Card>
        </Col>
        <Col xs={8}>
          <Card><Statistic title="占用空间" value={formatSize(items.reduce((s, i) => s + (i.size || 0), 0))} /></Card>
        </Col>
        <Col xs={8}>
          <Card>
            <Statistic title="即将过期（≤3天）" value={expiringSoon} suffix="个"
              valueStyle={expiringSoon > 0 ? { color: "#ff4d4f" } : {}}
              prefix={expiringSoon > 0 ? <WarningOutlined /> : <ClockCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card extra={
        <Space>
          <Button icon={<UndoOutlined />} onClick={refresh}>刷新</Button>
          <Button icon={<DeleteOutlined />} danger onClick={handleClearAll} disabled={items.length === 0}>
            清空回收站
          </Button>
        </Space>
      }>
        {items.length === 0
          ? <Empty description="回收站为空" />
          : <Table dataSource={items} columns={columns} rowKey="id" size="small"
              pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }} />}
      </Card>
    </div>
  );
}
