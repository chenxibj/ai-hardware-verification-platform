/**
 * @file TemplateList.js
 * @description 评测模板浏览与管理 — 卡片网格 + 筛选 + CRUD
 * Issue: #161 - 评测模板浏览与管理
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Row, Col, Tag, Space, Button, Input, InputNumber, Checkbox, message, Spin, Empty,
  Typography, Modal, Form, Select, Tooltip, Badge, Divider,
} from "antd";
import {
  AppstoreOutlined, ThunderboltOutlined, RocketOutlined,
  BarChartOutlined, LockOutlined, PlusOutlined, SearchOutlined,
  EyeOutlined, EditOutlined, DeleteOutlined, CopyOutlined,
  ExperimentOutlined, ReloadOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

/* ── 常量 ── */
const LAYER_TABS = [
  { key: "ALL", label: "全部" },
  { key: "CHIP", label: "芯片级" },
  { key: "OPERATOR", label: "算子级" },
  { key: "MODEL", label: "模型级" },
  { key: "COMPARISON", label: "对比级" },
];

const LAYER_COLORS = {
  CHIP: "red", OPERATOR: "blue", MODEL: "green", COMPARISON: "purple",
};
const LAYER_LABELS = {
  CHIP: "芯片级", OPERATOR: "算子级", MODEL: "模型级", COMPARISON: "对比级",
};
const LAYER_ICONS = {
  CHIP: <ThunderboltOutlined />, OPERATOR: <AppstoreOutlined />,
  MODEL: <RocketOutlined />, COMPARISON: <BarChartOutlined />,
};



const PRIORITY_OPTIONS = [
  { value: "LOW", label: "低" },
  { value: "NORMAL", label: "普通" },
  { value: "HIGH", label: "高" },
  { value: "CRITICAL", label: "紧急" },
];

const DATA_TYPES = ["float32", "float16", "int8", "int4", "bfloat16"];

const AVAILABLE_OPERATORS = [
  "matmul", "conv2d", "relu", "sigmoid", "softmax", "batchnorm",
  "pooling", "transpose", "concat", "elementwise_add", "elementwise_mul",
  "reduce_sum", "gather", "scatter", "attention", "layernorm",
  "gelu", "embedding", "topk", "sort",
];

const AVAILABLE_MODELS = [
  "ResNet-50", "VGG-16", "BERT-Base", "GPT-2", "MobileNet-V2",
  "YOLOv5", "Transformer-Base", "LSTM-256", "EfficientNet-B0",
  "DeepSeek-R1", "Llama-3", "Qwen-2",
];

const EVAL_TYPES = {
  PERFORMANCE: "性能评测", ACCURACY: "精度评测",
  COMPATIBILITY: "兼容性", STABILITY: "稳定性", GENERAL: "通用",
};

const parseConfig = (configJson) => {
  try { return JSON.parse(configJson || "{}"); } catch { return {}; }
};

