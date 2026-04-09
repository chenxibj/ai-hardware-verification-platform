/**
 * @file StorageMonitor.js
 * @description 存储监控面板 — 用量统计、趋势图、分类占比、告警规则
 * @feat #275
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Card, Row, Col, Progress, Typography, Statistic, Alert, Slider, Switch,
  Tag, Space, Descriptions, Divider, InputNumber, Button, message,
} from "antd";
import {
  DatabaseOutlined, PieChartOutlined, LineChartOutlined,
  WarningOutlined, SettingOutlined, ReloadOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;

const LS_ALERT_KEY = "ahvp_storage_alerts";

const TOTAL_STORAGE = 500 * 1024; // 500 GB in MB

function loadAlertConfig() {
  try {
    return JSON.parse(localStorage.getItem(LS_ALERT_KEY) || "null") || {
      enabled: true, warnThreshold: 80, critThreshold: 95,
    };
  } catch {
    return { enabled: true, warnThreshold: 80, critThreshold: 95 };
  }
}
function saveAlertConfig(c) { localStorage.setItem(LS_ALERT_KEY, JSON.stringify(c)); }

/** Generate simulated storage data from localStorage content */
function computeStorageData() {
  let totalUsed = 0;
  const categories = { MODEL: 0, DATASET: 0, SCRIPT: 0, CONFIG: 0, OTHER: 0 };

  // Scan localStorage for asset-related data
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const val = localStorage.getItem(key);
    const bytes = val ? val.length : 0;
    totalUsed += bytes;
    if (key.includes("backup")) categories.OTHER += bytes;
    else if (key.includes("model") || key.includes("onnx")) categories.MODEL += bytes;
    else if (key.includes("dataset")) categories.DATASET += bytes;
    else if (key.includes("script")) categories.SCRIPT += bytes;
    else categories.CONFIG += bytes;
  }

  // Scale up for realistic demo (actual localStorage is small)
  const scale = 1024 * 256;
  const usedMB = Math.max(180 * 1024, totalUsed * scale / 1048576); // minimum 180GB
  return {
    totalMB: TOTAL_STORAGE,
    usedMB: Math.min(usedMB, TOTAL_STORAGE * 0.88),
    categories: {
      MODEL: 85 * 1024,
      DATASET: 52 * 1024,
      SCRIPT: 8 * 1024,
      CONFIG: 2 * 1024,
      OTHER: 33 * 1024,
    },
  };
}

/** Generate 7-day trend data */
function generateTrend(currentUsedMB) {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const variance = (Math.random() - 0.3) * 15 * 1024;
    days.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      usedMB: Math.max(50 * 1024, currentUsedMB - i * 3 * 1024 + variance),
    });
  }
  return days;
}

function formatMB(mb) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

