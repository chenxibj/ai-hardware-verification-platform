/**
 * @file AssetValidation.js
 * @description 资产校验页面 — 文件完整性、ONNX 可加载、数据集抽样
 * @feat #272
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Button, Select, Tag, Space, Row, Col, Typography, Alert,
  Progress, Descriptions, message, Empty, Popconfirm, Statistic,
} from "antd";
import {
  SafetyCertificateOutlined, CheckCircleOutlined, CloseCircleOutlined,
  FileSearchOutlined, DeleteOutlined, ReloadOutlined,
} from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;

const LS_KEY = "ahvp_validation_history";

const VALIDATION_TYPES = [
  { value: "integrity", label: "文件完整性", desc: "计算文件 SHA256 哈希验证完整性" },
  { value: "onnx", label: "ONNX 可加载", desc: "校验 ONNX 模型文件是否可正常加载" },
  { value: "dataset-sample", label: "数据集抽样", desc: "抽样展示数据集前 10 条记录" },
];

/** Simulate SHA256 hash */
function mockSHA256() {
  const chars = "0123456789abcdef";
  return Array.from({ length: 64 }, () => chars[Math.floor(Math.random() * 16)]).join("");
}

/** Simulate dataset samples */
function mockSamples() {
  const labels = ["cat", "dog", "car", "tree", "person", "bird", "fish", "plane", "house", "flower"];
  return labels.map((l, i) => ({
    index: i + 1,
    filename: `sample_${String(i + 1).padStart(4, "0")}.jpg`,
    label: l,
    size: `${(Math.random() * 500 + 50).toFixed(1)} KB`,
  }));
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function saveHistory(h) { localStorage.setItem(LS_KEY, JSON.stringify(h)); }

export default function AssetValidation() {
  const [validationType, setValidationType] = useState("integrity");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => { setHistory(loadHistory()); }, []);

  const runValidation = useCallback(() => {
    setRunning(true);
    setProgress(0);
    setResult(null);
    const type = validationType;
    let p = 0;
    const timer = setInterval(() => {
      p += Math.floor(Math.random() * 20 + 10);
      if (p >= 100) {
        p = 100;
        clearInterval(timer);
        const passed = Math.random() > 0.2;
        let detail = {};
        if (type === "integrity") {
          detail = { hash: mockSHA256(), algorithm: "SHA-256" };
        } else if (type === "onnx") {
          detail = { opsetVersion: 13, inputShape: "[1, 3, 224, 224]", status: passed ? "可加载" : "格式异常" };
        } else {
          detail = { samples: mockSamples(), totalRecords: 10000 };
        }
        const rec = {
          id: Date.now(),
          type,
          typeLabel: VALIDATION_TYPES.find((t) => t.value === type)?.label,
          passed,
          detail,
          time: new Date().toISOString(),
        };
        setResult(rec);
        setRunning(false);
        const updated = [rec, ...loadHistory()].slice(0, 50);
        saveHistory(updated);
        setHistory(updated);
        message.success("校验完成");
      }
      setProgress(Math.min(p, 100));
    }, 300);
    return () => clearInterval(timer);
  }, [validationType]);

  const clearHistory = () => {
    saveHistory([]);
    setHistory([]);
    message.success("校验历史已清空");
  };

  const historyColumns = [
    { title: "时间", dataIndex: "time", width: 200, render: (t) => new Date(t).toLocaleString() },
    { title: "校验类型", dataIndex: "typeLabel", width: 140 },
    {
      title: "结果", dataIndex: "passed", width: 100,
      render: (p) => p
        ? <Tag icon={<CheckCircleOutlined />} color="success">通过</Tag>
        : <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>,
    },
    {
      title: "详情", dataIndex: "detail", ellipsis: true,
      render: (d, r) => {
        if (r.type === "integrity") return <Text copyable={{ text: d.hash }}>{d.hash?.slice(0, 16)}...</Text>;
        if (r.type === "onnx") return d.status;
        return `共 ${d.totalRecords} 条，已抽样 ${d.samples?.length} 条`;
      },
    },
  ];

  return (
    <div>
      <Title level={4}><SafetyCertificateOutlined /> 资产校验</Title>
      <Alert message="校验功能在前端模拟执行，校验结果保存在本地浏览器中" type="info" showIcon style={{ marginBottom: 16 }} />

      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <Card title="执行校验" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
              <div>
                <Text strong>校验类型：</Text>
                <Select value={validationType} onChange={setValidationType} style={{ width: 240, marginLeft: 8 }}
                  options={VALIDATION_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
              </div>
              <Paragraph type="secondary">
                {VALIDATION_TYPES.find((t) => t.value === validationType)?.desc}
              </Paragraph>
              {running && <Progress percent={progress} status="active" />}
              <Button type="primary" icon={<FileSearchOutlined />} loading={running} onClick={runValidation}>
                开始校验
              </Button>
            </Space>
          </Card>

          {result && (
            <Card title="校验结果" style={{ marginBottom: 16 }}>
              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label="校验类型">{result.typeLabel}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  {result.passed
                    ? <Tag color="success" icon={<CheckCircleOutlined />}>校验通过</Tag>
                    : <Tag color="error" icon={<CloseCircleOutlined />}>校验失败</Tag>}
                </Descriptions.Item>
                {result.type === "integrity" && (
                  <Descriptions.Item label="SHA-256">
                    <Text copyable code>{result.detail.hash}</Text>
                  </Descriptions.Item>
                )}
                {result.type === "onnx" && (
                  <>
                    <Descriptions.Item label="Opset 版本">{result.detail.opsetVersion}</Descriptions.Item>
                    <Descriptions.Item label="输入形状">{result.detail.inputShape}</Descriptions.Item>
                    <Descriptions.Item label="加载状态">{result.detail.status}</Descriptions.Item>
                  </>
                )}
                {result.type === "dataset-sample" && (
                  <Descriptions.Item label="抽样数据">
                    <Table size="small" pagination={false} dataSource={result.detail.samples} rowKey="index"
                      columns={[
                        { title: "#", dataIndex: "index", width: 50 },
                        { title: "文件名", dataIndex: "filename" },
                        { title: "标签", dataIndex: "label" },
                        { title: "大小", dataIndex: "size" },
                      ]} />
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Card>
          )}
        </Col>

        <Col xs={24} lg={8}>
          <Card>
            <Statistic title="累计校验" value={history.length} suffix="次" />
            <Statistic title="通过率" value={history.length ? ((history.filter((h) => h.passed).length / history.length) * 100).toFixed(1) : 0} suffix="%" style={{ marginTop: 12 }} />
          </Card>
        </Col>
      </Row>

      <Card title="校验历史" extra={
        <Popconfirm title="确认清空校验历史？" onConfirm={clearHistory}>
          <Button size="small" icon={<DeleteOutlined />} danger>清空</Button>
        </Popconfirm>
      }>
        {history.length === 0
          ? <Empty description="暂无校验记录" />
          : <Table dataSource={history} columns={historyColumns} rowKey="id" size="small" pagination={{ pageSize: 10 }} />}
      </Card>
    </div>
  );
}
