/**
 * @file PlanCreate.js
 * @description 创建评测计划 — 6步向导
 * Issue: #162 - 评测任务创建6步向导
 * Steps: 选芯片 → 选模板 → 选评测项 → 配参数 → 选节点 → 确认提交
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card, Steps, Button, Radio, Tag, Badge, Empty, Row, Col, Space,
  Descriptions, message, Typography, Spin, Result, Checkbox, Select,
  Collapse, InputNumber, Tree, Alert, Tooltip, Divider, Progress,
  Modal, Form, Input,
} from "antd";
import {
  RocketOutlined, FileTextOutlined, ExperimentOutlined,
  CheckCircleOutlined, ArrowLeftOutlined, ArrowRightOutlined,
  PlayCircleOutlined, SaveOutlined, LockOutlined, AppstoreOutlined,
  ClusterOutlined, SettingOutlined, UnorderedListOutlined,
  CloudServerOutlined, ThunderboltOutlined, ApiOutlined,
  DatabaseOutlined, BarChartOutlined, PlusOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

/* ── 常量 ── */
const CHIP_TYPE_COLORS = { GPU: "blue", NPU: "green", TPU: "purple", CPU: "orange", OTHER: "default" };
const CHIP_TYPE_LABELS = { GPU: "GPU", NPU: "NPU", TPU: "TPU", CPU: "CPU", OTHER: "其他" };
const STATUS_MAP = {
  UNEVALUATED: { text: "待评测", status: "default" },
  EVALUATING:  { text: "评测中", status: "processing" },
  EVALUATED:   { text: "已评测", status: "success" },
};

const LAYER_LABELS = {
  CHIP: "芯片级", OPERATOR: "算子级", MODEL: "模型级", COMPARISON: "对比级",
};
const LAYER_COLORS = {
  CHIP: "red", OPERATOR: "blue", MODEL: "green", COMPARISON: "purple",
};
const LAYER_ICONS = {
  CHIP: <ThunderboltOutlined />, OPERATOR: <AppstoreOutlined />,
  MODEL: <RocketOutlined />, COMPARISON: <BarChartOutlined />,
};

const EVAL_TYPE_LABELS = {
  PERFORMANCE: "性能评测", ACCURACY: "精度评测",
  COMPATIBILITY: "兼容性评测", STABILITY: "稳定性评测", GENERAL: "通用评测",
};

const PRESETS = [
  { key: "QUICK", title: "🚀 快速验证", desc: "核心项快速摸底", detail: "覆盖核心算子及基础模型推理验证，适合初次接入快速摸底。", duration: "~15 分钟", taskCount: 15, color: "#1890ff" },
  { key: "STANDARD", title: "📋 标准评测", desc: "全项标准执行", detail: "覆盖模板全部评测项标准执行，适合日常回归验证。", duration: "~1 小时", taskCount: 60, color: "#52c41a" },
  { key: "FULL", title: "🔬 全量评测", desc: "全项+多配置深度评测", detail: "全部评测项多参数组合深度执行，适合正式评测报告出具。", duration: "~4 小时", taskCount: 120, color: "#722ed1" },
];

const NODE_STATUS_MAP = {
  ONLINE:  { text: "在线", color: "green", badge: "success" },
  OFFLINE: { text: "离线", color: "default", badge: "default" },
  BUSY:    { text: "繁忙", color: "processing", badge: "processing" },
  ERROR:   { text: "异常", color: "red", badge: "error" },
  MAINTENANCE: { text: "维护中", color: "orange", badge: "warning" },
};

/* ── Helper: 解析 configJson ── */
const parseConfig = (configJson) => {
  try { return JSON.parse(configJson || "{}"); } catch { return {}; }
};

/* ── Helper: 从模板生成评测项树 ── */
const buildEvalItemTree = (template) => {
  if (!template) return [];
  const config = parseConfig(template.configJson);
  const items = [];
  let keyIdx = 0;

  // Operators
  if (config.operators && config.operators.length > 0) {
    items.push({
      title: `算子评测 (${config.operators.length}项)`,
      key: `op-root-${keyIdx++}`,
      icon: <AppstoreOutlined />,
      children: config.operators.map(op => ({
        title: op, key: `op-${op}-${keyIdx++}`, isLeaf: true,
      })),
    });
  }

  // Models
  if (config.models && config.models.length > 0) {
    items.push({
      title: `模型评测 (${config.models.length}项)`,
      key: `model-root-${keyIdx++}`,
      icon: <RocketOutlined />,
      children: config.models.map(m => ({
        title: m, key: `model-${m}-${keyIdx++}`, isLeaf: true,
      })),
    });
  }

  // Data types
  if (config.data_types && config.data_types.length > 0) {
    items.push({
      title: `精度类型 (${config.data_types.length}项)`,
      key: `dtype-root-${keyIdx++}`,
      icon: <DatabaseOutlined />,
      children: config.data_types.map(d => ({
        title: d, key: `dtype-${d}-${keyIdx++}`, isLeaf: true,
      })),
    });
  }

  // Benchmarks
  if (config.benchmarks && config.benchmarks.length > 0) {
    items.push({
      title: `基准测试 (${config.benchmarks.length}项)`,
      key: `bench-root-${keyIdx++}`,
      icon: <BarChartOutlined />,
      children: config.benchmarks.map(b => ({
        title: b, key: `bench-${b}-${keyIdx++}`, isLeaf: true,
      })),
    });
  }

  if (items.length === 0) {
    items.push({
      title: `评测项 (${config.itemCount || '未知'}项)`,
      key: 'generic-root',
      icon: <ExperimentOutlined />,
      children: [{ title: '基于模板预置配置执行', key: 'generic-1', isLeaf: true }],
    });
  }

  return items;
};

