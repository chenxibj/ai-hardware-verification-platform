/**
 * @file TemplateDetail.js
 * @description 模板详情页 — 包含基本信息、评测配置、评测脚本(#409)、变更日志(#410)
 * Issue: #409, #410
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Row, Col, Tag, Space, Button, Typography, Spin, Tabs, Descriptions,
  Timeline, Collapse, Tooltip, Empty, message, Divider,
} from "antd";
import {
  ArrowLeftOutlined, CodeOutlined, HistoryOutlined, DownloadOutlined,
  FileTextOutlined, ThunderboltOutlined, AppstoreOutlined, RocketOutlined,
  BarChartOutlined, InfoCircleOutlined, ExperimentOutlined,
  ExpandOutlined, CompressOutlined,
} from "@ant-design/icons";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import api from "../utils/api";

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

const LAYER_COLORS = { CHIP: "red", OPERATOR: "blue", MODEL: "green", COMPARISON: "purple" };
const LAYER_LABELS = { CHIP: "芯片级", OPERATOR: "算子级", MODEL: "模型级", COMPARISON: "对比级" };
const LAYER_ICONS = {
  CHIP: <ThunderboltOutlined />, OPERATOR: <AppstoreOutlined />,
  MODEL: <RocketOutlined />, COMPARISON: <BarChartOutlined />,
};
const EVAL_TYPES = {
  PERFORMANCE: "性能评测", ACCURACY: "精度评测",
  COMPATIBILITY: "兼容性", STABILITY: "稳定性", GENERAL: "通用",
};

const TASK_TYPE_LABELS = { OPERATOR: "算子评测", MODEL: "模型推理", TRAINING: "模型训练" };
const TASK_TYPE_COLORS = { OPERATOR: "blue", MODEL: "green", TRAINING: "purple" };

const parseConfig = (configJson) => {
  try { return JSON.parse(configJson || "{}"); } catch { return {}; }
};
const ensureArray = (val) => {
  if (Array.isArray(val)) return val;
  if (typeof val === "string" && val.trim()) return val.split(",").map(s => s.trim());
  return [];
};

export default function TemplateDetail({ templateId, onBack }) {
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scripts, setScripts] = useState([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [changelog, setChangelog] = useState([]);
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [expandedScripts, setExpandedScripts] = useState([]);
  const [activeTab, setActiveTab] = useState("info");

  const fetchTemplate = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get(`/templates/${templateId}`);
      if (resp.code === 0) setTemplate(resp.data);
    } catch (e) { message.error("获取模板详情失败"); }
    finally { setLoading(false); }
  }, [templateId]);

  const fetchScripts = useCallback(async () => {
    setScriptsLoading(true);
    try {
      const { data: resp } = await api.get(`/templates/${templateId}/scripts`);
      if (resp.code === 0) {
        setScripts(resp.data?.scripts || []);
        // 默认展开第一个
        if (resp.data?.scripts?.length > 0) {
          setExpandedScripts(["0"]);
        }
      }
    } catch (e) { message.error("获取评测脚本失败"); }
    finally { setScriptsLoading(false); }
  }, [templateId]);

  const fetchChangelog = useCallback(async () => {
    setChangelogLoading(true);
    try {
      const { data: resp } = await api.get(`/templates/${templateId}/changelog`);
      if (resp.code === 0) setChangelog(resp.data?.changelog || []);
    } catch (e) { message.error("获取变更日志失败"); }
    finally { setChangelogLoading(false); }
  }, [templateId]);

  useEffect(() => { fetchTemplate(); }, [fetchTemplate]);
  useEffect(() => {
    if (activeTab === "scripts") fetchScripts();
    if (activeTab === "changelog") fetchChangelog();
  }, [activeTab, fetchScripts, fetchChangelog]);

  const handleDownloadScript = (script) => {
    const blob = new Blob([script.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = script.filename || `${script.taskType}_script.py`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExpandAll = () => {
    setExpandedScripts(scripts.map((_, i) => String(i)));
  };
  const handleCollapseAll = () => {
    setExpandedScripts([]);
  };

  if (loading || !template) {
    return <Spin spinning={loading} style={{ display: "flex", justifyContent: "center", padding: 100 }} />;
  }

  const config = parseConfig(template.configJson);
  const layer = template.evaluationLayer;

  const tabItems = [
    {
      key: "info",
      label: <span><InfoCircleOutlined /> 基本信息</span>,
      children: (
        <div>
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="模板名称">{template.name}</Descriptions.Item>
            <Descriptions.Item label="版本">
              <Tag color="blue">v{template.version || "1.0"}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="评测层级">
              <Space>
                {LAYER_ICONS[layer]}
                <Tag color={LAYER_COLORS[layer]}>{LAYER_LABELS[layer] || "未知"}</Tag>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="评测类型">
              <Tag color="cyan">{EVAL_TYPES[template.evalType] || template.evalType}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="类型" span={2}>
              {template.isSystem ? <Tag color="purple">🔒 系统模板</Tag> : <Tag color="green">自定义</Tag>}
              {template.forkFrom && <Tag>克隆自 #{template.forkFrom}</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>
              {template.description || "暂无描述"}
            </Descriptions.Item>
            {template.versionNotes && (
              <Descriptions.Item label="最新变更" span={2}>
                {template.versionNotes}
              </Descriptions.Item>
            )}
          </Descriptions>

          <Divider orientation="left" style={{ margin: "20px 0 12px" }}>评测配置</Divider>
          <Row gutter={16}>
            {ensureArray(config.operators).length > 0 && (
              <Col span={12}>
                <Card size="small" title="算子列表" style={{ marginBottom: 12 }}>
                  <Space size={[4, 8]} wrap>
                    {ensureArray(config.operators).map(op => <Tag key={op} color="blue">{op}</Tag>)}
                  </Space>
                </Card>
              </Col>
            )}
            {ensureArray(config.models).length > 0 && (
              <Col span={12}>
                <Card size="small" title="模型列表" style={{ marginBottom: 12 }}>
                  <Space size={[4, 8]} wrap>
                    {ensureArray(config.models).map(m => <Tag key={m} color="green">{m}</Tag>)}
                  </Space>
                </Card>
              </Col>
            )}
          </Row>
          {ensureArray(config.huggingface_models).length > 0 && (
            <Card size="small" title="🤗 HuggingFace 模型" style={{ marginBottom: 12 }}>
              <Space size={[4, 8]} wrap>
                {ensureArray(config.huggingface_models).map(m => (
                  <Tag key={m} color="blue" style={{ cursor: "pointer" }}
                    onClick={() => window.open("https://huggingface.co/" + m, "_blank")}>
                    🤗 {m}
                  </Tag>
                ))}
              </Space>
            </Card>
          )}
          <Row gutter={16}>
            <Col span={8}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="迭代次数">{config.iterations || 100}</Descriptions.Item>
              </Descriptions>
            </Col>
            <Col span={8}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="批次大小">
                  {ensureArray(config.batchSizes).join(", ") || "1"}
                </Descriptions.Item>
              </Descriptions>
            </Col>
            <Col span={8}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="数据类型">
                  {ensureArray(config.dataTypes).join(", ") || "FP32"}
                </Descriptions.Item>
              </Descriptions>
            </Col>
          </Row>
        </div>
      ),
    },
    {
      key: "scripts",
      label: <span><CodeOutlined /> 评测脚本</span>,
      children: (
        <Spin spinning={scriptsLoading}>
          {scripts.length === 0 ? (
            <Empty description="暂无关联脚本" />
          ) : (
            <div>
              <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                <Text type="secondary">共 {scripts.length} 个评测脚本</Text>
                <Space>
                  <Button size="small" icon={<ExpandOutlined />} onClick={handleExpandAll}>全部展开</Button>
                  <Button size="small" icon={<CompressOutlined />} onClick={handleCollapseAll}>全部折叠</Button>
                </Space>
              </div>
              <Collapse
                activeKey={expandedScripts}
                onChange={setExpandedScripts}
              >
                {scripts.map((script, idx) => (
                  <Panel
                    key={String(idx)}
                    header={
                      <Space>
                        <CodeOutlined />
                        <Text strong>{script.name}</Text>
                        <Tag color={TASK_TYPE_COLORS[script.taskType]}>
                          {TASK_TYPE_LABELS[script.taskType] || script.taskType}
                        </Tag>
                        <Tag>{script.filename}</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {script.content ? `${script.content.split("\n").length} 行` : ""}
                        </Text>
                      </Space>
                    }
                    extra={
                      <Tooltip title="下载脚本">
                        <Button type="link" size="small" icon={<DownloadOutlined />}
                          onClick={(e) => { e.stopPropagation(); handleDownloadScript(script); }}>
                          下载
                        </Button>
                      </Tooltip>
                    }
                  >
                    <SyntaxHighlighter
                      language="python"
                      style={oneDark}
                      showLineNumbers
                      wrapLines
                      customStyle={{
                        maxHeight: 600,
                        fontSize: 13,
                        borderRadius: 8,
                      }}
                    >
                      {script.content || "# 暂无内容"}
                    </SyntaxHighlighter>
                  </Panel>
                ))}
              </Collapse>
            </div>
          )}
        </Spin>
      ),
    },
    {
      key: "changelog",
      label: <span><HistoryOutlined /> 变更日志</span>,
      children: (
        <Spin spinning={changelogLoading}>
          {changelog.length === 0 ? (
            <Empty description="暂无变更记录" />
          ) : (
            <Timeline
              mode="left"
              items={changelog.map((entry, idx) => ({
                color: idx === 0 ? "blue" : "gray",
                label: (
                  <Space direction="vertical" size={0}>
                    <Tag color={idx === 0 ? "blue" : "default"}>v{entry.version}</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>{entry.date}</Text>
                  </Space>
                ),
                children: (
                  <div>
                    {(entry.changes || []).map((change, cIdx) => (
                      <div key={cIdx} style={{ marginBottom: 4 }}>
                        <Text>{idx === 0 ? "🆕" : "•"} {change}</Text>
                      </div>
                    ))}
                  </div>
                ),
              }))}
            />
          )}
        </Spin>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
        <Space>
          {LAYER_ICONS[layer] || <ExperimentOutlined />}
          <Title level={4} style={{ margin: 0 }}>{template.name}</Title>
          <Tag color="blue">v{template.version || "1.0"}</Tag>
          {template.isSystem && <Tag color="purple">🔒 系统</Tag>}
        </Space>
      </div>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </div>
  );
}
