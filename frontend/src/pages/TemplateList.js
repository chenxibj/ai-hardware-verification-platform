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

const DATA_TYPES = ["FP32", "FP16", "BF16", "INT8"];

const AVAILABLE_OPERATORS = [
  "MatMul", "Conv2D", "Linear", "Softmax", "ReLU", "GELU",
  "BatchNorm", "LayerNorm", "Attention", "Gather", "Transpose", "Embedding",
];

const AVAILABLE_MODELS = [
  "ResNet-50", "BERT-Base", "MLP-Small", "GPT2-Small",
  "VGG-16", "MobileNet-V2", "Transformer-Base", "EfficientNet-B0",
];

const EVAL_TYPES = {
  PERFORMANCE: "性能评测", ACCURACY: "精度评测",
  COMPATIBILITY: "兼容性", STABILITY: "稳定性", GENERAL: "通用",
};

const parseConfig = (configJson) => {
  try { return JSON.parse(configJson || "{}"); } catch { return {}; }
};

const ensureArray = (val) => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) return val.split(',').map(s => s.trim());
  return [];
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
  const editLayer = Form.useWatch('evaluationLayer', form);

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
      const r = await api.post(`/templates/${record.id}/clone`);
      if (r.data.code === 0) { message.success("克隆成功"); fetchTemplates(); }
      else message.error(r.data.message || "克隆失败");
    } catch (e) { message.error("克隆失败"); }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      // Bug #198: 校验 configJson 完整性
      if (values.evaluationLayer === "OPERATOR" || values.evaluationLayer === "CHIP") {
        if (!values.operators || values.operators.length === 0) {
          message.warning("请至少选择一个评测算子");
          return;
        }
      }
      if (values.evaluationLayer === "MODEL" || values.evaluationLayer === "CHIP") {
        if (!values.models || values.models.length === 0) {
          message.warning("请至少选择一个评测模型");
          return;
        }
      }
      const config = {
        operators: values.operators || [],
        models: values.models || [],
        iterations: values.iterations || 100,
        batchSizes: values.batchSizes || [1],
        dataTypes: values.dataTypes || ["FP32"],
        priority: values.priority || "NORMAL",
        tags: values.tags ? values.tags.split(/[,，\s]+/).filter(Boolean) : [],
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
      tags: Array.isArray(config.tags) ? config.tags.join(", ") : (config.tags || ""),
      name: record.name, description: record.description,
      evalType: record.evalType, evaluationLayer: record.evaluationLayer,
      operators: ensureArray(config.operators),
      models: ensureArray(config.models),
      iterations: config.iterations || 100,
      batchSizes: ensureArray(config.batchSizes).map(Number),
      dataTypes: ensureArray(config.dataTypes),
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
        footer={[
          ...(selected && selected.isSystem ? [
            <Button key="clone" type="primary" icon={<CopyOutlined />}
              onClick={() => { setDetailVisible(false); handleClone(selected); }}>
              克隆为自定义模板
            </Button>
          ] : []),
          <Button key="close" onClick={() => setDetailVisible(false)}>关闭</Button>,
        ]}
        width={640}>
        {selected && (() => {
          const config = parseConfig(selected.configJson);
          const layer = selected.evaluationLayer;
          const showOperators = !layer || layer === 'OPERATOR' || layer === 'CHIP' || layer === 'COMPARISON';
          const showModels = !layer || layer === 'MODEL' || layer === 'CHIP' || layer === 'COMPARISON';
          return (
            <Form layout="vertical">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="模板名称">
                    <Input value={selected.name} disabled />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="模板类型">
                    <Space>
                      {selected.isSystem ? <Tag color="purple">🔒 系统预置</Tag> : <Tag color="green">自定义</Tag>}
                      {selected.forkFrom && <Tag>克隆自 #{selected.forkFrom}</Tag>}
                    </Space>
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="描述">
                <TextArea value={selected.description || "暂无描述"} disabled autoSize={{ minRows: 2, maxRows: 4 }} />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="评测类型">
                    <Select value={selected.evalType} disabled
                      options={Object.entries(EVAL_TYPES).map(([k, v]) => ({ value: k, label: v }))} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="评测层级">
                    <Select value={selected.evaluationLayer} disabled
                      options={Object.entries(LAYER_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
                  </Form.Item>
                </Col>
              </Row>
              <Divider orientation="left" style={{ margin: "8px 0 16px" }}>评测配置</Divider>
              {showOperators && (
                <Form.Item label="算子列表">
                  <Select mode="multiple" value={ensureArray(config.operators)} disabled
                    options={[...new Set([...ensureArray(config.operators), ...AVAILABLE_OPERATORS])].map(op => ({ value: op, label: op }))} />
                </Form.Item>
              )}
              {showModels && (
                <Form.Item label="模型列表">
                  <Select mode="multiple" value={ensureArray(config.models)} disabled
                    options={[...new Set([...ensureArray(config.models), ...AVAILABLE_MODELS])].map(m => ({ value: m, label: m }))} />
                </Form.Item>
              )}
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="迭代次数">
                    <InputNumber value={config.iterations || 100} disabled style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="批次大小">
                    <Select mode="multiple" value={ensureArray(config.batchSizes).map(Number)} disabled
                      options={[1, 2, 4, 8, 16, 32, 64, 128, 256].map(n => ({ value: n, label: String(n) }))} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="优先级">
                    <Select value={config.priority || "NORMAL"} disabled options={PRIORITY_OPTIONS} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="数据类型">
                <Checkbox.Group value={ensureArray(config.dataTypes)} disabled
                  options={DATA_TYPES.map(dt => ({ label: dt, value: dt }))} />
              </Form.Item>
              <Form.Item label="标签">
                <Input value={Array.isArray(config.tags) ? config.tags.join(", ") : (config.tags || "")} disabled />
              </Form.Item>
            </Form>
          );
        })()}
      </Modal>

      {/* 编辑/创建 Modal */}
      <Modal title={selected ? "编辑模板" : "创建自定义模板"} open={editVisible}
        onCancel={() => { setEditVisible(false); setSelected(null); form.resetFields(); }}
        onOk={handleSubmit} okText={selected ? "更新" : "创建"} width={640}>
        <Form form={form} layout="vertical" initialValues={{ iterations: 100, batchSizes: [1], dataTypes: ["FP32"], priority: "NORMAL" }}>
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
          {(!editLayer || editLayer === 'OPERATOR' || editLayer === 'CHIP' || editLayer === 'COMPARISON') && (
          <Form.Item name="operators" label="算子列表（多选）">
            <Select mode="multiple" placeholder="选择要评测的算子" allowClear
              options={AVAILABLE_OPERATORS.map(op => ({ value: op, label: op }))}
              maxTagCount={5} />
          </Form.Item>
          )}
          {(!editLayer || editLayer === 'MODEL' || editLayer === 'CHIP' || editLayer === 'COMPARISON') && (
          <Form.Item name="models" label="模型列表（多选）">
            <Select mode="multiple" placeholder="选择要评测的模型" allowClear
              options={AVAILABLE_MODELS.map(m => ({ value: m, label: m }))}
              maxTagCount={5} />
          </Form.Item>
          )}
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
          <Form.Item name="tags" label="标签 Tags">
            <Input placeholder="多个标签用逗号分隔，如: 性能, 推理, 训练" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