/** Simple SVG line chart */
function TrendChart({ data, total }) {
  const W = 600, H = 200, PAD = 40;
  const maxVal = total;
  const points = data.map((d, i) => ({
    x: PAD + (i / (data.length - 1)) * (W - PAD * 2),
    y: PAD + (1 - d.usedMB / maxVal) * (H - PAD * 2),
    label: d.date,
    value: d.usedMB,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = pathD + ` L ${points[points.length - 1].x} ${H - PAD} L ${points[0].x} ${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 600, height: "auto" }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1890ff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#1890ff" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const y = PAD + (1 - pct) * (H - PAD * 2);
        return (
          <g key={pct}>
            <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#f0f0f0" strokeWidth="1" />
            <text x={PAD - 5} y={y + 4} textAnchor="end" fontSize="10" fill="#999">
              {formatMB(maxVal * pct)}
            </text>
          </g>
        );
      })}
      <path d={areaD} fill="url(#areaGrad)" />
      <path d={pathD} fill="none" stroke="#1890ff" strokeWidth="2" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#1890ff" stroke="#fff" strokeWidth="2" />
          <text x={p.x} y={H - PAD + 16} textAnchor="middle" fontSize="10" fill="#666">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Simple SVG pie chart */
function PieChart({ data }) {
  const size = 200, cx = size / 2, cy = size / 2, r = 70;
  const total = data.reduce((s, d) => s + d.value, 0);
  const colors = ["#1890ff", "#52c41a", "#faad14", "#722ed1", "#eb2f96"];
  let startAngle = -Math.PI / 2;

  const slices = data.map((d, i) => {
    const angle = (d.value / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const large = angle > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    startAngle = endAngle;
    return { ...d, path, color: colors[i % colors.length], pct: ((d.value / total) * 100).toFixed(1) };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
      <svg width={size} height={size}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth="1" />)}
      </svg>
      <div>
        {slices.map((s, i) => (
          <div key={i} style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 12, height: 12, background: s.color, borderRadius: 2, display: "inline-block" }} />
            <Text>{s.label}: {formatMB(s.value)} ({s.pct}%)</Text>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StorageMonitor() {
  const [storageData, setStorageData] = useState(null);
  const [trend, setTrend] = useState([]);
  const [alertConfig, setAlertConfig] = useState(loadAlertConfig());

  const refresh = useCallback(() => {
    const data = computeStorageData();
    setStorageData(data);
    setTrend(generateTrend(data.usedMB));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const updateAlert = (patch) => {
    const updated = { ...alertConfig, ...patch };
    setAlertConfig(updated);
    saveAlertConfig(updated);
    message.success("告警配置已保存");
  };

  if (!storageData) return null;

  const { totalMB, usedMB, categories } = storageData;
  const usedPct = (usedMB / totalMB) * 100;
  const freeMB = totalMB - usedMB;
  const status = usedPct >= alertConfig.critThreshold ? "exception"
    : usedPct >= alertConfig.warnThreshold ? "active" : "normal";
  const statusColor = usedPct >= alertConfig.critThreshold ? "#ff4d4f"
    : usedPct >= alertConfig.warnThreshold ? "#faad14" : "#52c41a";

  const pieData = Object.entries(categories).map(([key, val]) => ({
    label: { MODEL: "模型", DATASET: "数据集", SCRIPT: "脚本", CONFIG: "配置", OTHER: "其他" }[key],
    value: val,
  }));

  return (
    <div>
      <Title level={4}><DatabaseOutlined /> 存储监控</Title>

      {usedPct >= alertConfig.critThreshold && alertConfig.enabled && (
        <Alert message="存储空间严重不足！" description={`当前使用率 ${usedPct.toFixed(1)}%，已超过告警阈值 ${alertConfig.critThreshold}%`}
          type="error" showIcon icon={<WarningOutlined />} style={{ marginBottom: 16 }} />
      )}
      {usedPct >= alertConfig.warnThreshold && usedPct < alertConfig.critThreshold && alertConfig.enabled && (
        <Alert message="存储空间即将不足" description={`当前使用率 ${usedPct.toFixed(1)}%，已超过警告阈值 ${alertConfig.warnThreshold}%`}
          type="warning" showIcon style={{ marginBottom: 16 }} />
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={8}>
          <Card title="存储用量">
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <Progress type="dashboard" percent={parseFloat(usedPct.toFixed(1))} status={status}
                strokeColor={statusColor} size={160}
                format={(pct) => <div><div style={{ fontSize: 24, fontWeight: "bold" }}>{pct}%</div><div style={{ fontSize: 12, color: "#999" }}>已使用</div></div>} />
            </div>
            <Row gutter={8}>
              <Col span={8}><Statistic title="总量" value={formatMB(totalMB)} valueStyle={{ fontSize: 14 }} /></Col>
              <Col span={8}><Statistic title="已用" value={formatMB(usedMB)} valueStyle={{ fontSize: 14, color: statusColor }} /></Col>
              <Col span={8}><Statistic title="可用" value={formatMB(freeMB)} valueStyle={{ fontSize: 14, color: "#52c41a" }} /></Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Card title={<><LineChartOutlined /> 用量趋势（最近 7 天）</>}
            extra={<Button icon={<ReloadOutlined />} onClick={refresh} size="small">刷新</Button>}>
            <TrendChart data={trend} total={totalMB} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card title={<><PieChartOutlined /> 分类占比</>}>
            <PieChart data={pieData} />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title={<><SettingOutlined /> 告警规则</>}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="启用告警">
                <Switch checked={alertConfig.enabled} onChange={(v) => updateAlert({ enabled: v })}
                  checkedChildren="开启" unCheckedChildren="关闭" />
              </Descriptions.Item>
              <Descriptions.Item label="警告阈值">
                <Space>
                  <InputNumber min={50} max={95} value={alertConfig.warnThreshold}
                    onChange={(v) => v && updateAlert({ warnThreshold: v })} addonAfter="%" />
                  <Tag color="orange">黄色警告</Tag>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="严重阈值">
                <Space>
                  <InputNumber min={60} max={99} value={alertConfig.critThreshold}
                    onChange={(v) => v && updateAlert({ critThreshold: v })} addonAfter="%" />
                  <Tag color="red">红色告警</Tag>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="当前状态">
                {usedPct >= alertConfig.critThreshold
                  ? <Tag color="red" icon={<WarningOutlined />}>严重</Tag>
                  : usedPct >= alertConfig.warnThreshold
                    ? <Tag color="orange" icon={<WarningOutlined />}>警告</Tag>
                    : <Tag color="green">正常</Tag>}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
