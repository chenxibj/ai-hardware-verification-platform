/**
 * @file StorageQuota.js
 * @description #271 存储配额管理 — 展示用量、配额设置、进度条、告警
 * 数据: localStorage 累加已上传文件大小
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Progress, Row, Col, Statistic, Space, Typography, Alert,
  InputNumber, Button, Table, Tag, Divider, message, Tooltip,
} from "antd";
import {
  CloudServerOutlined, WarningOutlined, StopOutlined,
  SettingOutlined, DatabaseOutlined, ArrowLeftOutlined,
  ReloadOutlined, DeleteOutlined, FileOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text, Paragraph } = Typography;

const QUOTA_LS_KEY = "ahvp_storage_quota";
const DEFAULT_QUOTA_GB = 10;

const fmtBytes = (b) => {
  if (!b || b <= 0) return "0 B";
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
  return (b / 1073741824).toFixed(2) + " GB";
};

const gbToBytes = (gb) => gb * 1073741824;
const bytesToGb = (b) => b / 1073741824;

/** 读取配额设置 */
const getQuota = () => {
  try {
    const q = JSON.parse(localStorage.getItem(QUOTA_LS_KEY) || "null");
    if (q && q.maxBytes) return q;
  } catch { /* fallback */ }
  return { maxBytes: gbToBytes(DEFAULT_QUOTA_GB), usedBytes: 0 };
};

/** 保存配额设置 */
const saveQuota = (q) => {
  localStorage.setItem(QUOTA_LS_KEY, JSON.stringify(q));
};