/* ── 统计评测项数 ── */
const countEvalItems = (template) => {
  if (!template) return 0;
  const config = parseConfig(template.configJson);
  if (config.itemCount) return config.itemCount;
  let count = 0;
  if (config.operators) count += config.operators.length;
  if (config.models) count += config.models.length;
  if (config.data_types) count += config.data_types.length;
  if (config.benchmarks) count += config.benchmarks.length;
  return count || 10;
};

export default function PlanCreate({ onOpenMonitor, onBack }) {
  const navigate = useNavigate();

  /* 向导步骤 */
  const [current, setCurrent] = useState(0);

  /* Step 1: 芯片 */
  const [chips, setChips] = useState([]);
  const [chipsLoading, setChipsLoading] = useState(false);
  const [selectedChipId, setSelectedChipId] = useState(null);

  /* Step 2: 模板 */
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [templateTab, setTemplateTab] = useState("system");

  /* Step 3: 评测项（基于模板自动填充） */
  const [checkedKeys, setCheckedKeys] = useState([]);
  /* Bug #201: 自定义评测项 */
  const [customItems, setCustomItems] = useState([]);
  const [customItemModalVisible, setCustomItemModalVisible] = useState(false);
  const [customItemForm] = Form.useForm();

  /* Step 4: 参数 */
  const [selectedPreset, setSelectedPreset] = useState("STANDARD");
  const [advancedConfig, setAdvancedConfig] = useState({
    timeout: 3600, retryCount: 1,
    dataTypes: ["FP32"], batchSize: 32,
    warmupIterations: 10, benchmarkIterations: 100,
  });

  /* Step 5: 节点 */
  const [nodes, setNodes] = useState([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [resourceMode, setResourceMode] = useState("shared");
  const [nodeTypeFilter, setNodeTypeFilter] = useState("ALL");

  /* Step 6: 提交 */
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [createdPlanId, setCreatedPlanId] = useState(null);

  /* ── 获取芯片列表 ── */
  const fetchChips = useCallback(async () => {
    setChipsLoading(true);
    try {
      const { data: resp } = await api.get("/chips", { params: { page: 0, size: 100 } });
      if (resp.code === 0) {
        const all = resp.data || [];
        setChips(all.filter(c => c.status === "UNEVALUATED" || c.status === "EVALUATED"));
      }
    } catch (e) { message.error("获取芯片列表失败"); }
    finally { setChipsLoading(false); }
  }, []);

  /* ── 获取模板列表 ── */
  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const { data: resp } = await api.get("/templates");
      if (resp.code === 0) setTemplates(resp.data || []);
    } catch (e) { message.error("获取模板列表失败"); }
    finally { setTemplatesLoading(false); }
  }, []);

  /* ── 获取节点列表 ── */
  const fetchNodes = useCallback(async () => {
    setNodesLoading(true);
    try {
      const { data: resp } = await api.get("/nodes");
      if (resp.code === 0) setNodes(resp.data || []);
    } catch (e) { message.error("获取节点列表失败"); }
    finally { setNodesLoading(false); }
  }, []);

  useEffect(() => { fetchChips(); fetchTemplates(); }, [fetchChips, fetchTemplates]);
  useEffect(() => { if (current === 4) fetchNodes(); }, [current, fetchNodes]);

  /* ── 导出选中对象 ── */
  const selectedChip = chips.find(c => c.id === selectedChipId);
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const selectedPresetObj = PRESETS.find(p => p.key === selectedPreset);

  /* ── 当模板变化时自动填充评测项 ── */
  useEffect(() => {
    if (selectedTemplate) {
      const tree = buildEvalItemTree(selectedTemplate);
      const allKeys = [];
      const collectKeys = (nodes) => {
        nodes.forEach(n => {
          allKeys.push(n.key);
          if (n.children) collectKeys(n.children);
        });
      };
      collectKeys(tree);
      setCheckedKeys(allKeys);
    }
  }, [selectedTemplateId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 模板分组 ── */
  const systemTemplates = useMemo(() => templates.filter(t => t.isSystem), [templates]);
  const customTemplates = useMemo(() => templates.filter(t => !t.isSystem), [templates]);

  const groupedByLayer = useMemo(() => {
    const groups = { CHIP: [], OPERATOR: [], MODEL: [], COMPARISON: [] };
    systemTemplates.forEach(t => {
      const layer = t.evaluationLayer || 'OTHER';
      if (groups[layer]) groups[layer].push(t);
    });
    return groups;
  }, [systemTemplates]);

  /* ── 自动生成名称 ── */
  const generateName = () => {
    if (!selectedChip || !selectedTemplate) return "";
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `${selectedChip.name}-${selectedTemplate.name}-${date}`;
  };

  /* ── 预估任务数 ── */
  const estimatedTasks = useMemo(() => {
    const itemCount = countEvalItems(selectedTemplate);
    const multiplier = selectedPreset === "QUICK" ? 0.3 : selectedPreset === "FULL" ? 2.5 : 1;
    return Math.max(1, Math.round(itemCount * multiplier));
  }, [selectedTemplate, selectedPreset]);

  /* ── 预估耗时 ── */
  const estimatedDuration = useMemo(() => {
    if (!selectedPresetObj) return "-";
    return selectedPresetObj.duration;
  }, [selectedPresetObj]);
  const evalTree = useMemo(() => {
    const baseTree = buildEvalItemTree(selectedTemplate);
    // Bug #201: 合并自定义评测项
    if (customItems.length > 0) {
      const customChildren = customItems.map((item, idx) => ({
        title: `${item.name} (${item.dataType}${item.shape ? ', ' + item.shape : ''})`,
        key: `custom-${idx}-${item.name}`,
        isLeaf: true,
      }));
      baseTree.push({
        title: `自定义评测项 (${customItems.length}项)`,
        key: 'custom-root',
        icon: <PlusOutlined />,
        children: customChildren,
      });
    }
    return baseTree;
  }, [selectedTemplate, customItems]);
  const totalItems = countEvalItems(selectedTemplate);

  /* ── 提交 ── */
  const handleSubmit = async (runNow) => {
    setSubmitting(true);
    try {
      const payload = {
        name: generateName(),
        chipId: selectedChipId,
        templateId: selectedTemplateId,
        preset: selectedPreset,
        evalConfig: JSON.stringify({
          preset: selectedPreset,
          templateId: selectedTemplateId,
          templateName: selectedTemplate?.name,
          nodeIds: selectedNodeIds,
          resourceMode,
          timeout: advancedConfig.timeout,
          retryCount: advancedConfig.retryCount,
          dataTypes: advancedConfig.dataTypes,
          batchSize: advancedConfig.batchSize,
          warmupIterations: advancedConfig.warmupIterations,
          benchmarkIterations: advancedConfig.benchmarkIterations,
          itemCount: countEvalItems(selectedTemplate),
        }),
        nodeId: selectedNodeIds.length > 0 ? selectedNodeIds[0] : null,
        status: runNow ? "RUNNING" : "DRAFT",
      };
      const { data: resp } = await api.post("/plans", payload);
      if (resp.code === 0) {
        message.success(runNow ? "计划已创建并启动执行" : "计划已保存为草稿");
        setCreatedPlanId(resp.data?.id || resp.data);
        setSubmitted(true);
      } else {
        message.error(resp.message || "创建失败");
      }
    } catch (e) {
      message.error("创建失败: " + (e.response?.data?.message || e.message));
    } finally { setSubmitting(false); }
  };

  /* ── 步骤配置 ── */
  const steps = [
    { title: "选择芯片", icon: <ExperimentOutlined /> },
    { title: "选择模板", icon: <FileTextOutlined /> },
    { title: "评测项", icon: <UnorderedListOutlined /> },
    { title: "配置参数", icon: <SettingOutlined /> },
    { title: "选择节点", icon: <ClusterOutlined /> },
    { title: "确认提交", icon: <CheckCircleOutlined /> },
  ];

  /* ── 步骤导航 ── */
  const canNext = () => {
    if (current === 0) return selectedChipId !== null;
    if (current === 1) return selectedTemplateId !== null;
    if (current === 2) return true; // 评测项自动填充
    if (current === 3) return selectedPreset !== null;
    if (current === 4) return true; // 节点可选
    return true;
  };

  /* ── 提交成功 ── */
  if (submitted) {
    return (
      <Card>
        <Result
          status="success"
          title="\u8bc4\u6d4b\u8ba1\u5212\u521b\u5efa\u6210\u529f\uff01"
          subTitle={createdPlanId ? `\u8ba1\u5212\u7f16\u53f7: ${createdPlanId}` : `\u8ba1\u5212\u540d\u79f0\uff1a${generateName()}`}
          extra={[
            <Button type="primary" key="monitor" onClick={() => {
              if (onOpenMonitor && createdPlanId) { onOpenMonitor(createdPlanId); }
              else { navigate("/plans"); }
            }}>
              \u67e5\u770b\u76d1\u63a7
            </Button>,
            <Button key="list" onClick={() => {
              if (onBack) { onBack(); }
              else { navigate("/plans"); }
            }}>
              \u8fd4\u56de\u5217\u8868
            </Button>,
            <Button key="create" onClick={() => {
              setCurrent(0); setSelectedChipId(null); setSelectedTemplateId(null);
              setSelectedPreset("STANDARD"); setSelectedNodeIds([]); setSubmitted(false);
              setCreatedPlanId(null);
            }}>\u7ee7\u7eed\u521b\u5efa</Button>,
          ]}
        />
      </Card>
    );
  }

  /* ══════════════════════════════════════════════════════════
   *  Step 1: 选芯片
   * ══════════════════════════════════════════════════════════ */
  const renderStep1 = () => (
    <Spin spinning={chipsLoading}>
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary">选择要评测的目标芯片（仅显示待评测和已评测状态）</Text>
      </div>
      {chips.length === 0 && !chipsLoading ? (
        <Empty description="暂无可评测芯片">
          <Button type="primary" onClick={() => navigate("/chips")}>去注册芯片</Button>
        </Empty>
      ) : (
        <Radio.Group value={selectedChipId} onChange={e => setSelectedChipId(e.target.value)} style={{ width: "100%" }}>
          <Row gutter={[16, 16]}>
            {chips.map(chip => {
              const st = STATUS_MAP[chip.status] || { text: chip.status, status: "default" };
              const isSelected = selectedChipId === chip.id;
              return (
                <Col xs={24} sm={12} md={8} key={chip.id}>
                  <Card hoverable onClick={() => setSelectedChipId(chip.id)}
                    style={{ border: isSelected ? "2px solid #1890ff" : "1px solid #f0f0f0", background: isSelected ? "#e6f7ff" : "#fff", cursor: "pointer" }}>
                    <Space direction="vertical" size={4} style={{ width: "100%" }}>
                      <Space>
                        <Text strong style={{ fontSize: 16 }}>{chip.name}</Text>
                        {isSelected && <CheckCircleOutlined style={{ color: "#1890ff" }} />}
                      </Space>
                      <Text type="secondary">{chip.manufacturer}</Text>
                      <Space>
                        <Tag color={CHIP_TYPE_COLORS[chip.chipType] || "default"}>
                          {CHIP_TYPE_LABELS[chip.chipType] || chip.chipType}
                        </Tag>
                        <Badge status={st.status} text={st.text} />
                      </Space>
                    </Space>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Radio.Group>
      )}
    </Spin>
  );

  /* ══════════════════════════════════════════════════════════
   *  Step 2: 选模板
   * ══════════════════════════════════════════════════════════ */
  const renderTemplateCard = (t) => {
    const config = parseConfig(t.configJson);
    const isSelected = selectedTemplateId === t.id;
    const layer = t.evaluationLayer;
    const itemCount = config.itemCount || (config.operators?.length || 0) + (config.models?.length || 0);

    return (
      <Col xs={24} sm={12} md={8} key={t.id}>
        <Card hoverable size="small"
          onClick={() => setSelectedTemplateId(t.id)}
          style={{
            border: isSelected ? "2px solid #1890ff" : "1px solid #f0f0f0",
            background: isSelected ? "#e6f7ff" : "#fff",
            cursor: "pointer", minHeight: 160,
            borderLeft: isSelected ? "2px solid #1890ff" : `3px solid ${LAYER_COLORS[layer] ? `var(--ant-color-${LAYER_COLORS[layer]}, #1890ff)` : '#d9d9d9'}`,
          }}>
          <Space direction="vertical" size={4} style={{ width: "100%" }}>
            <Space>
              <Text strong>{t.name}</Text>
              {isSelected && <CheckCircleOutlined style={{ color: "#1890ff" }} />}
              {t.isSystem && <LockOutlined style={{ color: "#999", fontSize: 12 }} />}
            </Space>
            <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: 0, fontSize: 13 }}>
              {t.description}
            </Paragraph>
            <Space size={4} wrap>
              {layer && <Tag color={LAYER_COLORS[layer]}>{LAYER_LABELS[layer]}</Tag>}
              <Tag color="blue">{EVAL_TYPE_LABELS[t.evalType] || t.evalType}</Tag>
              {itemCount > 0 && <Tag color="cyan">{itemCount} 评测项</Tag>}
            </Space>
          </Space>
        </Card>
      </Col>
    );
  };

  const renderStep2 = () => (
    <Spin spinning={templatesLoading}>
      <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        {["system", "custom"].map(tab => (
          <Button key={tab} type={templateTab === tab ? "primary" : "default"} size="small"
            onClick={() => setTemplateTab(tab)}>
            {tab === "system" ? `📦 系统模板 (${systemTemplates.length})` : `📝 我的模板 (${customTemplates.length})`}
          </Button>
        ))}
      </div>

      {templateTab === "system" ? (
        <div>
          {Object.entries(groupedByLayer).map(([layer, tpls]) => {
            if (tpls.length === 0) return null;
            return (
              <div key={layer} style={{ marginBottom: 20 }}>
                <Divider orientation="left" style={{ margin: "8px 0 12px" }}>
                  <Space>
                    {LAYER_ICONS[layer]}
                    <span>{LAYER_LABELS[layer]} ({tpls.length})</span>
                  </Space>
                </Divider>
                <Row gutter={[12, 12]}>{tpls.map(renderTemplateCard)}</Row>
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          {customTemplates.length === 0 ? (
            <Empty description="暂无自定义模板" />
          ) : (
            <Row gutter={[12, 12]}>{customTemplates.map(renderTemplateCard)}</Row>
          )}
        </div>
      )}
    </Spin>
  );

  /* ══════════════════════════════════════════════════════════
   *  Step 3: 选评测项（基于模板自动填充）
   * ══════════════════════════════════════════════════════════ */

  /* Bug #201: 添加自定义评测项 */
  const handleAddCustomItem = async () => {
    try {
      const values = await customItemForm.validateFields();
      setCustomItems(prev => [...prev, values]);
      // 自动勾选新增项
      const newKey = `custom-${customItems.length}-${values.name}`;
      setCheckedKeys(prev => [...prev, newKey, 'custom-root']);
      customItemForm.resetFields();
      setCustomItemModalVisible(false);
      message.success('已添加自定义评测项');
    } catch (e) { /* validation error */ }
  };

  const handleRemoveCustomItem = (idx) => {
    setCustomItems(prev => prev.filter((_, i) => i !== idx));
  };

  const renderStep3 = () => (
    <div>
      <Alert message="勾选/取消评测项来调整评测范围，也可以添加自定义评测项" type="info" showIcon style={{ marginBottom: 16 }} />
      <Row gutter={24}>
        <Col span={14}>
          <Card title={<Space>评测项树<Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={() => setCustomItemModalVisible(true)}>添加自定义评测项</Button></Space>} size="small" style={{ minHeight: 300 }}>
            {evalTree.length > 0 ? (
              <Tree
                checkable
                defaultExpandAll
                checkedKeys={checkedKeys}
                onCheck={setCheckedKeys}
                treeData={evalTree}
                style={{ padding: 8 }}
              />
            ) : (
              <Empty description="请先选择模板" />
            )}
          </Card>
        </Col>
        <Col span={10}>
          <Card title="已选摘要" size="small" style={{ minHeight: 300 }}>
            {selectedTemplate ? (
              <Space direction="vertical" style={{ width: "100%" }}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="模板">{selectedTemplate.name}</Descriptions.Item>
                  <Descriptions.Item label="层级">
                    <Tag color={LAYER_COLORS[selectedTemplate.evaluationLayer]}>
                      {LAYER_LABELS[selectedTemplate.evaluationLayer] || "通用"}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="评测项数">
                    <Text strong style={{ color: "#1890ff", fontSize: 20 }}>{checkedKeys.filter(k => !k.includes('-root')).length}</Text> 项
                    {customItems.length > 0 && <Text type="secondary"> (含 {customItems.length} 自定义)</Text>}
                  </Descriptions.Item>
                </Descriptions>
                {parseConfig(selectedTemplate.configJson).operators && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>算子: </Text>
                    {parseConfig(selectedTemplate.configJson).operators.map(op => (
                      <Tag key={op} style={{ marginBottom: 4, fontSize: 11 }}>{op}</Tag>
                    ))}
                  </div>
                )}
                {parseConfig(selectedTemplate.configJson).models && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>模型: </Text>
                    {parseConfig(selectedTemplate.configJson).models.map(m => (
                      <Tag key={m} color="green" style={{ marginBottom: 4, fontSize: 11 }}>{m}</Tag>
                    ))}
                  </div>
                )}
                {customItems.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>自定义: </Text>
                    {customItems.map((item, idx) => (
                      <Tag key={idx} color="orange" closable onClose={() => handleRemoveCustomItem(idx)}
                        style={{ marginBottom: 4, fontSize: 11 }}>
                        {item.name}
                      </Tag>
                    ))}
                  </div>
                )}
              </Space>
            ) : (
              <Empty description="未选择模板" />
            )}
          </Card>
        </Col>
      </Row>

      {/* 自定义评测项弹窗 */}
      <Modal
        title="添加自定义评测项"
        open={customItemModalVisible}
        onCancel={() => { setCustomItemModalVisible(false); customItemForm.resetFields(); }}
        onOk={handleAddCustomItem}
        okText="添加"
      >
        <Form form={customItemForm} layout="vertical">
          <Form.Item name="name" label="评测项名称" rules={[{ required: true, message: '请输入评测项名称' }]}>
            <Input placeholder="如: custom_matmul, my_model_v2" />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true, message: '请选择类型' }]} initialValue="OPERATOR">
            <Select options={[
              { value: 'OPERATOR', label: '算子' },
              { value: 'MODEL', label: '模型' },
            ]} />
          </Form.Item>
          <Form.Item name="dataType" label="数据类型" rules={[{ required: true, message: '请选择数据类型' }]} initialValue="float32">
            <Select options={[
              { value: 'float32', label: 'float32' },
              { value: 'float16', label: 'float16' },
              { value: 'int8', label: 'int8' },
              { value: 'int4', label: 'int4' },
              { value: 'bfloat16', label: 'bfloat16' },
            ]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.type !== cur.type}>
            {({ getFieldValue }) =>
              getFieldValue('type') === 'OPERATOR' ? (
                <Form.Item name="shape" label="Shape (可选)">
                  <Input placeholder="如: [1, 3, 224, 224]" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );

  /* ══════════════════════════════════════════════════════════
   *  Step 4: 配参数 (#179 增强)
   * ══════════════════════════════════════════════════════════ */
  const PRESET_PARAMS = {
    QUICK:    { timeout: 300,  retryCount: 0, dataTypes: ["FP32"], batchSize: 1,  warmupIterations: 5,  benchmarkIterations: 10 },
    STANDARD: { timeout: 3600, retryCount: 1, dataTypes: ["FP32", "FP16"], batchSize: 32, warmupIterations: 10, benchmarkIterations: 100 },
    FULL:     { timeout: 7200, retryCount: 2, dataTypes: ["FP32", "FP16", "BF16", "INT8"], batchSize: 64, warmupIterations: 50, benchmarkIterations: 500 },
  };

  const handlePresetChange = (preset) => {
    setSelectedPreset(preset);
    const defaults = PRESET_PARAMS[preset] || PRESET_PARAMS.STANDARD;
    setAdvancedConfig(prev => ({ ...prev, ...defaults }));
  };

  const renderStep4 = () => (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">选择评测预设方案，决定评测的深度和广度</Text>
      </div>
      <Radio.Group value={selectedPreset} onChange={e => handlePresetChange(e.target.value)} style={{ width: "100%" }}>
        <Row gutter={[16, 16]}>
          {PRESETS.map(preset => {
            const isSelected = selectedPreset === preset.key;
            return (
              <Col xs={24} md={8} key={preset.key}>
                <Card hoverable onClick={() => handlePresetChange(preset.key)}
                  style={{
                    border: isSelected ? `2px solid ${preset.color}` : "1px solid #f0f0f0",
                    background: isSelected ? `${preset.color}08` : "#fff",
                    cursor: "pointer", textAlign: "center", minHeight: 180,
                  }}>
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    <Title level={4} style={{ margin: 0 }}>{preset.title}</Title>
                    <Text type="secondary">{preset.desc}</Text>
                    <Paragraph style={{ fontSize: 12, color: "#666", margin: 0 }}>{preset.detail}</Paragraph>
                    <div>
                      <Tag color="blue">{preset.duration}</Tag>
                      <Tag>约 {preset.taskCount} 个任务</Tag>
                    </div>
                    {isSelected && <CheckCircleOutlined style={{ color: preset.color, fontSize: 20 }} />}
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Radio.Group>

      {/* 预估任务数 */}
      <Card size="small" style={{ marginTop: 16, background: "#fafafa" }}>
        <Row gutter={16} align="middle">
          <Col>
            <Text>预估任务数: </Text>
            <Text strong style={{ fontSize: 20, color: "#1890ff" }}>{estimatedTasks}</Text>
            <Text> 个</Text>
          </Col>
          <Col>
            <Text type="secondary">预计耗时: </Text>
            <Tag color="orange">{estimatedDuration}</Tag>
          </Col>
        </Row>
      </Card>

      {/* 详细参数表 */}
      <Card size="small" title="📋 详细参数配置" style={{ marginTop: 16 }}>
        <Row gutter={[24, 16]}>
          {/* 超时时间滑块 */}
          <Col xs={24} md={12}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>超时时间</Text>
              <Text type="secondary" style={{ marginLeft: 8 }}>{advancedConfig.timeout}s ({Math.round(advancedConfig.timeout / 60)}分钟)</Text>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 12 }}>30s</Text>
              <input type="range" min={30} max={3600} step={30} value={advancedConfig.timeout}
                onChange={e => setAdvancedConfig(p => ({ ...p, timeout: Number(e.target.value) }))}
                style={{ flex: 1 }} />
              <Text style={{ fontSize: 12 }}>3600s</Text>
            </div>
          </Col>

          {/* 重试次数 Radio */}
          <Col xs={24} md={12}>
            <div style={{ marginBottom: 8 }}><Text strong>失败重试次数</Text></div>
            <Radio.Group value={advancedConfig.retryCount}
              onChange={e => setAdvancedConfig(p => ({ ...p, retryCount: e.target.value }))}>
              <Radio value={0}>不重试</Radio>
              <Radio value={1}>1次</Radio>
              <Radio value={2}>2次</Radio>
              <Radio value={3}>3次</Radio>
            </Radio.Group>
          </Col>

          {/* 数据类型多选 */}
          <Col xs={24} md={12}>
            <div style={{ marginBottom: 8 }}><Text strong>数据类型</Text></div>
            <Checkbox.Group value={advancedConfig.dataTypes}
              onChange={v => setAdvancedConfig(p => ({ ...p, dataTypes: v }))}>
              <Row gutter={[8, 8]}>
                {["FP32", "FP16", "BF16", "INT8"].map(dt => (
                  <Col key={dt}><Checkbox value={dt}>{dt}</Checkbox></Col>
                ))}
              </Row>
            </Checkbox.Group>
          </Col>

          {/* Batch Size */}
          <Col xs={24} md={12}>
            <div style={{ marginBottom: 8 }}><Text strong>Batch Size</Text></div>
            <InputNumber min={1} max={256} value={advancedConfig.batchSize}
              onChange={v => setAdvancedConfig(p => ({ ...p, batchSize: v }))}
              style={{ width: "100%" }}
              addonAfter={
                <Space size={4}>
                  {[1, 8, 32, 64, 128].map(v => (
                    <Tag key={v} style={{ cursor: "pointer", margin: 0 }}
                      color={advancedConfig.batchSize === v ? "blue" : "default"}
                      onClick={() => setAdvancedConfig(p => ({ ...p, batchSize: v }))}>
                      {v}
                    </Tag>
                  ))}
                </Space>
              } />
          </Col>
        </Row>
      </Card>

      {/* 高级选项折叠区 */}
      <Collapse ghost style={{ marginTop: 12 }}>
        <Panel header="⚙️ 高级选项" key="advanced">
          <Row gutter={24}>
            <Col span={12}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <Text>预热迭代次数 (warmup_iterations)</Text>
                <InputNumber min={5} max={100} value={advancedConfig.warmupIterations}
                  onChange={v => setAdvancedConfig(p => ({ ...p, warmupIterations: v }))}
                  style={{ width: "100%" }} />
                <Text type="secondary" style={{ fontSize: 12 }}>建议: 快速5, 标准10, 全量50</Text>
              </Space>
            </Col>
            <Col span={12}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <Text>基准测试迭代次数 (benchmark_iterations)</Text>
                <InputNumber min={10} max={1000} value={advancedConfig.benchmarkIterations}
                  onChange={v => setAdvancedConfig(p => ({ ...p, benchmarkIterations: v }))}
                  style={{ width: "100%" }} />
                <Text type="secondary" style={{ fontSize: 12 }}>建议: 快速10, 标准100, 全量500</Text>
              </Space>
            </Col>
          </Row>
        </Panel>
      </Collapse>
    </div>
  );

  /* ══════════════════════════════════════════════════════════
   *  Step 5: 选节点 (#180 增强)
   * ══════════════════════════════════════════════════════════ */
  const renderStep5 = () => {
    const toggleNode = (nodeId) => {
      setSelectedNodeIds(prev =>
        prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]
      );
    };

    // Filter nodes by type
    const filteredNodes = nodeTypeFilter === "ALL" ? nodes : nodes.filter(n => {
      const tags = (n.tags || "").toUpperCase();
      let hw;
      try { hw = typeof n.hardwareInfo === "string" ? JSON.parse(n.hardwareInfo) : n.hardwareInfo; } catch { hw = null; }
      if (nodeTypeFilter === "GPU") return tags.includes("GPU") || (hw && hw.gpu_count > 0);
      if (nodeTypeFilter === "NPU") return tags.includes("NPU");
      if (nodeTypeFilter === "CPU") return tags.includes("CPU") || (!tags.includes("GPU") && !tags.includes("NPU") && !(hw && hw.gpu_count > 0));
      return true;
    });

    const onlineNodes = nodes.filter(n => n.status === "ONLINE" || n.status === "BUSY");

    return (
      <Spin spinning={nodesLoading}>
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <Text type="secondary">选择执行评测的计算节点（可多选）</Text>
          <Space wrap>
            <Space size={4}>
              <Text style={{ fontSize: 13 }}>类型筛选:</Text>
              <Select value={nodeTypeFilter} onChange={setNodeTypeFilter} style={{ width: 100 }} size="small"
                options={[
                  { value: "ALL", label: "全部" },
                  { value: "CPU", label: "CPU" },
                  { value: "GPU", label: "GPU" },
                  { value: "NPU", label: "NPU" },
                ]} />
            </Space>
            <Space size={4}>
              <Text style={{ fontSize: 13 }}>资源模式:</Text>
              <Select value={resourceMode} onChange={setResourceMode} style={{ width: 120 }} size="small"
                options={[
                  { value: "shared", label: "🔄 共享模式" },
                  { value: "exclusive", label: "🔒 独占模式" },
                  { value: "auto", label: "⚡ 自动分配" },
                ]} />
            </Space>
          </Space>
        </div>

        {onlineNodes.length === 0 && !nodesLoading ? (
          <Alert
            message="当前无在线计算节点"
            description={
              <Space direction="vertical">
                <Text>请先注册并激活计算节点，才能执行评测任务。</Text>
                <Text type="secondary">步骤: 节点管理 → 注册节点 → 部署Agent → 等待心跳上线</Text>
              </Space>
            }
            type="warning" showIcon
            action={<Button size="small" type="primary" onClick={() => message.info("请前往节点管理页面注册节点")}>去注册节点</Button>}
          />
        ) : nodes.length === 0 && !nodesLoading ? (
          <Alert message="暂无计算节点" description="请先注册计算节点" type="info" showIcon />
        ) : (
          <Row gutter={[16, 16]}>
            {filteredNodes.map(node => {
              const status = NODE_STATUS_MAP[node.status] || NODE_STATUS_MAP.OFFLINE;
              const isOffline = node.status === "OFFLINE" || node.status === "ERROR";
              const isSelected = selectedNodeIds.includes(node.id);
              let hw;
              try { hw = typeof node.hardwareInfo === "string" ? JSON.parse(node.hardwareInfo) : node.hardwareInfo; } catch { hw = null; }

              return (
                <Col xs={24} sm={12} md={8} key={node.id}>
                  <Card hoverable={!isOffline}
                    onClick={() => !isOffline && toggleNode(node.id)}
                    style={{
                      border: isSelected ? "2px solid #1890ff" : "1px solid #f0f0f0",
                      background: isOffline ? "#fafafa" : isSelected ? "#e6f7ff" : "#fff",
                      cursor: isOffline ? "not-allowed" : "pointer",
                      opacity: isOffline ? 0.5 : 1,
                    }}>
                    <Space direction="vertical" size={4} style={{ width: "100%" }}>
                      <Space style={{ width: "100%", justifyContent: "space-between" }}>
                        <Space>
                          <CloudServerOutlined />
                          <Text strong>{node.name}</Text>
                          {isSelected && <CheckCircleOutlined style={{ color: "#1890ff" }} />}
                        </Space>
                        <Badge status={status.badge} text={status.text} />
                      </Space>
                      {node.ipAddress && <Text type="secondary" style={{ fontSize: 12 }}>{node.ipAddress}</Text>}

                      {/* 增强: 硬件详情卡片 */}
                      {hw ? (
                        <div style={{ background: "#f9f9f9", borderRadius: 4, padding: "6px 8px", marginTop: 4 }}>
                          {hw.cpu_model && (
                            <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>
                              <Text style={{ fontSize: 11 }}>CPU: {hw.cpu_model}</Text>
                            </div>
                          )}
                          <Space size={6} wrap>
                            {(hw.cpu_threads || hw.cpu_cores_logical) && (
                              <Tag style={{ fontSize: 11, margin: 0 }}>🖥 {hw.cpu_threads || hw.cpu_cores_logical}核</Tag>
                            )}
                            {hw.memory_total_gb && (
                              <Tag style={{ fontSize: 11, margin: 0 }}>💾 {Number(hw.memory_total_gb).toFixed(0)}GB</Tag>
                            )}
                            {hw.gpu_count > 0 && (
                              <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>🎮 GPU ×{hw.gpu_count}</Tag>
                            )}
                          </Space>
                          {hw.gpu_name && (
                            <div style={{ fontSize: 11, color: "#1890ff", marginTop: 2 }}>
                              GPU: {hw.gpu_name}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Text type="secondary" style={{ fontSize: 11 }}>硬件信息待上报</Text>
                      )}

                      {/* 负载预览 */}
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {node.status === "BUSY" ? "📊 运行中任务: 1" : node.status === "ONLINE" ? "📊 空闲" : ""}
                        </Text>
                        {node.tags && (
                          <Space size={2}>
                            {node.tags.split(",").filter(Boolean).slice(0, 3).map(tag => (
                              <Tag key={tag} style={{ fontSize: 10, margin: 0 }}>{tag.trim()}</Tag>
                            ))}
                          </Space>
                        )}
                      </div>
                    </Space>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}

        {selectedNodeIds.length > 0 && (
          <Card size="small" style={{ marginTop: 12, background: "#f6ffed" }}>
            <Space>
              <Text>已选 <Text strong style={{ color: "#1890ff" }}>{selectedNodeIds.length}</Text> 个节点</Text>
              <Text type="secondary">|</Text>
              <Text type="secondary">资源模式: {resourceMode === "exclusive" ? "🔒 独占" : resourceMode === "auto" ? "⚡ 自动" : "🔄 共享"}</Text>
              <Button size="small" type="link" onClick={() => setSelectedNodeIds([])}>清空选择</Button>
            </Space>
          </Card>
        )}
      </Spin>
    );
  };
  /* ══════════════════════════════════════════════════════════
   *  Step 6: 确认提交
   * ══════════════════════════════════════════════════════════ */
  const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));

  const renderStep6 = () => (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Title level={5}>📋 评测计划摘要</Title>
        <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
          <Descriptions.Item label="计划名称" span={2}>
            <Text strong>{generateName()}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="① 目标芯片">
            <Space>
              <Text>{selectedChip?.name}</Text>
              <Tag color={CHIP_TYPE_COLORS[selectedChip?.chipType]}>
                {CHIP_TYPE_LABELS[selectedChip?.chipType] || selectedChip?.chipType}
              </Tag>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="芯片厂商">{selectedChip?.manufacturer}</Descriptions.Item>
          <Descriptions.Item label="② 评测模板">
            <Space>
              <Text strong>{selectedTemplate?.name}</Text>
              {selectedTemplate?.evaluationLayer && (
                <Tag color={LAYER_COLORS[selectedTemplate.evaluationLayer]}>
                  {LAYER_LABELS[selectedTemplate.evaluationLayer]}
                </Tag>
              )}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="③ 评测项数">
            <Tag color="cyan">{totalItems} 项</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="④ 评测方案">
            <Text strong style={{ color: selectedPresetObj?.color }}>{selectedPresetObj?.title}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="方案说明">{selectedPresetObj?.desc}</Descriptions.Item>
          <Descriptions.Item label="⑤ 执行节点" span={2}>
            {selectedNodes.length > 0
              ? selectedNodes.map(n => <Tag key={n.id} color="blue">{n.name}</Tag>)
              : <Text type="secondary">未指定（将自动分配）</Text>
            }
          </Descriptions.Item>
          <Descriptions.Item label="资源模式">
            <Tag>{resourceMode === "exclusive" ? "独占" : "共享"}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="超时/重试">
            {advancedConfig.timeout}s / 重试{advancedConfig.retryCount}次
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 预估 */}
      <Card size="small" style={{ marginBottom: 16, background: "#f6ffed" }}>
        <Row gutter={24} justify="center">
          <Col>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="预估任务数">
                <Text strong style={{ fontSize: 18, color: "#1890ff" }}>{estimatedTasks}</Text> 个
              </Descriptions.Item>
              <Descriptions.Item label="预计耗时">
                <Tag color="orange" style={{ fontSize: 14 }}>{estimatedDuration}</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      <Row justify="center" gutter={16}>
        <Col>
          <Button size="large" icon={<SaveOutlined />} loading={submitting}
            onClick={() => handleSubmit(false)}>保存为草稿</Button>
        </Col>
        <Col>
          <Button type="primary" size="large" icon={<PlayCircleOutlined />} loading={submitting}
            onClick={() => handleSubmit(true)}>提交并执行</Button>
        </Col>
      </Row>
    </div>
  );

  const stepContent = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6];

  return (
    <div>
      <Card>
        <Steps current={current} items={steps} size="small" style={{ marginBottom: 24 }} />

        <div style={{ minHeight: 350, padding: "16px 0" }}>
          {stepContent[current]()}
        </div>

        {/* 底部导航 */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
          <div>
            {current > 0 && (
              <Button icon={<ArrowLeftOutlined />} onClick={() => setCurrent(current - 1)}>上一步</Button>
            )}
          </div>
          <div>
            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>步骤 {current + 1} / {steps.length}</Text>
              {current < 5 && (
                <Button type="primary" disabled={!canNext()} onClick={() => setCurrent(current + 1)}>
                  下一步 <ArrowRightOutlined />
                </Button>
              )}
            </Space>
          </div>
        </div>
      </Card>
    </div>
  );
}
