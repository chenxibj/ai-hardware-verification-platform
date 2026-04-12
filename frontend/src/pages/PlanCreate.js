/**
 * @file PlanCreate.js
 * @description 创建评测任务 — 8步向导
 * Issue: #162 - 评测任务创建向导
 * @feat #251 - 资源池选择 + least_loaded 调度
 * @feat #398 - 运行规格 + 资源池选择步骤
 * Steps: 选芯片 → 选模板 → 选评测项 → 运行规格 → 选择资源池 → 配参数 → 关联资产 → 确认提交
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
  HddOutlined, InfoCircleOutlined, CodeOutlined, EyeOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import { runSpecApi, resourcePoolApi } from "../utils/api";
import AssetSelector, { savePlanAssets } from "../components/AssetSelector";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

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
  if (config.operators && config.operators.length > 0) {
    items.push({
      title: `算子评测 (${config.operators.length}项)`, key: `op-root-${keyIdx++}`,
      icon: <AppstoreOutlined />,
      children: config.operators.map(op => ({ title: op, key: `op-${op}-${keyIdx++}`, isLeaf: true })),
    });
  }
  if (config.models && config.models.length > 0) {
    items.push({
      title: `模型评测 (${config.models.length}项)`, key: `model-root-${keyIdx++}`,
      icon: <RocketOutlined />,
      children: config.models.map(m => ({ title: m, key: `model-${m}-${keyIdx++}`, isLeaf: true })),
    });
  }
  if (config.data_types && config.data_types.length > 0) {
    items.push({
      title: `精度类型 (${config.data_types.length}项)`, key: `dtype-root-${keyIdx++}`,
      icon: <DatabaseOutlined />,
      children: config.data_types.map(d => ({ title: d, key: `dtype-${d}-${keyIdx++}`, isLeaf: true })),
    });
  }
  if (config.benchmarks && config.benchmarks.length > 0) {
    items.push({
      title: `基准测试 (${config.benchmarks.length}项)`, key: `bench-root-${keyIdx++}`,
      icon: <BarChartOutlined />,
      children: config.benchmarks.map(b => ({ title: b, key: `bench-${b}-${keyIdx++}`, isLeaf: true })),
    });
  }
  if (items.length === 0) {
    items.push({
      title: `评测项 (${config.itemCount || '未知'}项)`, key: 'generic-root',
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
  const [scriptPreviewId, setScriptPreviewId] = useState(null);
  const [scriptPreviewData, setScriptPreviewData] = useState([]);
  const [scriptPreviewLoading, setScriptPreviewLoading] = useState(false);

  /* Step 3: 评测项 */
  const [checkedKeys, setCheckedKeys] = useState([]);
  const [customItems, setCustomItems] = useState([]);
  const [customItemModalVisible, setCustomItemModalVisible] = useState(false);
  const [customItemForm] = Form.useForm();

  /* Step 4: 运行规格 (NEW #398) */
  const [runSpecs, setRunSpecs] = useState([]);
  const [runSpecsLoading, setRunSpecsLoading] = useState(false);
  const [selectedRunSpecId, setSelectedRunSpecId] = useState(null);

  /* Step 5: 资源池 (NEW #398) */
  const [resourcePools, setResourcePools] = useState([]);
  const [poolsLoading, setPoolsLoading] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState(null);
  const [poolAvailability, setPoolAvailability] = useState({}); // poolId -> availability
  /* 高级模式: 手动选节点 */
  const [nodes, setNodes] = useState([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [nodeTypeFilter, setNodeTypeFilter] = useState("ALL");
  const [resourceMode, setResourceMode] = useState("auto");

  /* Step 6: 配参数 */
  const [selectedPreset, setSelectedPreset] = useState("STANDARD");
  const [advancedConfig, setAdvancedConfig] = useState({
    timeout: 3600, retryCount: 1,
    dataTypes: ["FP32"], batchSize: 32,
    warmupIterations: 10, benchmarkIterations: 100,
  });

  /* Step 7: 关联资产 (#268) */
  const [assetSelectorVisible, setAssetSelectorVisible] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState([]);

  /* Step 8: 提交 */
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [createdPlanId, setCreatedPlanId] = useState(null);

  /* ── 获取芯片列表 ── */
  const fetchChips = useCallback(async () => {
    setChipsLoading(true);
    try {
      const { data: resp } = await api.get("/chips", { params: { page: 0, size: 100 } });
      if (resp.code === 0) setChips((resp.data || []).filter(c => !["DISABLED", "DELETED"].includes(c.status)));
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

  /* ── #409: 获取模板脚本预览 ── */
  const fetchScriptPreview = useCallback(async (tplId) => {
    if (scriptPreviewId === tplId) { setScriptPreviewId(null); return; }
    setScriptPreviewId(tplId);
    setScriptPreviewLoading(true);
    try {
      const { data: resp } = await api.get(`/templates/${tplId}/scripts`);
      if (resp.code === 0) setScriptPreviewData(resp.data?.scripts || []);
    } catch (e) { message.error("获取脚本失败"); }
    finally { setScriptPreviewLoading(false); }
  }, [scriptPreviewId]);

  /* ── #398: 获取运行规格 ── */
  const fetchRunSpecs = useCallback(async (category) => {
    setRunSpecsLoading(true);
    try {
      const { data: resp } = await runSpecApi.list(category);
      if (resp.code === 0) setRunSpecs(resp.data || []);
      else setRunSpecs([]);
    } catch (e) { message.error("获取运行规格失败"); setRunSpecs([]); }
    finally { setRunSpecsLoading(false); }
  }, []);

  /* ── #398: 获取资源池 + 可用性 ── */
  const fetchPoolsWithAvailability = useCallback(async (chipType) => {
    setPoolsLoading(true);
    try {
      const poolType = chipType === "CPU" ? "CPU" : "GPU";
      const { data: resp } = await resourcePoolApi.list({ type: poolType });
      const pools = resp.code === 0 ? (resp.data || []) : [];
      setResourcePools(pools);
      // Fetch availability for each pool
      const avail = {};
      await Promise.all(pools.map(async (pool) => {
        try {
          const { data: ar } = await resourcePoolApi.availability(pool.id);
          avail[pool.id] = ar.code === 0 ? ar.data : ar;
        } catch { avail[pool.id] = null; }
      }));
      setPoolAvailability(avail);
    } catch (e) { message.error("获取资源池列表失败"); setResourcePools([]); }
    finally { setPoolsLoading(false); }
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

  // When entering step 4 (RunSpec), fetch specs based on chip type
  useEffect(() => {
    if (current === 3 && selectedChip) {
      // #398: Show all RunSpecs
      fetchRunSpecs();
    }
  }, [current, selectedChipId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When entering step 5 (ResourcePool), fetch pools
  useEffect(() => {
    if (current === 4 && selectedChip) {
      fetchPoolsWithAvailability(selectedChip.chipType || "GPU");
    }
  }, [current, selectedChipId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 导出选中对象 ── */
  const selectedChip = chips.find(c => c.id === selectedChipId);
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const selectedPresetObj = PRESETS.find(p => p.key === selectedPreset);
  const selectedPool = resourcePools.find(p => p.id === selectedPoolId);
  const selectedRunSpec = runSpecs.find(s => s.id === selectedRunSpecId);

  /* ── 当模板变化时自动填充评测项 ── */
  useEffect(() => {
    if (selectedTemplate) {
      const tree = buildEvalItemTree(selectedTemplate);
      const allKeys = [];
      const collectKeys = (nodes) => { nodes.forEach(n => { allKeys.push(n.key); if (n.children) collectKeys(n.children); }); };
      collectKeys(tree);
      setCheckedKeys(allKeys);
    }
  }, [selectedTemplateId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 模板分组 ── */
  const systemTemplates = useMemo(() => templates.filter(t => t.isSystem), [templates]);
  const customTemplates = useMemo(() => templates.filter(t => !t.isSystem), [templates]);
  const groupedByLayer = useMemo(() => {
    const groups = { CHIP: [], OPERATOR: [], MODEL: [], COMPARISON: [] };
    systemTemplates.forEach(t => { const layer = t.evaluationLayer || 'OTHER'; if (groups[layer]) groups[layer].push(t); });
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

  const estimatedDuration = useMemo(() => {
    if (!selectedPresetObj) return "-";
    return selectedPresetObj.duration;
  }, [selectedPresetObj]);

  const evalTree = useMemo(() => {
    const baseTree = buildEvalItemTree(selectedTemplate);
    if (customItems.length > 0) {
      const customChildren = customItems.map((item, idx) => ({
        title: `${item.name} (${item.dataType}${item.shape ? ', ' + item.shape : ''})`,
        key: `custom-${idx}-${item.name}`, isLeaf: true,
      }));
      baseTree.push({ title: `自定义评测项 (${customItems.length}项)`, key: 'custom-root', icon: <PlusOutlined />, children: customChildren });
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
        resourcePoolId: selectedPoolId || null,
        runSpecId: selectedRunSpec?.id || null,
        runSpecCode: selectedRunSpec?.code || null,
        evalConfig: JSON.stringify({
          preset: selectedPreset,
          templateId: selectedTemplateId,
          templateName: selectedTemplate?.name,
          nodeIds: selectedNodeIds,
          resourcePoolId: selectedPoolId || null,
          runSpecId: selectedRunSpec?.id || null,
          runSpecCode: selectedRunSpec?.code || null,
          schedulingStrategy: selectedPoolId ? "least_loaded" : "manual",
          resourceMode,
          timeout: advancedConfig.timeout,
          retryCount: advancedConfig.retryCount,
          dataTypes: advancedConfig.dataTypes,
          batchSize: advancedConfig.batchSize,
          warmupIterations: advancedConfig.warmupIterations,
          benchmarkIterations: advancedConfig.benchmarkIterations,
          itemCount: countEvalItems(selectedTemplate),
          selectedItems: checkedKeys || [],
          customItems: customItems || [],
        }),
        nodeId: selectedNodeIds.length > 0 ? selectedNodeIds[0] : null,
        status: runNow ? "RUNNING" : "DRAFT",
      };
      const { data: resp } = await api.post("/plans", payload);
      if (resp.code === 0) {
        message.success(runNow ? "任务已创建并启动执行" : "任务已保存为草稿");
        if (selectedAssetIds.length > 0 && resp.data?.id) savePlanAssets(resp.data.id, selectedAssetIds);
        setCreatedPlanId(resp.data?.id || resp.data);
        setSubmitted(true);
      } else { message.error(resp.message || "创建失败"); }
    } catch (e) { message.error("创建失败: " + (e.response?.data?.message || e.message)); }
    finally { setSubmitting(false); }
  };

  /* ── 步骤配置 ── */
  const steps = [
    { title: "选择芯片", icon: <ExperimentOutlined /> },
    { title: "选择模板", icon: <FileTextOutlined /> },
    { title: "评测项", icon: <UnorderedListOutlined /> },
    { title: "运行规格", icon: <HddOutlined /> },
    { title: "选择资源池", icon: <CloudServerOutlined /> },
    { title: "配置参数", icon: <SettingOutlined /> },
    { title: "关联资产", icon: <DatabaseOutlined /> },
    { title: "确认提交", icon: <CheckCircleOutlined /> },
  ];

  /* ── 步骤导航 ── */
  const canNext = () => {
    if (current === 0) return selectedChipId !== null;
    if (current === 1) return selectedTemplateId !== null;
    if (current === 2) return true;
    if (current === 3) return true; // 运行规格必选
    if (current === 4) return true; // 资源池可选
    if (current === 5) return selectedPreset !== null;
    if (current === 6) return true; // 关联资产可选
    return true;
  };

  /* ── 提交成功 ── */
  if (submitted) {
    return (
      <Card>
        <Result
          status="success" title="评测任务创建成功！"
          subTitle={createdPlanId ? `任务编号: ${createdPlanId}` : `任务名称：${generateName()}`}
          extra={[
            <Button type="primary" key="monitor" onClick={() => {
              if (onOpenMonitor && createdPlanId) onOpenMonitor(createdPlanId);
              else navigate("/plans");
            }}>查看监控</Button>,
            <Button key="list" onClick={() => { if (onBack) onBack(); else navigate("/plans"); }}>返回列表</Button>,
            <Button key="create" onClick={() => {
              setCurrent(0); setSelectedChipId(null); setSelectedTemplateId(null);
              setSelectedPreset("STANDARD"); setSelectedNodeIds([]); setSubmitted(false);
              setCreatedPlanId(null); setSelectedRunSpecId(null); setSelectedPoolId(null);
            }}>继续创建</Button>,
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
      <div style={{ marginBottom: 12 }}><Text type="secondary">选择要评测的目标芯片</Text></div>
      {chips.length === 0 && !chipsLoading ? (
        <Empty description="暂无可评测芯片"><Button type="primary" onClick={() => navigate("/chips")}>去注册芯片</Button></Empty>
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
                        <Tag color={CHIP_TYPE_COLORS[chip.chipType] || "default"}>{CHIP_TYPE_LABELS[chip.chipType] || chip.chipType}</Tag>
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
    const showingScripts = scriptPreviewId === t.id;
    return (
      <Col xs={24} sm={12} md={8} key={t.id}>
        <Card hoverable size="small" onClick={() => setSelectedTemplateId(t.id)}
          style={{
            border: isSelected ? "2px solid #1890ff" : "1px solid #f0f0f0",
            background: isSelected ? "#e6f7ff" : "#fff", cursor: "pointer", minHeight: 160,
            borderLeft: isSelected ? "2px solid #1890ff" : `3px solid ${LAYER_COLORS[layer] ? `var(--ant-color-${LAYER_COLORS[layer]}, #1890ff)` : '#d9d9d9'}`,
          }}>
          <Space direction="vertical" size={4} style={{ width: "100%" }}>
            <Space>
              <Text strong>{t.name}</Text>
              <Tag color="geekblue" style={{ fontSize: 10 }}>v{t.version || "1.0"}</Tag>
              {isSelected && <CheckCircleOutlined style={{ color: "#1890ff" }} />}
              {t.isSystem && <LockOutlined style={{ color: "#999", fontSize: 12 }} />}
            </Space>
            <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: 0, fontSize: 13 }}>{t.description}</Paragraph>
            <Space size={4} wrap>
              {layer && <Tag color={LAYER_COLORS[layer]}>{LAYER_LABELS[layer]}</Tag>}
              <Tag color="blue">{EVAL_TYPE_LABELS[t.evalType] || t.evalType}</Tag>
              {itemCount > 0 && <Tag color="cyan">{itemCount} 评测项</Tag>}
            </Space>
            <Button size="small" type="link" icon={<CodeOutlined />}
              onClick={(e) => { e.stopPropagation(); fetchScriptPreview(t.id); }}
              style={{ padding: 0, height: "auto", fontSize: 12 }}>
              {showingScripts ? "收起脚本" : "预览评测脚本"}
            </Button>
          </Space>
        </Card>
        {showingScripts && (
          <Card size="small" style={{ marginTop: 4, maxHeight: 300, overflow: "auto" }}>
            <Spin spinning={scriptPreviewLoading}>
              {scriptPreviewData.length === 0 ? <Empty description="暂无脚本" image={Empty.PRESENTED_IMAGE_SIMPLE} /> :
                scriptPreviewData.map((s, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <Space style={{ marginBottom: 4 }}>
                      <CodeOutlined /><Text strong style={{ fontSize: 12 }}>{s.name}</Text>
                      <Tag color="blue" style={{ fontSize: 10 }}>{s.filename}</Tag>
                    </Space>
                    <SyntaxHighlighter language="python" style={oneDark}
                      showLineNumbers customStyle={{ maxHeight: 200, fontSize: 11, borderRadius: 6 }}>
                      {(s.content || "").slice(0, 2000) + (s.content?.length > 2000 ? "\n# ... 更多内容请在模板详情页查看" : "")}
                    </SyntaxHighlighter>
                  </div>
                ))
              }
            </Spin>
          </Card>
        )}
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
                  <Space>{LAYER_ICONS[layer]}<span>{LAYER_LABELS[layer]} ({tpls.length})</span></Space>
                </Divider>
                <Row gutter={[12, 12]}>{tpls.map(renderTemplateCard)}</Row>
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          {customTemplates.length === 0 ? <Empty description="暂无自定义模板" /> : (
            <Row gutter={[12, 12]}>{customTemplates.map(renderTemplateCard)}</Row>
          )}
        </div>
      )}
    </Spin>
  );

  /* ══════════════════════════════════════════════════════════
   *  Step 3: 选评测项
   * ══════════════════════════════════════════════════════════ */
  const handleAddCustomItem = async () => {
    try {
      const values = await customItemForm.validateFields();
      setCustomItems(prev => [...prev, values]);
      const newKey = `custom-${customItems.length}-${values.name}`;
      setCheckedKeys(prev => [...prev, newKey, 'custom-root']);
      customItemForm.resetFields();
      setCustomItemModalVisible(false);
      message.success('已添加自定义评测项');
    } catch (e) { /* validation */ }
  };
  const handleRemoveCustomItem = (idx) => { setCustomItems(prev => prev.filter((_, i) => i !== idx)); };

  const renderStep3 = () => (
    <div>
      <Alert message="勾选/取消评测项来调整评测范围，也可以添加自定义评测项" type="info" showIcon style={{ marginBottom: 16 }} />
      <Row gutter={24}>
        <Col span={14}>
          <Card title={<Space>评测项树<Button size="small" type="primary" ghost icon={<PlusOutlined />} onClick={() => setCustomItemModalVisible(true)}>添加自定义评测项</Button></Space>} size="small" style={{ minHeight: 300 }}>
            {evalTree.length > 0 ? (
              <Tree checkable defaultExpandAll checkedKeys={checkedKeys} onCheck={setCheckedKeys} treeData={evalTree} style={{ padding: 8 }} />
            ) : <Empty description="请先选择模板" />}
          </Card>
        </Col>
        <Col span={10}>
          <Card title="已选摘要" size="small" style={{ minHeight: 300 }}>
            {selectedTemplate ? (
              <Space direction="vertical" style={{ width: "100%" }}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="模板">{selectedTemplate.name}</Descriptions.Item>
                  <Descriptions.Item label="层级"><Tag color={LAYER_COLORS[selectedTemplate.evaluationLayer]}>{LAYER_LABELS[selectedTemplate.evaluationLayer] || "通用"}</Tag></Descriptions.Item>
                  <Descriptions.Item label="评测项数">
                    <Text strong style={{ color: "#1890ff", fontSize: 20 }}>{checkedKeys.filter(k => !k.includes('-root')).length}</Text> 项
                    {customItems.length > 0 && <Text type="secondary"> (含 {customItems.length} 自定义)</Text>}
                  </Descriptions.Item>
                </Descriptions>
                {parseConfig(selectedTemplate.configJson).operators && (
                  <div><Text type="secondary" style={{ fontSize: 12 }}>算子: </Text>
                    {parseConfig(selectedTemplate.configJson).operators.map(op => <Tag key={op} style={{ marginBottom: 4, fontSize: 11 }}>{op}</Tag>)}
                  </div>
                )}
                {parseConfig(selectedTemplate.configJson).models && (
                  <div style={{ marginTop: 8 }}><Text type="secondary" style={{ fontSize: 12 }}>模型: </Text>
                    {parseConfig(selectedTemplate.configJson).models.map(m => <Tag key={m} color="green" style={{ marginBottom: 4, fontSize: 11 }}>{m}</Tag>)}
                  </div>
                )}
                {customItems.length > 0 && (
                  <div style={{ marginTop: 8 }}><Text type="secondary" style={{ fontSize: 12 }}>自定义: </Text>
                    {customItems.map((item, idx) => (
                      <Tag key={idx} color="orange" closable onClose={() => handleRemoveCustomItem(idx)} style={{ marginBottom: 4, fontSize: 11 }}>{item.name}</Tag>
                    ))}
                  </div>
                )}
              </Space>
            ) : <Empty description="未选择模板" />}
          </Card>
        </Col>
      </Row>
      <Modal title="添加自定义评测项" open={customItemModalVisible}
        onCancel={() => { setCustomItemModalVisible(false); customItemForm.resetFields(); }}
        onOk={handleAddCustomItem} okText="添加">
        <Form form={customItemForm} layout="vertical">
          <Form.Item name="name" label="评测项名称" rules={[{ required: true, message: '请输入评测项名称' }]}>
            <Input placeholder="如: custom_matmul, my_model_v2" />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true, message: '请选择类型' }]} initialValue="OPERATOR">
            <Select options={[{ value: 'OPERATOR', label: '算子' }, { value: 'MODEL', label: '模型' }]} />
          </Form.Item>
          <Form.Item name="dataType" label="数据类型" rules={[{ required: true, message: '请选择数据类型' }]} initialValue="float32">
            <Select options={[{ value: 'float32', label: 'float32' }, { value: 'float16', label: 'float16' }, { value: 'int8', label: 'int8' }, { value: 'int4', label: 'int4' }, { value: 'bfloat16', label: 'bfloat16' }]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.type !== cur.type}>
            {({ getFieldValue }) => getFieldValue('type') === 'OPERATOR' ? (
              <Form.Item name="shape" label="Shape (可选)"><Input placeholder="如: [1, 3, 224, 224]" /></Form.Item>
            ) : null}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );

  /* ══════════════════════════════════════════════════════════
   *  Step 4: 运行规格 (NEW #398)
   * ══════════════════════════════════════════════════════════ */
  const isCpuChip = selectedChip?.chipType === "CPU";

  const renderStep4RunSpec = () => (
    <Spin spinning={runSpecsLoading}>
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">选择运行规格，决定评测任务所需的计算资源配置</Text>
      </div>
      {runSpecs.length === 0 && !runSpecsLoading ? (
        <Empty description="暂无运行规格配置" />
      ) : (
        <Row gutter={[16, 16]}>
          {runSpecs.map(spec => {
            const isSelected = selectedRunSpecId === spec.id;
            const specSummary = isCpuChip
              ? `${spec.nodeCount} 节点 · ${spec.cpuCores || '-'} CPU核`
              : `${spec.nodeCount} 节点 × ${spec.gpuPerNode || 0} GPU`;
            const totalGpu = (spec.nodeCount || 1) * (spec.gpuPerNode || 0);
            return (
              <Col xs={24} sm={12} md={8} key={spec.id}>
                <Card hoverable onClick={() => setSelectedRunSpecId(spec.id)}
                  style={{
                    border: isSelected ? "2px solid #1890ff" : "1px solid #f0f0f0",
                    background: isSelected ? "#e6f7ff" : "#fff",
                    cursor: "pointer", minHeight: 160,
                  }}>
                  <Space direction="vertical" size={6} style={{ width: "100%" }}>
                    <Space style={{ width: "100%", justifyContent: "space-between" }}>
                      <Text strong style={{ fontSize: 15 }}>{spec.name}</Text>
                      {isSelected && <CheckCircleOutlined style={{ color: "#1890ff", fontSize: 18 }} />}
                    </Space>
                    <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: 0, fontSize: 13 }}>
                      {spec.description || "无描述"}
                    </Paragraph>
                    <div>
                      <Tag color="blue">{specSummary}</Tag>
                      {spec.memoryGb > 0 && <Tag>{spec.memoryGb}GB 内存</Tag>}
                      {spec.parallelMode && <Tag color="purple">{spec.parallelMode}</Tag>}
                    </div>
                    {!isCpuChip && spec.gpuExclusive && <Tag color="red">GPU 独占</Tag>}
                    {isCpuChip && spec.cpuExclusive && <Tag color="red">CPU 独占</Tag>}
                  </Space>
                </Card>
              </Col>
            );
          })}
          {/* 自定义卡片 */}
          <Col xs={24} sm={12} md={8}>
            <Card hoverable onClick={() => setSelectedRunSpecId("custom")}
              style={{
                border: selectedRunSpecId === "custom" ? "2px solid #faad14" : "1px dashed #d9d9d9",
                background: selectedRunSpecId === "custom" ? "#fffbe6" : "#fafafa",
                cursor: "pointer", minHeight: 160, textAlign: "center",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              <Space direction="vertical" size={8}>
                <PlusOutlined style={{ fontSize: 28, color: "#faad14" }} />
                <Text strong>自定义规格</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>预设规格不满足时，自行配置资源</Text>
              </Space>
            </Card>
          </Col>
        </Row>
      )}

      {/* 资源预估 */}
      {selectedRunSpec && selectedRunSpecId !== "custom" && (
        <Card size="small" style={{ marginTop: 16, background: "#f6ffed" }}>
          <Row gutter={16} align="middle">
            <Col>
              <Text strong>📊 资源预估: </Text>
              <Text>{selectedRunSpec.nodeCount} 台节点</Text>
              {!isCpuChip && <>
                <Text> × {selectedRunSpec.gpuPerNode || 0} GPU</Text>
                <Text> = </Text>
                <Text strong style={{ fontSize: 18, color: "#1890ff" }}>{(selectedRunSpec.nodeCount || 1) * (selectedRunSpec.gpuPerNode || 0)}</Text>
                <Text> GPU</Text>
              </>}
              {isCpuChip && <>
                <Text> × {selectedRunSpec.cpuCores || '-'} CPU核</Text>
              </>}
            </Col>
            {selectedRunSpec.parallelMode && (
              <Col><Tag color="purple">并行模式: {selectedRunSpec.parallelMode}</Tag></Col>
            )}
          </Row>
        </Card>
      )}
    </Spin>
  );

  /* ══════════════════════════════════════════════════════════
   *  Step 5: 选择资源池 (NEW #398)
   * ══════════════════════════════════════════════════════════ */
  const renderStep5ResourcePool = () => {
    const requiredNodes = selectedRunSpec?.nodeCount || 1;
    const requiredGpuPerNode = isCpuChip ? 0 : (selectedRunSpec?.gpuPerNode || 0);

    // Split pools into qualified / unqualified
    const qualifiedPools = [];
    const unqualifiedPools = [];
    resourcePools.filter(p => p.status === "ACTIVE").forEach(pool => {
      const avail = poolAvailability[pool.id];
      const availNodes = avail?.availableNodes ?? pool.onlineNodeCount ?? 0;
      const availGpu = avail?.availableGpus ?? pool.totalGpu ?? 0;
      const meetsNodes = availNodes >= requiredNodes;
      const meetsGpu = isCpuChip || availGpu >= requiredNodes * requiredGpuPerNode;
      if (meetsNodes && meetsGpu) qualifiedPools.push(pool);
      else unqualifiedPools.push({ pool, availNodes, availGpu, meetsNodes, meetsGpu });
    });

    const renderPoolCard = (pool, disabled = false, reason = "") => {
      const isSelected = selectedPoolId === pool.id;
      const avail = poolAvailability[pool.id];
      const availGpu = avail?.availableGpus ?? pool.totalGpu ?? 0;
      const availNodes = avail?.availableNodes ?? pool.onlineNodeCount ?? 0;
      const queueLen = avail?.queueLength ?? 0;
      return (
        <Col xs={24} sm={12} md={8} key={pool.id}>
          <Card hoverable={!disabled}
            onClick={() => { if (!disabled) { setSelectedPoolId(isSelected ? null : pool.id); setSelectedNodeIds([]); } }}
            style={{
              border: isSelected ? "2px solid #1890ff" : "1px solid #f0f0f0",
              background: disabled ? "#f5f5f5" : isSelected ? "#e6f7ff" : "#fff",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
            }}>
            <Space direction="vertical" size={4} style={{ width: "100%" }}>
              <Space style={{ width: "100%", justifyContent: "space-between" }}>
                <Space>
                  <CloudServerOutlined style={{ color: disabled ? "#999" : "#1890ff" }} />
                  <Text strong>{pool.name}</Text>
                  {isSelected && <CheckCircleOutlined style={{ color: "#1890ff" }} />}
                </Space>
                <Tag color={disabled ? "default" : "green"}>{pool.type}</Tag>
              </Space>
              {pool.chipModel && <Text type="secondary" style={{ fontSize: 12 }}>芯片型号: {pool.chipModel}</Text>}
              <Space size={8} wrap style={{ marginTop: 4 }}>
                <Tag color={availNodes > 0 ? "green" : "default"}>🖥 在线 {availNodes} 节点</Tag>
                {!isCpuChip && <Tag color="blue">🎮 可用 {availGpu} GPU</Tag>}
                {queueLen > 0 && <Tag color="orange">📋 排队 {queueLen}</Tag>}
              </Space>
              {disabled && reason && (
                <div style={{ marginTop: 6, padding: "4px 8px", background: "#fff1f0", borderRadius: 4 }}>
                  <Text style={{ fontSize: 11, color: "#ff4d4f" }}>❌ {reason}</Text>
                </div>
              )}
              {isSelected && !disabled && (
                <div style={{ marginTop: 6, padding: "4px 8px", background: "#f6ffed", borderRadius: 4 }}>
                  <Text style={{ fontSize: 11, color: "#52c41a" }}>⚡ 系统将自动选择负载最低节点执行</Text>
                </div>
              )}
            </Space>
          </Card>
        </Col>
      );
    };

    const toggleNode = (nodeId) => {
      setSelectedNodeIds(prev => prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]);
    };
    const filteredNodes = nodeTypeFilter === "ALL" ? nodes : nodes.filter(n => {
      const tags = (n.tags || "").toUpperCase();
      let hw; try { hw = typeof n.hardwareInfo === "string" ? JSON.parse(n.hardwareInfo) : n.hardwareInfo; } catch { hw = null; }
      if (nodeTypeFilter === "GPU") return tags.includes("GPU") || (hw && hw.gpu_count > 0);
      if (nodeTypeFilter === "NPU") return tags.includes("NPU");
      if (nodeTypeFilter === "CPU") return tags.includes("CPU") || (!tags.includes("GPU") && !tags.includes("NPU") && !(hw && hw.gpu_count > 0));
      return true;
    });

    return (
      <Spin spinning={poolsLoading}>
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">选择执行评测的资源池，系统将自动分配最优节点</Text>
          {selectedRunSpec && selectedRunSpecId !== "custom" && (
            <Tag color="blue" style={{ marginLeft: 8 }}>
              需求: {requiredNodes} 节点{!isCpuChip && ` · ${requiredNodes * requiredGpuPerNode} GPU`}
            </Tag>
          )}
        </div>

        {/* ✅ 满足条件 */}
        {qualifiedPools.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Divider orientation="left" style={{ margin: "8px 0 12px" }}>
              <Space><CheckCircleOutlined style={{ color: "#52c41a" }} /><span>满足条件 ({qualifiedPools.length})</span></Space>
            </Divider>
            <Row gutter={[16, 16]}>{qualifiedPools.map(p => renderPoolCard(p))}</Row>
          </div>
        )}

        {/* ❌ 不满足条件 */}
        {unqualifiedPools.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Divider orientation="left" style={{ margin: "8px 0 12px" }}>
              <Space><InfoCircleOutlined style={{ color: "#ff4d4f" }} /><span>资源不足 ({unqualifiedPools.length})</span></Space>
            </Divider>
            <Row gutter={[16, 16]}>
              {unqualifiedPools.map(({ pool, meetsNodes, meetsGpu, availNodes, availGpu }) => {
                const reasons = [];
                if (!meetsNodes) reasons.push(`需 ${requiredNodes} 节点，仅 ${availNodes} 可用`);
                if (!meetsGpu) reasons.push(`需 ${requiredNodes * requiredGpuPerNode} GPU，仅 ${availGpu} 可用`);
                return renderPoolCard(pool, true, reasons.join('；'));
              })}
            </Row>
          </div>
        )}

        {resourcePools.filter(p => p.status === "ACTIVE").length === 0 && !poolsLoading && (
          <Empty description="暂无可用资源池" />
        )}

        {/* 高级模式: 手动选节点 */}
        <Collapse ghost style={{ marginTop: 16 }}>
          <Panel header="🔧 高级模式：手动选择节点" key="manual-nodes">
            <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <Button size="small" onClick={() => { if (nodes.length === 0) fetchNodes(); }}>
                {nodesLoading ? "加载中..." : nodes.length > 0 ? `已加载 ${nodes.length} 节点` : "加载节点列表"}
              </Button>
              <Select value={nodeTypeFilter} onChange={setNodeTypeFilter} style={{ width: 100 }} size="small"
                options={[{ value: "ALL", label: "全部" }, { value: "CPU", label: "CPU" }, { value: "GPU", label: "GPU" }, { value: "NPU", label: "NPU" }]} />
            </div>
            <Spin spinning={nodesLoading}>
              {nodes.length > 0 ? (
                <Row gutter={[12, 12]}>
                  {filteredNodes.map(node => {
                    const status = NODE_STATUS_MAP[node.status] || NODE_STATUS_MAP.OFFLINE;
                    const isOffline = node.status === "OFFLINE" || node.status === "ERROR";
                    const isSelected = selectedNodeIds.includes(node.id);
                    let hw; try { hw = typeof node.hardwareInfo === "string" ? JSON.parse(node.hardwareInfo) : node.hardwareInfo; } catch { hw = null; }
                    return (
                      <Col xs={24} sm={12} md={8} key={node.id}>
                        <Card size="small" hoverable={!isOffline} onClick={() => !isOffline && toggleNode(node.id)}
                          style={{
                            border: isSelected ? "2px solid #1890ff" : "1px solid #f0f0f0",
                            background: isOffline ? "#fafafa" : isSelected ? "#e6f7ff" : "#fff",
                            cursor: isOffline ? "not-allowed" : "pointer", opacity: isOffline ? 0.5 : 1,
                          }}>
                          <Space direction="vertical" size={2} style={{ width: "100%" }}>
                            <Space style={{ justifyContent: "space-between", width: "100%" }}>
                              <Space><CloudServerOutlined /><Text strong style={{ fontSize: 13 }}>{node.name}</Text>{isSelected && <CheckCircleOutlined style={{ color: "#1890ff" }} />}</Space>
                              <Badge status={status.badge} text={status.text} />
                            </Space>
                            {hw && (
                              <Space size={4} wrap>
                                {hw.cpu_threads && <Tag style={{ fontSize: 10, margin: 0 }}>🖥 {hw.cpu_threads}核</Tag>}
                                {hw.memory_total_gb && <Tag style={{ fontSize: 10, margin: 0 }}>💾 {Number(hw.memory_total_gb).toFixed(0)}GB</Tag>}
                                {hw.gpu_count > 0 && <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>🎮 GPU×{hw.gpu_count}</Tag>}
                              </Space>
                            )}
                          </Space>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>
              ) : !nodesLoading && <Text type="secondary">点击上方按钮加载节点列表</Text>}
            </Spin>
            {selectedNodeIds.length > 0 && (
              <Card size="small" style={{ marginTop: 8, background: "#f6ffed" }}>
                <Space>
                  <Text>已选 <Text strong style={{ color: "#1890ff" }}>{selectedNodeIds.length}</Text> 个节点</Text>
                  <Button size="small" type="link" onClick={() => setSelectedNodeIds([])}>清空</Button>
                </Space>
              </Card>
            )}
          </Panel>
        </Collapse>
      </Spin>
    );
  };

  /* ══════════════════════════════════════════════════════════
   *  Step 6: 配参数
   * ══════════════════════════════════════════════════════════ */
  const PRESET_PARAMS = {
    QUICK:    { timeout: 300,  retryCount: 0, dataTypes: ["FP32"], batchSize: 1,  warmupIterations: 5,  benchmarkIterations: 10 },
    STANDARD: { timeout: 3600, retryCount: 1, dataTypes: ["FP32", "FP16"], batchSize: 32, warmupIterations: 10, benchmarkIterations: 100 },
    FULL:     { timeout: 7200, retryCount: 2, dataTypes: ["FP32", "FP16", "BF16", "INT8"], batchSize: 64, warmupIterations: 50, benchmarkIterations: 500 },
  };
  const handlePresetChange = (preset) => {
    setSelectedPreset(preset);
    setAdvancedConfig(prev => ({ ...prev, ...(PRESET_PARAMS[preset] || PRESET_PARAMS.STANDARD) }));
  };

  const renderStep6Params = () => (
    <div>
      <div style={{ marginBottom: 16 }}><Text type="secondary">选择评测预设方案，决定评测的深度和广度</Text></div>
      <Radio.Group value={selectedPreset} onChange={e => handlePresetChange(e.target.value)} style={{ width: "100%" }}>
        <Row gutter={[16, 16]}>
          {PRESETS.map(preset => {
            const isSelected = selectedPreset === preset.key;
            return (
              <Col xs={24} md={8} key={preset.key}>
                <Card hoverable onClick={() => handlePresetChange(preset.key)}
                  style={{ border: isSelected ? `2px solid ${preset.color}` : "1px solid #f0f0f0", background: isSelected ? `${preset.color}08` : "#fff", cursor: "pointer", textAlign: "center", minHeight: 180 }}>
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    <Title level={4} style={{ margin: 0 }}>{preset.title}</Title>
                    <Text type="secondary">{preset.desc}</Text>
                    <Paragraph style={{ fontSize: 12, color: "#666", margin: 0 }}>{preset.detail}</Paragraph>
                    <div><Tag color="blue">{preset.duration}</Tag><Tag>约 {preset.taskCount} 个任务</Tag></div>
                    {isSelected && <CheckCircleOutlined style={{ color: preset.color, fontSize: 20 }} />}
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Radio.Group>
      <Card size="small" style={{ marginTop: 16, background: "#fafafa" }}>
        <Row gutter={16} align="middle">
          <Col><Text>预估任务数: </Text><Text strong style={{ fontSize: 20, color: "#1890ff" }}>{estimatedTasks}</Text><Text> 个</Text></Col>
          <Col><Text type="secondary">预计耗时: </Text><Tag color="orange">{estimatedDuration}</Tag></Col>
        </Row>
      </Card>
      <Card size="small" title="📋 详细参数配置" style={{ marginTop: 16 }}>
        <Row gutter={[24, 16]}>
          <Col xs={24} md={12}>
            <div style={{ marginBottom: 8 }}><Text strong>超时时间</Text><Text type="secondary" style={{ marginLeft: 8 }}>{advancedConfig.timeout}s ({Math.round(advancedConfig.timeout / 60)}分钟)</Text></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 12 }}>30s</Text>
              <input type="range" min={30} max={3600} step={30} value={advancedConfig.timeout}
                onChange={e => setAdvancedConfig(p => ({ ...p, timeout: Number(e.target.value) }))} style={{ flex: 1 }} />
              <Text style={{ fontSize: 12 }}>3600s</Text>
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div style={{ marginBottom: 8 }}><Text strong>失败重试次数</Text></div>
            <Radio.Group value={advancedConfig.retryCount} onChange={e => setAdvancedConfig(p => ({ ...p, retryCount: e.target.value }))}>
              <Radio value={0}>不重试</Radio><Radio value={1}>1次</Radio><Radio value={2}>2次</Radio><Radio value={3}>3次</Radio>
            </Radio.Group>
          </Col>
          <Col xs={24} md={12}>
            <div style={{ marginBottom: 8 }}><Text strong>数据类型</Text></div>
            <Checkbox.Group value={advancedConfig.dataTypes} onChange={v => setAdvancedConfig(p => ({ ...p, dataTypes: v }))}>
              <Row gutter={[8, 8]}>{["FP32", "FP16", "BF16", "INT8"].map(dt => <Col key={dt}><Checkbox value={dt}>{dt}</Checkbox></Col>)}</Row>
            </Checkbox.Group>
          </Col>
          <Col xs={24} md={12}>
            <div style={{ marginBottom: 8 }}><Text strong>Batch Size</Text></div>
            <InputNumber min={1} max={256} value={advancedConfig.batchSize}
              onChange={v => setAdvancedConfig(p => ({ ...p, batchSize: v }))} style={{ width: "100%" }}
              addonAfter={<Space size={4}>{[1, 8, 32, 64, 128].map(v => (
                <Tag key={v} style={{ cursor: "pointer", margin: 0 }} color={advancedConfig.batchSize === v ? "blue" : "default"}
                  onClick={() => setAdvancedConfig(p => ({ ...p, batchSize: v }))}>{v}</Tag>
              ))}</Space>} />
          </Col>
        </Row>
      </Card>
      <Collapse ghost style={{ marginTop: 12 }}>
        <Panel header="⚙️ 高级选项" key="advanced">
          <Row gutter={24}>
            <Col span={12}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <Text>预热迭代次数 (warmup_iterations)</Text>
                <InputNumber min={5} max={100} value={advancedConfig.warmupIterations} onChange={v => setAdvancedConfig(p => ({ ...p, warmupIterations: v }))} style={{ width: "100%" }} />
                <Text type="secondary" style={{ fontSize: 12 }}>建议: 快速5, 标准10, 全量50</Text>
              </Space>
            </Col>
            <Col span={12}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <Text>基准测试迭代次数 (benchmark_iterations)</Text>
                <InputNumber min={10} max={1000} value={advancedConfig.benchmarkIterations} onChange={v => setAdvancedConfig(p => ({ ...p, benchmarkIterations: v }))} style={{ width: "100%" }} />
                <Text type="secondary" style={{ fontSize: 12 }}>建议: 快速10, 标准100, 全量500</Text>
              </Space>
            </Col>
          </Row>
        </Panel>
      </Collapse>
    </div>
  );

  /* ══════════════════════════════════════════════════════════
   *  Step 7: 关联资产 (#268)
   * ══════════════════════════════════════════════════════════ */
  const renderStep7Assets = () => (
    <div>
      <Alert message="可选: 关联数字资产到此评测任务，方便后续追溯" type="info" showIcon style={{ marginBottom: 16 }} />
      <Card>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Space>
            <Button type="primary" icon={<DatabaseOutlined />} onClick={() => setAssetSelectorVisible(true)}>选择资产</Button>
            <Text type="secondary">已选 {selectedAssetIds.length} 个资产</Text>
          </Space>
          {selectedAssetIds.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {selectedAssetIds.map(id => (
                <Tag key={id} closable color="blue" onClose={() => setSelectedAssetIds(p => p.filter(x => x !== id))}>资产 #{id}</Tag>
              ))}
            </div>
          )}
        </Space>
      </Card>
      <AssetSelector visible={assetSelectorVisible} onClose={() => setAssetSelectorVisible(false)} selectedIds={selectedAssetIds} onSelect={setSelectedAssetIds} />
    </div>
  );

  /* ══════════════════════════════════════════════════════════
   *  Step 8: 确认提交
   * ══════════════════════════════════════════════════════════ */
  const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));

  const renderStep8Confirm = () => (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Title level={5}>📋 评测任务摘要</Title>
        <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
          <Descriptions.Item label="任务名称" span={2}><Text strong>{generateName()}</Text></Descriptions.Item>
          <Descriptions.Item label="① 目标芯片">
            <Space><Text>{selectedChip?.name}</Text><Tag color={CHIP_TYPE_COLORS[selectedChip?.chipType]}>{CHIP_TYPE_LABELS[selectedChip?.chipType] || selectedChip?.chipType}</Tag></Space>
          </Descriptions.Item>
          <Descriptions.Item label="芯片厂商">{selectedChip?.manufacturer}</Descriptions.Item>
          <Descriptions.Item label="② 评测模板">
            <Space><Text strong>{selectedTemplate?.name}</Text>
              {selectedTemplate?.evaluationLayer && <Tag color={LAYER_COLORS[selectedTemplate.evaluationLayer]}>{LAYER_LABELS[selectedTemplate.evaluationLayer]}</Tag>}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="③ 评测项数"><Tag color="cyan">{totalItems} 项</Tag></Descriptions.Item>
          <Descriptions.Item label="④ 运行规格" span={2}>
            {selectedRunSpec && selectedRunSpecId !== "custom" ? (
              <Space direction="vertical" size={2}>
                <Space><HddOutlined style={{ color: "#1890ff" }} /><Text strong>{selectedRunSpec.name}</Text></Space>
                <Space size={8}>
                  <Tag color="blue">{selectedRunSpec.nodeCount} 节点{!isCpuChip && ` × ${selectedRunSpec.gpuPerNode} GPU`}</Tag>
                  {selectedRunSpec.parallelMode && <Tag color="purple">{selectedRunSpec.parallelMode}</Tag>}
                  {selectedRunSpec.memoryGb > 0 && <Tag>{selectedRunSpec.memoryGb}GB 内存</Tag>}
                </Space>
              </Space>
            ) : selectedRunSpecId === "custom" ? (
              <Tag color="orange">自定义规格</Tag>
            ) : <Text type="secondary">未选择</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="⑤ 资源池" span={2}>
            {selectedPool ? (
              <Space direction="vertical" size={2}>
                <Space><CloudServerOutlined style={{ color: "#1890ff" }} /><Text strong>{selectedPool.name}</Text><Tag color="green">{selectedPool.type}</Tag></Space>
                <Text type="secondary" style={{ fontSize: 12 }}>调度策略: least_loaded · 在线 {selectedPool.onlineNodeCount || 0}/{selectedPool.nodeCount || 0} 节点</Text>
              </Space>
            ) : selectedNodes.length > 0 ? (
              <Space wrap>{selectedNodes.map(n => <Tag key={n.id} color="blue">{n.name}</Tag>)}</Space>
            ) : <Text type="secondary">未指定（将自动分配）</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="⑥ 评测方案"><Text strong style={{ color: selectedPresetObj?.color }}>{selectedPresetObj?.title}</Text></Descriptions.Item>
          <Descriptions.Item label="超时/重试">{advancedConfig.timeout}s / 重试{advancedConfig.retryCount}次</Descriptions.Item>
        </Descriptions>
      </Card>
      <Card size="small" style={{ marginBottom: 16, background: "#f6ffed" }}>
        <Row gutter={24} justify="center">
          <Col>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="预估任务数"><Text strong style={{ fontSize: 18, color: "#1890ff" }}>{estimatedTasks}</Text> 个</Descriptions.Item>
              <Descriptions.Item label="预计耗时"><Tag color="orange" style={{ fontSize: 14 }}>{estimatedDuration}</Tag></Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>
      <Row justify="center" gutter={16}>
        <Col><Button size="large" icon={<SaveOutlined />} loading={submitting} onClick={() => handleSubmit(false)}>保存为草稿</Button></Col>
        <Col><Button type="primary" size="large" icon={<PlayCircleOutlined />} loading={submitting} onClick={() => handleSubmit(true)}>提交并执行</Button></Col>
      </Row>
    </div>
  );

  const stepContent = [renderStep1, renderStep2, renderStep3, renderStep4RunSpec, renderStep5ResourcePool, renderStep6Params, renderStep7Assets, renderStep8Confirm];

  return (
    <div>
      <Card>
        <Steps current={current} items={steps} size="small" style={{ marginBottom: 24 }} />
        <div style={{ minHeight: 350, padding: "16px 0" }}>{stepContent[current]()}</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
          <div>{current > 0 && <Button icon={<ArrowLeftOutlined />} onClick={() => setCurrent(current - 1)}>上一步</Button>}</div>
          <div>
            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>步骤 {current + 1} / {steps.length}</Text>
              {current < steps.length - 1 && (
                <Button type="primary" disabled={!canNext()} onClick={() => setCurrent(current + 1)}>下一步 <ArrowRightOutlined /></Button>
              )}
            </Space>
          </div>
        </div>
      </Card>
    </div>
  );
}