export default function TemplateList() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [detailVisible, setDetailVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form] = Form.useForm();

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (activeTab !== "ALL") params.level = activeTab;
      const { data: resp } = await api.get("/templates", { params });
      if (resp.code === 0) setTemplates(resp.data || []);
    } catch (e) { message.error("获取模板列表失败"); }
    finally { setLoading(false); }
  }, [activeTab]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  /* ── 筛选 ── */
  const filteredTemplates = templates.filter(t => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) &&
        !(t.description || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  /* ── 操作 ── */
  const handleDelete = async (id) => {
    Modal.confirm({
      title: "确认删除",
      content: "删除后无法恢复，确认要删除该模板吗？",
      onOk: async () => {
        try {
          const r = await api.delete(`/templates/${id}`);
          if (r.data.code === 0) { message.success("已删除"); fetchTemplates(); }
          else message.error(r.data.message || "删除失败");
        } catch (e) { message.error("删除失败"); }
      },
    });
  };

  const handleClone = async (record) => {
    try {
      const r = await api.post("/templates", {
        name: record.name + " (副本)", description: record.description,
        evalType: record.evalType, configJson: record.configJson,
        evaluationLayer: record.evaluationLayer,
      });
      if (r.data.code === 0) { message.success("克隆成功"); fetchTemplates(); }
      else message.error(r.data.message || "克隆失败");
    } catch (e) { message.error("克隆失败"); }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const config = {
        evalDimension: values.evaluationLayer || "",
        operators: values.operators || [],
        models: values.models || [],
        iterations: values.iterations || 100,
        batchSizes: values.batchSizes || [1],
        dataTypes: values.dataTypes || ["float32"],
        priority: values.priority || "NORMAL",
      };
      if (selected) {
        const existingConfig = parseConfig(selected.configJson);
        Object.keys(existingConfig).forEach(k => {
          if (!(k in config)) config[k] = existingConfig[k];
        });
      }
      const payload = {
        name: values.name, description: values.description,
        evalType: values.evalType, configJson: JSON.stringify(config),
        evaluationLayer: values.evaluationLayer,
      };
      const r = selected
        ? await api.put(`/templates/${selected.id}`, payload)
        : await api.post("/templates", payload);
      if (r.data.code === 0) {
        message.success(selected ? "更新成功" : "创建成功");
        setEditVisible(false); setSelected(null); form.resetFields(); fetchTemplates();
      } else message.error(r.data.message || "操作失败");
    } catch (e) { if (e.errorFields) return; message.error("操作失败"); }
  };

  const openEdit = (record) => {
    setSelected(record);
    const config = parseConfig(record.configJson);
    form.setFieldsValue({
      name: record.name, description: record.description,
      evalType: record.evalType, evaluationLayer: record.evaluationLayer,
      operators: config.operators || [],
      models: config.models || [],
      iterations: config.iterations || 100,
      batchSizes: config.batchSizes || [1],
      dataTypes: config.dataTypes || ["float32"],
      priority: config.priority || "NORMAL",
    });
    setEditVisible(true);
  };

  const openCreate = () => { setSelected(null); form.resetFields(); setEditVisible(true); };
  const onView = (t) => { setSelected(t); setDetailVisible(true); };

  /* ── 统计 ── */
  const systemCount = templates.filter(t => t.isSystem).length;
  const customCount = templates.filter(t => !t.isSystem).length;

  return (
    <div>
      {/* 统计 + 操作栏 */}
      <Row gutter={16} style={{ marginBottom: 16 }} align="middle" justify="space-between">
        <Col>
          <Space>
            <Title level={5} style={{ margin: 0 }}>评测模板</Title>
            <Tag>共 {templates.length}</Tag>
            <Tag color="blue">系统 {systemCount}</Tag>
            <Tag color="green">自定义 {customCount}</Tag>
          </Space>
        </Col>
        <Col>
          <Space>
            <Input placeholder="搜索模板..." prefix={<SearchOutlined />} value={search}
              onChange={e => setSearch(e.target.value)} style={{ width: 200 }} allowClear />
            <Button icon={<ReloadOutlined />} onClick={fetchTemplates} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              创建自定义模板
            </Button>
          </Space>
        </Col>
      </Row>

      {/* 层级筛选 Tabs */}
      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {LAYER_TABS.map(tab => (
          <Button key={tab.key}
            type={activeTab === tab.key ? "primary" : "default"}
            size="small"
            icon={tab.key !== "ALL" ? LAYER_ICONS[tab.key] : null}
            onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </Button>
        ))}
      </div>

      {/* 卡片网格 */}
      <Spin spinning={loading}>
        {filteredTemplates.length === 0 && !loading ? (
          <Empty description="无匹配模板" />
        ) : (
          <Row gutter={[16, 16]}>
            {filteredTemplates.map(t => {
              const config = parseConfig(t.configJson);
              const layer = t.evaluationLayer;
              const itemCount = config.itemCount || (config.operators?.length || 0) + (config.models?.length || 0);

              return (
                <Col xs={24} sm={12} md={8} lg={6} key={t.id}>
                  <Card hoverable size="small"
                    style={{
                      borderLeft: `3px solid ${LAYER_COLORS[layer] ? `var(--ant-color-${LAYER_COLORS[layer]}, #1890ff)` : '#d9d9d9'}`,
                      minHeight: 180,
                    }}
                    actions={[
                      <Tooltip title="查看详情" key="view">
                        <EyeOutlined onClick={() => onView(t)} />
                      </Tooltip>,
                      ...(t.isSystem ? [
                        <Tooltip title="克隆为自定义模板" key="clone">
                          <CopyOutlined onClick={() => handleClone(t)} />
                        </Tooltip>,
                      ] : [
                        <Tooltip title="编辑" key="edit">
                          <EditOutlined onClick={() => openEdit(t)} />
                        </Tooltip>,
                        <Tooltip title="删除" key="delete">
                          <DeleteOutlined onClick={() => handleDelete(t.id)} style={{ color: "#ff4d4f" }} />
                        </Tooltip>,
                      ]),
                    ]}>
                    <Space direction="vertical" size={4} style={{ width: "100%" }}>
                      <Space>
                        <div style={{ fontSize: 20, color: LAYER_COLORS[layer] ? `var(--ant-color-${LAYER_COLORS[layer]}, #1890ff)` : '#1890ff' }}>
                          {LAYER_ICONS[layer] || <ExperimentOutlined />}
                        </div>
                        <Text strong style={{ fontSize: 14 }}>{t.name}</Text>
                        {t.isSystem && (
                          <Tooltip title="系统模板（不可编辑删除）">
                            <LockOutlined style={{ color: "#999", fontSize: 12 }} />
                          </Tooltip>
                        )}
                      </Space>
                      <Paragraph type="secondary" ellipsis={{ rows: 2 }}
                        style={{ margin: 0, fontSize: 12, minHeight: 36 }}>
                        {t.description || "暂无描述"}
                      </Paragraph>
                      <Space size={4} wrap>
                        {layer && <Tag color={LAYER_COLORS[layer]} style={{ fontSize: 11 }}>{LAYER_LABELS[layer]}</Tag>}
                        <Tag color="blue" style={{ fontSize: 11 }}>{EVAL_TYPES[t.evalType] || t.evalType}</Tag>
                        {itemCount > 0 && <Tag color="cyan" style={{ fontSize: 11 }}>{itemCount} 评测项</Tag>}
                      </Space>
                    </Space>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Spin>

      {/* 详情 Modal */}
      <Modal title="模板详情" open={detailVisible} onCancel={() => setDetailVisible(false)}
        footer={[<Button key="close" onClick={() => setDetailVisible(false)}>关闭</Button>]}
        width={600}>
        {selected && (() => {
          const config = parseConfig(selected.configJson);
          return (
            <div>
              <Divider orientation="left">基本信息</Divider>
              <Row gutter={[16, 8]}>
                <Col span={8}><Text type="secondary">模板名称</Text></Col>
                <Col span={16}><Text strong>{selected.name}</Text></Col>
                <Col span={8}><Text type="secondary">评测类型</Text></Col>
                <Col span={16}><Tag color="blue">{EVAL_TYPES[selected.evalType] || selected.evalType}</Tag></Col>
                <Col span={8}><Text type="secondary">评测层级</Text></Col>
                <Col span={16}>
                  {selected.evaluationLayer
                    ? <Tag color={LAYER_COLORS[selected.evaluationLayer]}>{LAYER_LABELS[selected.evaluationLayer]}</Tag>
                    : <Text type="secondary">未分类</Text>}
                </Col>
                <Col span={8}><Text type="secondary">系统模板</Text></Col>
                <Col span={16}>{selected.isSystem ? <Tag color="purple">🔒 系统</Tag> : <Tag color="green">自定义</Tag>}</Col>
                <Col span={8}><Text type="secondary">描述</Text></Col>
                <Col span={16}><Text>{selected.description || "暂无描述"}</Text></Col>
              </Row>
              {config.operators && config.operators.length > 0 && (
                <>
                  <Divider orientation="left">算子列表 ({config.operators.length})</Divider>
                  <div>{config.operators.map(op => <Tag key={op} style={{ marginBottom: 4 }}>{op}</Tag>)}</div>
                </>
              )}
              {config.models && config.models.length > 0 && (
                <>
                  <Divider orientation="left">模型列表 ({config.models.length})</Divider>
                  <div>{config.models.map(m => <Tag key={m} color="green" style={{ marginBottom: 4 }}>{m}</Tag>)}</div>
                </>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* 编辑/创建 Modal */}
      <Modal title={selected ? "编辑模板" : "创建自定义模板"} open={editVisible}
        onCancel={() => { setEditVisible(false); setSelected(null); form.resetFields(); }}
        onOk={handleSubmit} okText={selected ? "更新" : "创建"} width={640}>
        <Form form={form} layout="vertical" initialValues={{ iterations: 100, batchSizes: [1], dataTypes: ["float32"], priority: "NORMAL" }}>
          <Form.Item name="name" label="模板名称" rules={[{ required: true, message: "请输入模板名称" }]}>
            <Input placeholder="输入模板名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={2} placeholder="模板描述" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="evalType" label="评测类型" rules={[{ required: true, message: "请选择评测类型" }]}>
                <Select placeholder="选择评测类型"
                  options={Object.entries(EVAL_TYPES).map(([k, v]) => ({ value: k, label: v }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="evaluationLayer" label="评测层级">
                <Select placeholder="选择评测层级" allowClear
                  options={Object.entries(LAYER_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
              </Form.Item>
            </Col>
          </Row>
          <Divider orientation="left" style={{ margin: "8px 0 16px" }}>评测配置</Divider>
          <Form.Item name="operators" label="算子列表（多选）">
            <Select mode="multiple" placeholder="选择要评测的算子" allowClear
              options={AVAILABLE_OPERATORS.map(op => ({ value: op, label: op }))}
              maxTagCount={5} />
          </Form.Item>
          <Form.Item name="models" label="模型列表（多选）">
            <Select mode="multiple" placeholder="选择要评测的模型" allowClear
              options={AVAILABLE_MODELS.map(m => ({ value: m, label: m }))}
              maxTagCount={5} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="iterations" label="迭代次数">
                <InputNumber min={1} max={10000} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="batchSizes" label="批次大小">
                <Select mode="multiple" placeholder="选择批次"
                  options={[1, 2, 4, 8, 16, 32, 64, 128].map(n => ({ value: n, label: String(n) }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="priority" label="优先级">
                <Select options={PRIORITY_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="dataTypes" label="数据类型">
            <Checkbox.Group options={DATA_TYPES.map(dt => ({ label: dt, value: dt }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