export default function StorageQuota({ onBack }) {
  const [quota, setQuota] = useState(getQuota());
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editQuota, setEditQuota] = useState(null);

  const pct = quota.maxBytes > 0
    ? Math.min(100, (quota.usedBytes / quota.maxBytes) * 100)
    : 0;
  const isWarning = pct >= 80 && pct < 95;
  const isDanger = pct >= 95;
  const isOverQuota = pct >= 100;

  /** 从 API 获取资产列表，累加大小 */
  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/assets", { params: { size: 500 } });
      if (res.data.code === 0) {
        const list = res.data.data || [];
        setAssets(list);
        const totalUsed = list.reduce((sum, a) => sum + (a.fileSize || 0), 0);
        setQuota((prev) => {
          const updated = { ...prev, usedBytes: totalUsed };
          saveQuota(updated);
          return updated;
        });
      }
    } catch (e) {
      // Fallback: use localStorage
      const stored = getQuota();
      setQuota(stored);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const handleSaveQuota = () => {
    if (editQuota !== null && editQuota > 0) {
      const updated = { ...quota, maxBytes: gbToBytes(editQuota) };
      setQuota(updated);
      saveQuota(updated);
      setEditQuota(null);
      message.success("配额已更新为 " + editQuota + " GB");
    }
  };

  const getProgressColor = () => {
    if (isDanger) return "#ff4d4f";
    if (isWarning) return "#faad14";
    return "#1890ff";
  };

  const getProgressStatus = () => {
    if (isDanger) return "exception";
    if (isWarning) return "active";
    return "active";
  };

  /** 按类型统计用量 */
  const typeUsage = {};
  assets.forEach((a) => {
    const t = a.assetType || "MISC";
    typeUsage[t] = (typeUsage[t] || 0) + (a.fileSize || 0);
  });
  const typeBreakdown = Object.entries(typeUsage)
    .sort((a, b) => b[1] - a[1])
    .map(([type, bytes]) => ({ type, bytes, pct: quota.maxBytes > 0 ? (bytes / quota.maxBytes * 100).toFixed(1) : 0 }));

  const TYPE_COLORS = {
    MODEL: "blue", DATASET: "green", OPERATOR: "orange",
    SCRIPT: "purple", TEMPLATE: "cyan", MISC: "default",
  };
  const TYPE_LABELS = {
    MODEL: "模型", DATASET: "数据集", OPERATOR: "算子",
    SCRIPT: "脚本", TEMPLATE: "模板", MISC: "其他",
  };

  /** 最近上传的大文件（Top 5） */
  const topFiles = [...assets]
    .sort((a, b) => (b.fileSize || 0) - (a.fileSize || 0))
    .slice(0, 5);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        {onBack && <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>}
        <Title level={4} style={{ margin: 0 }}>
          <CloudServerOutlined /> 存储配额管理
        </Title>
        <Button icon={<ReloadOutlined />} onClick={fetchUsage} loading={loading}>刷新</Button>
      </div>

      {/* 告警条 */}
      {isOverQuota && (
        <Alert
          message="存储空间已满"
          description="当前用量已超过配额上限，上传功能已被禁用。请清理不需要的资产或联系管理员扩容。"
          type="error" showIcon icon={<StopOutlined />}
          style={{ marginBottom: 16 }}
        />
      )}
      {isDanger && !isOverQuota && (
        <Alert
          message="存储空间即将用尽"
          description={`当前使用率 ${pct.toFixed(1)}%，超过 95% 警戒线。请及时清理或申请扩容。`}
          type="error" showIcon icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
        />
      )}
      {isWarning && (
        <Alert
          message="存储空间告警"
          description={`当前使用率 ${pct.toFixed(1)}%，已超过 80% 警告线。建议清理不必要的资产。`}
          type="warning" showIcon icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 主进度条 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={14}>
            <div style={{ marginBottom: 8 }}>
              <Space>
                <Text strong style={{ fontSize: 16 }}>存储用量</Text>
                <Text type="secondary">
                  {fmtBytes(quota.usedBytes)} / {fmtBytes(quota.maxBytes)}
                </Text>
              </Space>
            </div>
            <Progress
              percent={Number(pct.toFixed(1))}
              strokeColor={getProgressColor()}
              status={getProgressStatus()}
              strokeWidth={20}
              format={(p) => (
                <span style={{ color: getProgressColor(), fontWeight: 600 }}>
                  {p.toFixed(1)}%
                </span>
              )}
            />
            {/* 阈值标记 */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>0%</Text>
              <Text style={{ fontSize: 11, color: "#faad14", position: "relative", left: "30%" }}>
                80% 警告
              </Text>
              <Text style={{ fontSize: 11, color: "#ff4d4f", position: "relative", left: "10%" }}>
                95% 告警
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>100%</Text>
            </div>
          </Col>
          <Col xs={24} md={10}>
            <Row gutter={16}>
              <Col span={12}>
                <Statistic title="已用空间" value={fmtBytes(quota.usedBytes)}
                  prefix={<DatabaseOutlined />}
                  valueStyle={{ fontSize: 18, color: getProgressColor() }} />
              </Col>
              <Col span={12}>
                <Statistic title="剩余空间"
                  value={fmtBytes(Math.max(0, quota.maxBytes - quota.usedBytes))}
                  prefix={<CloudServerOutlined />}
                  valueStyle={{ fontSize: 18, color: "#52c41a" }} />
              </Col>
              <Col span={12}>
                <Statistic title="总配额" value={bytesToGb(quota.maxBytes).toFixed(1) + " GB"} />
              </Col>
              <Col span={12}>
                <Statistic title="资产数量" value={assets.length} suffix="个" />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        {/* 分类用量 */}
        <Col xs={24} md={14}>
          <Card title="分类用量明细" size="small" style={{ marginBottom: 16 }}>
            {typeBreakdown.length === 0 ? (
              <Text type="secondary">暂无数据</Text>
            ) : (
              typeBreakdown.map(({ type, bytes, pct: tpct }) => (
                <div key={type} style={{ marginBottom: 12 }}>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Space>
                      <Tag color={TYPE_COLORS[type] || "default"}>
                        {TYPE_LABELS[type] || type}
                      </Tag>
                      <Text>{fmtBytes(bytes)}</Text>
                    </Space>
                    <Text type="secondary">{tpct}%</Text>
                  </Space>
                  <Progress
                    percent={Number(tpct)}
                    size="small"
                    strokeColor={TYPE_COLORS[type] === "blue" ? "#1890ff" :
                      TYPE_COLORS[type] === "green" ? "#52c41a" :
                      TYPE_COLORS[type] === "orange" ? "#fa8c16" :
                      TYPE_COLORS[type] === "purple" ? "#722ed1" : "#d9d9d9"}
                    showInfo={false}
                  />
                </div>
              ))
            )}
          </Card>
        </Col>

        {/* 配额设置 + 大文件 */}
        <Col xs={24} md={10}>
          <Card title={<Space><SettingOutlined /> 配额设置</Space>} size="small"
            style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: "100%" }}>
              <div>
                <Text>当前配额: <Text strong>{bytesToGb(quota.maxBytes).toFixed(1)} GB</Text></Text>
              </div>
              <Space>
                <InputNumber
                  min={1} max={1000} step={1}
                  value={editQuota !== null ? editQuota : bytesToGb(quota.maxBytes)}
                  onChange={(v) => setEditQuota(v)}
                  addonAfter="GB"
                  style={{ width: 150 }}
                />
                <Button type="primary" size="small" onClick={handleSaveQuota}
                  disabled={editQuota === null}>
                  保存
                </Button>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                管理员可调整租户存储配额，修改后立即生效
              </Text>
            </Space>
          </Card>

          <Card title="占用最大文件 (Top 5)" size="small">
            {topFiles.length === 0 ? (
              <Text type="secondary">暂无文件</Text>
            ) : (
              topFiles.map((f, idx) => (
                <div key={f.id || idx} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "6px 0", borderBottom: idx < topFiles.length - 1 ? "1px solid #f5f5f5" : "none",
                }}>
                  <Space>
                    <FileOutlined />
                    <Text ellipsis style={{ maxWidth: 180 }}>{f.name}</Text>
                  </Space>
                  <Text type="secondary">{fmtBytes(f.fileSize)}</Text>
                </div>
              ))
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
