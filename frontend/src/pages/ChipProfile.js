/**
 * @file ChipProfile.js
 * @description 芯片档案页 — 4 Tab 完整版（增强版）
 * Issues: #138 MVP-1, #160 芯片档案页增强
 *
 * Tab 1: 能力画像（默认 Tab）— 雷达图 + 维度评分 + 综合评分 + 场景推荐
 * Tab 2: 基本信息（技术规格增强 + 软件栈增强 + 编辑）
 * Tab 3: 评测历史（增强：创建任务按钮 + 最新报告入口 + 空状态引导）
 * Tab 4: 评价报告 — 最新报告全文 + 历史报告选择
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Button, Tag, Badge, Space, Row, Col, Table, Progress, Descriptions,
  message, Spin, Typography, Divider, Modal, Form, Input, InputNumber, Select, Empty,
  Tooltip, Tabs, Alert, Checkbox,
} from "antd";
import {
  ArrowLeftOutlined, EditOutlined, PlusOutlined, FileTextOutlined,
  PlayCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  EyeOutlined, ThunderboltOutlined, DatabaseOutlined, AppstoreOutlined,
  RadarChartOutlined, HistoryOutlined, ProfileOutlined, InfoCircleOutlined,
  RiseOutlined, ExperimentOutlined, NumberOutlined, FireOutlined,
  DashboardOutlined, SwapOutlined, SafetyCertificateOutlined,
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import RadarChart, { DIMENSIONS } from "../components/RadarChart";
import api from "../utils/api";
import { useParams, useNavigate } from "react-router-dom";

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

/* ── 常量 ── */
const CHIP_TYPE_COLORS = { GPU: "blue", NPU: "green", TPU: "purple", CPU: "orange", OTHER: "default" };
const CHIP_TYPE_LABELS = { GPU: "GPU", NPU: "NPU", TPU: "TPU", CPU: "CPU", OTHER: "其他" };
const STATUS_MAP = {
  UNEVALUATED: { text: "未评测", status: "default", color: "#d9d9d9", badgeColor: "default" },
  EVALUATING:  { text: "评测中", status: "processing", color: "#1890ff", badgeColor: "processing" },
  EVALUATED:   { text: "已评测", status: "success", color: "#52c41a", badgeColor: "success" },
};
const PLAN_STATUS_MAP = {
  DRAFT:     { text: "草稿",   badge: "default" },
  RUNNING:   { text: "运行中", badge: "processing" },
  PAUSED:    { text: "已暂停", badge: "warning" },
  COMPLETED: { text: "已完成", badge: "success" },
  FAILED:    { text: "失败",   badge: "error" },
  CANCELLED: { text: "已取消", badge: "default" },
};
const FRAMEWORK_OPTIONS = [
  "PyTorch", "ONNX Runtime", "TensorFlow", "PaddlePaddle",
  "MindSpore", "TVM", "OpenVINO", "TensorRT", "CANN",
];
const FRAMEWORK_COLORS = {
  "PyTorch": "orange", "ONNX Runtime": "blue", "TensorFlow": "red",
  "PaddlePaddle": "green", "MindSpore": "purple", "TVM": "cyan",
  "OpenVINO": "geekblue", "TensorRT": "lime", "CANN": "magenta",
};

const safeParse = (str) => {
  if (!str) return null;
  if (typeof str === "object") return str;
  try { return JSON.parse(str); } catch (_) { return null; }
};

const getScoreColor = (score) => {
  if (score >= 80) return "#52c41a";
  if (score >= 60) return "#faad14";
  return "#ff4d4f";
};

const getScoreGrade = (score) => {
  if (score >= 90) return { text: "优秀", color: "#52c41a" };
  if (score >= 75) return { text: "良好", color: "#1890ff" };
  if (score >= 60) return { text: "一般", color: "#faad14" };
  return { text: "待改进", color: "#ff4d4f" };
};

/* ── 主组件 ── */
export default function ChipProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const chipId = Number(id);
  const [chip, setChip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [activeTab, setActiveTab] = useState("info");

  /* 报告对比 */
  const [compareIds, setCompareIds] = useState([]);
  const [comparing, setComparing] = useState(false);
  const [compareData, setCompareData] = useState(null);
  const [showCompare, setShowCompare] = useState(false);

  /* 编辑 Modal */
  const [techModalVisible, setTechModalVisible] = useState(false);
  const [swModalVisible, setSwModalVisible] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [techForm] = Form.useForm();
  const [swForm] = Form.useForm();

  /* ── API ── */
  const fetchChip = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get(`/chips/${chipId}`);
      if (resp.code === 0) setChip(resp.data);
      else message.error("获取芯片信息失败");
    } catch (e) {
      message.error("获取芯片信息失败: " + (e.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  }, [chipId]);

  const fetchPlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      const { data: resp } = await api.get("/plans", { params: { chipId, page: 0, size: 100 } });
      if (resp.code === 0) {
        const sorted = (resp.data || []).sort((a, b) =>
          new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        );
        setPlans(sorted);
      }
    } catch (e) {
      console.error("获取评测任务失败", e);
    } finally {
      setPlansLoading(false);
    }
  }, [chipId]);

  const fetchReports = useCallback(async () => {
    try {
      const { data: resp } = await api.get("/chip-reports/chip/" + chipId);
      if (resp.code === 0 && resp.data) {
        const sorted = (resp.data || []).sort((a, b) =>
          new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        );
        setReports(sorted);
        if (sorted.length > 0 && !selectedReportId) {
          setSelectedReportId(sorted[0].id);
        }
      }
    } catch (_) {}
  }, [chipId, selectedReportId]);

  useEffect(() => { fetchChip(); fetchPlans(); fetchReports(); }, [fetchChip, fetchPlans, fetchReports]);

  /* ── 编辑技术规格（增强版 #160） ── */
  const openTechModal = () => {
    if (!chip) return;
    const tech = safeParse(chip.techSpec) || {};
    techForm.setFieldsValue({
      computePower: tech.computePower || undefined,
      computePowerUnit: tech.computePowerUnit || "TFLOPS",
      memory: tech.memory || undefined,
      memoryType: tech.memoryType || "HBM2e",
      tdp: tech.tdp || undefined,
      frequency: tech.frequency || undefined,
      cores: tech.cores || undefined,
    });
    setTechModalVisible(true);
  };

  const handleTechSave = async () => {
    try {
      const values = await techForm.validateFields();
      setSubmitLoading(true);
      const techSpec = JSON.stringify({
        computePower: values.computePower || "",
        computePowerUnit: values.computePowerUnit || "TFLOPS",
        memory: values.memory || "",
        memoryType: values.memoryType || "",
        tdp: values.tdp || "",
        frequency: values.frequency || "",
        cores: values.cores || "",
      });
      await api.put(`/chips/${chipId}`, { ...chip, techSpec });
      message.success("技术规格更新成功");
      setTechModalVisible(false);
      fetchChip();
    } catch (e) {
      if (e.errorFields) return;
      message.error("更新失败");
    } finally {
      setSubmitLoading(false);
    }
  };

  /* ── 编辑软件栈 ── */
  const openSwModal = () => {
    if (!chip) return;
    const sw = safeParse(chip.softwareStack) || {};
    swForm.setFieldsValue({
      driver: sw.driver || "",
      sdk: sw.sdk || "",
      frameworks: sw.frameworks || [],
    });
    setSwModalVisible(true);
  };

  const handleSwSave = async () => {
    try {
      const values = await swForm.validateFields();
      setSubmitLoading(true);
      const softwareStack = JSON.stringify({
        driver: values.driver || "",
        sdk: values.sdk || "",
        frameworks: values.frameworks || [],
      });
      await api.put(`/chips/${chipId}`, { ...chip, softwareStack });
      message.success("软件栈更新成功");
      setSwModalVisible(false);
      fetchChip();
    } catch (e) {
      if (e.errorFields) return;
      message.error("更新失败");
    } finally {
      setSubmitLoading(false);
    }
  };

  /* ── 报告对比 ── */
  const handleCompare = async () => {
    if (compareIds.length < 2) {
      message.warning("请至少选择 2 份报告进行对比");
      return;
    }
    setComparing(true);
    try {
      const res = await api.get("/chip-reports/compare", { params: { ids: compareIds.join(",") } });
      if (res.data?.code === 0) {
        setCompareData(res.data.data);
        setShowCompare(true);
      } else {
        message.error(res.data?.message || "对比失败");
      }
    } catch (err) {
      message.error("对比失败: " + (err.response?.data?.message || err.message));
    } finally {
      setComparing(false);
    }
  };

  const handleSetReportBaseline = async (reportId) => {
    try {
      const res = await api.put("/chip-reports/" + reportId + "/set-baseline");
      if (res.data?.code === 0) {
        message.success("✅ 已标记为可采信基线，芯片画像已更新");
        fetchReports();
        fetchChip();
      } else {
        message.error(res.data?.message || "标记失败");
      }
    } catch (err) {
      message.error("标记失败: " + (err.response?.data?.message || err.message));
    }
  };

  const toggleCompareId = (id) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 5) { message.warning("最多选择 5 份报告对比"); return prev; }
      return [...prev, id];
    });
  };

  /* ── 获取最新报告数据 ── */
  const latestReport = reports.length > 0 ? reports[0] : null;
  const baselineReport = reports.find(r => r.isBaseline) || latestReport;
  const selectedReport = reports.find(r => r.id === selectedReportId) || latestReport;
  const completedReport = reports.find(r => r.status === "PUBLISHED" || r.status === "COMPLETED") || latestReport;

  const radarData = safeParse(selectedReport?.radarData) || safeParse(latestReport?.radarData) || [];
  const dimensionScores = safeParse(selectedReport?.dimensionScores) || safeParse(latestReport?.dimensionScores) || {};
  const scenarioRecs = safeParse(selectedReport?.scenarioRecommendations) || safeParse(latestReport?.scenarioRecommendations) || [];
  const bottleneckData = safeParse(selectedReport?.bottleneckAnalysis) || safeParse(latestReport?.bottleneckAnalysis) || [];
  const operatorRanking = safeParse(selectedReport?.operatorRanking) || safeParse(latestReport?.operatorRanking) || [];

  /* 维度中文映射 */
  const DIM_CN = {
    compute_perf: "计算性能", memory_perf: "访存性能", math_func: "数学函数",
    attention: "Attention能力", normalization: "归一化性能", model_inference: "模型推理",
  };

  /* ── 评测历史列 ── */
  const planColumns = [
    {
      title: "任务名称", dataIndex: "name", key: "name", width: 200, ellipsis: true,
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 100,
      render: (v) => {
        const s = PLAN_STATUS_MAP[v] || { text: v, badge: "default" };
        return <Badge status={s.badge} text={s.text} />;
      },
    },
    {
      title: "任务数", key: "taskCount", width: 80, align: "center",
      render: (_, record) => record.taskCount || record.totalTasks || "-",
    },
    {
      title: "执行时间", dataIndex: "createdAt", key: "createdAt", width: 170,
      render: (v) => v ? new Date(v).toLocaleString("zh-CN") : "-",
    },
    {
      title: "综合评分", key: "overallScore", width: 100, align: "center",
      render: (_, record) => {
        const report = reports.find(r => r.planId === record.id);
        if (!report) return <Text type="secondary">-</Text>;
        return (
          <span style={{ color: getScoreColor(report.overallScore), fontWeight: "bold" }}>
            {report.overallScore?.toFixed(1)}
          </span>
        );
      },
    },
    {
      title: "操作", key: "actions", width: 120, fixed: "right",
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看监控">
            <Button type="link" size="small" icon={<EyeOutlined />}
              onClick={() => navigate(`/plans/${record.id}`)} />
          </Tooltip>
          {record.status === "COMPLETED" && (
            <Tooltip title="查看报告">
              <Button type="link" size="small" icon={<FileTextOutlined />}
                style={{ color: "#52c41a" }}
                onClick={() => navigate(`/reports/${record.id}`)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  /* ── 评分趋势图 option ── */
  const trendOption = (() => {
    const completedPlans = plans.filter(p => p.status === "COMPLETED").reverse();
    if (completedPlans.length < 2) return null;
    const xData = completedPlans.map(p => p.name || `任务#${p.id}`);
    const yData = completedPlans.map(p => {
      const report = reports.find(r => r.planId === p.id);
      return report ? report.overallScore : null;
    });
    return {
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: xData, axisLabel: { rotate: 20 } },
      yAxis: { type: "value", min: 0, max: 100, name: "评分" },
      series: [{
        type: "line", data: yData, smooth: true,
        itemStyle: { color: "#1890ff" },
        areaStyle: { color: "rgba(24,144,255,0.1)" },
        markLine: {
          data: [{ yAxis: 75, name: "良好", lineStyle: { color: "#52c41a", type: "dashed" } }],
        },
      }],
    };
  })();

  /* ── 报告页算子表列 ── */
  const operatorColumns = [
    {
      title: "排名", key: "rank", width: 70, align: "center",
      render: (_, __, idx) => {
        const rank = idx + 1;
        if (rank <= 3) {
          const colors = ["#ffd700", "#c0c0c0", "#cd7f32"];
          return <Tag color={colors[rank - 1]} style={{ fontWeight: "bold" }}>{rank}</Tag>;
        }
        return <Text type="secondary">{rank}</Text>;
      },
    },
    {
      title: "算子名", dataIndex: "testItem", key: "testItem",
      render: (text, record) => (
        <Space>
          <span>{text || record.name || "Unknown"}</span>
          <Tag>{record.dimension || "其他"}</Tag>
        </Space>
      ),
    },
    {
      title: "延迟(ms)", key: "latency", width: 110, align: "right",
      render: (_, r) => (r.latencyMean ?? r.avgLatency) != null
        ? (r.latencyMean ?? r.avgLatency).toFixed(2) : "-",
    },
    {
      title: "吞吐量", dataIndex: "throughput", key: "throughput", width: 110, align: "right",
      render: (v) => v != null ? v.toFixed(1) : "-",
    },
    {
      title: "评分", dataIndex: "score", key: "score", width: 100, align: "center",
      render: (v) => <span style={{ color: getScoreColor(v || 0), fontWeight: "bold" }}>{(v || 0).toFixed(1)}</span>,
      sorter: (a, b) => (a.score || 0) - (b.score || 0),
    },
    {
      title: "状态", dataIndex: "passed", key: "passed", width: 90, align: "center",
      render: (passed) => passed
        ? <Tag icon={<CheckCircleOutlined />} color="success">通过</Tag>
        : <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>,
    },
  ];

  /* ── 渲染 ── */
  if (loading) {
    return <div style={{ textAlign: "center", padding: 100 }}><Spin size="large" tip="加载芯片档案..." /></div>;
  }
  if (!chip) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Empty description="未找到芯片信息" />
        <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate("/chips")} style={{ marginTop: 16 }}>返回列表</Button>
      </div>
    );
  }

  const tech = safeParse(chip.techSpec) || {};
  const sw = safeParse(chip.softwareStack) || {};
  const statusInfo = STATUS_MAP[chip.status] || STATUS_MAP.UNEVALUATED;
  const overallScore = latestReport?.overallScore ?? chip.overallScore;
  const grade = overallScore ? getScoreGrade(overallScore) : null;

  /* ── Tab Items ── */
  const tabItems = [
    {
      key: "info",
      label: <span><InfoCircleOutlined /> 基本信息</span>,
      children: (
        <Row gutter={16}>
          {/* ── 技术规格 Card 增强 (#160) ── */}
          <Col xs={24} lg={12}>
            <Card
              title={<Space><ThunderboltOutlined /> 技术规格</Space>}
              extra={<Button type="link" size="small" icon={<EditOutlined />} onClick={openTechModal}>编辑</Button>}
              style={{ height: "100%", marginBottom: 16 }}
            >
              <Descriptions column={1} size="small" labelStyle={{ width: 100 }}>
                <Descriptions.Item label={<><DashboardOutlined /> 标称算力</>}>
                  <Text strong>
                    {tech.computePower
                      ? `${tech.computePower} ${tech.computePowerUnit || "TFLOPS"}`
                      : <Text type="secondary">-</Text>}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label={<><DatabaseOutlined /> 显存/内存</>}>
                  <Text strong>
                    {tech.memory
                      ? `${tech.memory} GB ${tech.memoryType || ""}`
                      : <Text type="secondary">-</Text>}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label={<><FireOutlined /> TDP 功耗</>}>
                  <Text strong>
                    {tech.tdp ? `${tech.tdp} W` : <Text type="secondary">-</Text>}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="频率">
                  <Text strong>
                    {tech.frequency ? `${tech.frequency} GHz` : <Text type="secondary">-</Text>}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label={<><NumberOutlined /> 核心数</>}>
                  <Text strong>
                    {tech.cores || <Text type="secondary">-</Text>}
                  </Text>
                </Descriptions.Item>
              </Descriptions>
              {!tech.computePower && !tech.memory && !tech.tdp && !tech.frequency && !tech.cores && (
                <div style={{ textAlign: "center", padding: "16px 0", color: "#999" }}>
                  暂无技术规格数据，点击编辑添加
                </div>
              )}
            </Card>
          </Col>

          {/* ── 软件栈 Card 增强 (#160) ── */}
          <Col xs={24} lg={12}>
            <Card
              title={<Space><AppstoreOutlined /> 软件栈</Space>}
              extra={<Button type="link" size="small" icon={<EditOutlined />} onClick={openSwModal}>编辑</Button>}
              style={{ height: "100%", marginBottom: 16 }}
            >
              <Descriptions column={1} size="small" labelStyle={{ width: 100 }}>
                <Descriptions.Item label="驱动版本">
                  <Text strong>{sw.driver || <Text type="secondary">-</Text>}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="SDK 版本">
                  <Text strong>{sw.sdk || <Text type="secondary">-</Text>}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="适配框架">
                  {(sw.frameworks || []).length > 0
                    ? sw.frameworks.map((f) => (
                        <Tag key={f} color={FRAMEWORK_COLORS[f] || "blue"} style={{ marginBottom: 4 }}>{f}</Tag>
                      ))
                    : <Text type="secondary">-</Text>}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>

          {/* 芯片基本信息 */}
          <Col xs={24}>
            <Card title="芯片信息" style={{ marginBottom: 16 }}>
              <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
                <Descriptions.Item label="芯片名称"><Text strong>{chip.name}</Text></Descriptions.Item>
                <Descriptions.Item label="芯片编号">{chip.chipNo}</Descriptions.Item>
                <Descriptions.Item label="芯片类型">
                  <Tag color={CHIP_TYPE_COLORS[chip.chipType]}>{CHIP_TYPE_LABELS[chip.chipType] || chip.chipType}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="厂商">{chip.manufacturer || "-"}</Descriptions.Item>
                <Descriptions.Item label="状态"><Badge status={statusInfo.status} text={statusInfo.text} /></Descriptions.Item>
                <Descriptions.Item label="标签">
                  {chip.tags ? chip.tags.split(",").filter(Boolean).map(t => <Tag key={t.trim()}>{t.trim()}</Tag>) : "-"}
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">
                  {chip.createdAt ? new Date(chip.createdAt).toLocaleString("zh-CN") : "-"}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: "profile",
      label: <span><RadarChartOutlined /> 能力画像</span>,
      children: (
        <div>
          {/* 综合评分 */}
          {overallScore != null && (
            <Card style={{ marginBottom: 16 }}>
              <Row gutter={24} align="middle">
                <Col xs={24} md={8} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 64, fontWeight: "bold", color: getScoreColor(overallScore), lineHeight: 1 }}>
                    {overallScore.toFixed ? overallScore.toFixed(1) : overallScore}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Tag color={grade?.color} style={{ fontSize: 16, padding: "4px 16px" }}>{grade?.text}</Tag>
                  </div>
                  <Text type="secondary" style={{ fontSize: 13, marginTop: 8, display: "block" }}>综合评分</Text>
                  {baselineReport && (
                    <Tag color="blue" style={{ marginTop: 4 }}>📌 基于 {baselineReport.reportNo}</Tag>
                  )}
                </Col>
                <Col xs={24} md={16}>
                  <RadarChart data={radarData} height={320} />
                </Col>
              </Row>
            </Card>
          )}

          {/* 各维度评分详情 */}
          {Object.keys(dimensionScores).length > 0 && (
            <Card title="维度评分详情" style={{ marginBottom: 16 }}>
              <Row gutter={[16, 12]}>
                {Object.entries(DIM_CN).map(([key, name]) => {
                  const score = dimensionScores[key] || 0;
                  return (
                    <Col xs={24} sm={12} md={8} key={key}>
                      <div style={{ marginBottom: 4 }}>
                        <Text>{name}</Text>
                        <Text strong style={{ float: "right", color: getScoreColor(score) }}>
                          {score.toFixed ? score.toFixed(1) : score}
                        </Text>
                      </div>
                      <Progress
                        percent={Math.round(score)}
                        strokeColor={getScoreColor(score)}
                        showInfo={false}
                        size="small"
                      />
                    </Col>
                  );
                })}
              </Row>
            </Card>
          )}

          {/* 适用场景分析 */}
          {scenarioRecs.length > 0 && (
            <Card title="适用场景分析" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                {["recommended", "caution", "unverified"].map((type) => {
                  const items = scenarioRecs.filter(r => r.type === type);
                  if (items.length === 0) return null;
                  const config = {
                    recommended: { title: "✅ 推荐场景", color: "#f6ffed", borderColor: "#b7eb8f" },
                    caution: { title: "⚠️ 需关注场景", color: "#fffbe6", borderColor: "#ffe58f" },
                    unverified: { title: "❌ 待验证场景", color: "#fff2f0", borderColor: "#ffccc7" },
                  }[type];
                  return (
                    <Col xs={24} md={8} key={type}>
                      <Card size="small" title={config.title}
                        style={{ background: config.color, borderColor: config.borderColor, height: "100%" }}>
                        {items.map((item, idx) => (
                          <div key={idx} style={{ marginBottom: idx < items.length - 1 ? 12 : 0 }}>
                            <Text strong>{item.scenario}</Text>
                            <br />
                            <Text type="secondary" style={{ fontSize: 12 }}>{item.reason}</Text>
                          </div>
                        ))}
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            </Card>
          )}

          {!overallScore && radarData.length === 0 && (
            <Empty description="暂无评测数据，请先创建评测任务" style={{ padding: 60 }}>
              <Button type="primary" icon={<PlusOutlined />}
                onClick={() => navigate("/plans/create")}>创建评测任务</Button>
            </Empty>
          )}
        </div>
      ),
    },
    {
      key: "history",
      label: <span><HistoryOutlined /> 评测历史</span>,
      children: (
        <div>
          {/* 快捷入口：查看最新报告（#160 增强） */}
          {completedReport && (
            <Alert
              type="success"
              showIcon
              icon={<FileTextOutlined />}
              style={{ marginBottom: 16 }}
              message={
                <Space>
                  <span>最新报告可用：{completedReport.reportNo}</span>
                  <Text type="secondary">
                    综合评分 <Text strong style={{ color: getScoreColor(completedReport.overallScore || 0) }}>
                      {(completedReport.overallScore || 0).toFixed(1)}
                    </Text>
                  </Text>
                  <Button
                    type="link"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      const plan = plans.find(p => p.id === completedReport.planId);
                      if (plan) navigate(`/reports/${plan.id}`);
                      else { setActiveTab("report"); }
                    }}
                  >
                    查看最新报告
                  </Button>
                </Space>
              }
            />
          )}

          <Card
            title={<Space><FileTextOutlined /> 评测任务列表</Space>}
            extra={
              <Button type="primary" size="small" icon={<PlusOutlined />}
                onClick={() => navigate("/plans/create")}>
                创建评测任务
              </Button>
            }
          >
            {plans.length === 0 && !plansLoading ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<span style={{ color: "#666" }}>该芯片暂无评测记录</span>}
              >
                <Button type="primary" icon={<PlusOutlined />}
                  onClick={() => navigate("/plans/create")}>创建评测任务</Button>
              </Empty>
            ) : (
              <Table rowKey="id" columns={planColumns} dataSource={plans}
                loading={plansLoading} scroll={{ x: 800 }}
                pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条评测记录` }} />
            )}

          {/* ── 报告对比选择区 ── */}
          {reports.length >= 2 && (
            <Card title={<Space><SwapOutlined /> 报告横向对比</Space>}
              style={{ marginTop: 16 }}
              extra={
                <Space>
                  {compareIds.length >= 2 && (
                    <Button type="primary" icon={<SwapOutlined />}
                      loading={comparing} onClick={handleCompare}>
                      📊 对比选中报告 ({compareIds.length})
                    </Button>
                  )}
                  {compareIds.length > 0 && (
                    <Button onClick={() => { setCompareIds([]); setShowCompare(false); setCompareData(null); }}>
                      清除选择
                    </Button>
                  )}
                </Space>
              }
            >
              <Row gutter={[12, 12]}>
                {reports.map(r => (
                  <Col xs={24} sm={12} md={8} key={r.id}>
                    <Card
                      size="small"
                      hoverable
                      style={{
                        borderColor: compareIds.includes(r.id) ? "#1890ff" : r.isBaseline ? "#52c41a" : undefined,
                        borderWidth: compareIds.includes(r.id) ? 2 : 1,
                      }}
                      onClick={() => toggleCompareId(r.id)}
                    >
                      <Space>
                        <Checkbox checked={compareIds.includes(r.id)} />
                        <div>
                          <div>
                            <Text strong>{r.reportNo}</Text>
                            {r.isBaseline && <Tag color="blue" style={{ marginLeft: 4 }}>🏷️ 基线</Tag>}
                          </div>
                          <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {r.createdAt ? new Date(r.createdAt).toLocaleDateString("zh-CN") : "-"}
                            </Text>
                            <Text style={{ marginLeft: 8, color: getScoreColor(r.overallScore || 0), fontWeight: "bold" }}>
                              {(r.overallScore || 0).toFixed(1)}%
                            </Text>
                          </div>
                          <div style={{ marginTop: 4 }}>
                            <Button type="link" size="small" icon={<SafetyCertificateOutlined />}
                              disabled={r.isBaseline}
                              onClick={(e) => { e.stopPropagation(); handleSetReportBaseline(r.id); }}>
                              {r.isBaseline ? "已是基线" : "设为基线"}
                            </Button>
                          </div>
                        </div>
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>
          )}

          {/* ── 对比面板 ── */}
          {showCompare && compareData && (
            <Card title="📊 报告对比分析" style={{ marginTop: 16 }}>
              {/* 综合评分对比 */}
              <Title level={5}>综合评分对比</Title>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                {compareData.reports.map((r, idx) => {
                  const colors = ["#1890ff", "#f5222d", "#52c41a", "#fa8c16", "#722ed1"];
                  return (
                    <Col key={r.id} xs={24} sm={12} md={8}>
                      <Card size="small" style={{ borderLeft: "4px solid " + colors[idx % colors.length] }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <Text strong>{r.reportNo}</Text>
                            {r.isBaseline && <Tag color="blue" style={{ marginLeft: 4 }}>🏷️</Tag>}
                            <br />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {r.createdAt ? new Date(r.createdAt).toLocaleDateString("zh-CN") : "-"}
                            </Text>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 28, fontWeight: "bold", color: getScoreColor(r.overallScore || 0) }}>
                              {(r.overallScore || 0).toFixed(1)}
                            </div>
                          </div>
                        </div>
                      </Card>
                    </Col>
                  );
                })}
              </Row>

              {/* 雷达图叠加 */}
              {compareData.reports.length > 0 && compareData.reports[0].radarData && (() => {
                const colors = ["#1890ff", "#f5222d", "#52c41a", "#fa8c16", "#722ed1"];
                const dimLabels = ["计算性能", "访存性能", "数学函数", "Attention能力", "归一化性能", "模型推理"];
                const dimKeys = ["compute_perf", "memory_perf", "math_func", "attention", "normalization", "model_inference"];

                const radarOption = {
                  tooltip: {},
                  legend: {
                    data: compareData.reports.map(r => r.reportNo),
                    bottom: 0,
                  },
                  radar: {
                    indicator: dimLabels.map(name => ({ name, max: 100 })),
                    shape: "polygon",
                  },
                  series: [{
                    type: "radar",
                    data: compareData.reports.map((r, idx) => ({
                      value: dimKeys.map(k => {
                        const dims = r.dimensions || {};
                        return dims[k] != null ? Number(dims[k]).toFixed(1) : 0;
                      }),
                      name: r.reportNo,
                      lineStyle: { color: colors[idx % colors.length], width: 2 },
                      itemStyle: { color: colors[idx % colors.length] },
                      areaStyle: { color: colors[idx % colors.length], opacity: 0.1 },
                    })),
                  }],
                };

                return (
                  <>
                    <Divider />
                    <Title level={5}>六维雷达图叠加</Title>
                    <ReactECharts option={radarOption} style={{ height: 400 }} />
                  </>
                );
              })()}

              {/* 维度评分对比表 */}
              {compareData.changes && compareData.changes.length > 0 && (
                <>
                  <Divider />
                  <Title level={5}>维度评分变化</Title>
                  <Table
                    dataSource={compareData.changes}
                    rowKey="dimension"
                    pagination={false}
                    size="small"
                    columns={[
                      { title: "维度", dataIndex: "dimensionName", key: "dimensionName",
                        render: v => <Text strong>{v}</Text> },
                      ...compareData.reports.map((r, idx) => ({
                        title: <Space>{r.reportNo}{r.isBaseline && <Tag color="blue" size="small">基线</Tag>}</Space>,
                        key: "rpt_" + r.id,
                        align: "center",
                        render: (_, record) => {
                          const dims = r.dimensions || {};
                          const val = dims[record.dimension];
                          return (
                            <Text style={{ color: getScoreColor(val || 0), fontWeight: "bold" }}>
                              {val != null ? Number(val).toFixed(1) : "-"}
                            </Text>
                          );
                        },
                      })),
                      { title: "变化", key: "change", align: "center", width: 120,
                        render: (_, record) => {
                          const delta = record.delta;
                          if (Math.abs(delta) < 0.5) return <Text type="secondary">→ 无变化</Text>;
                          if (delta > 0) return <Text style={{ color: "#52c41a" }}>↑ +{delta.toFixed(1)}</Text>;
                          return <Text style={{ color: "#ff4d4f" }}>↓ {delta.toFixed(1)}</Text>;
                        },
                      },
                    ]}
                  />
                </>
              )}

              {/* 算子级对比 */}
              {compareData.reports.length >= 2 && (() => {
                const allOps = new Map();
                compareData.reports.forEach((r, idx) => {
                  (r.operatorRanking || []).forEach(op => {
                    const name = op.testItem || op.name || "Unknown";
                    if (!allOps.has(name)) allOps.set(name, { name, dimension: op.dimension || "其他", scores: [], latencies: [] });
                    const entry = allOps.get(name);
                    while (entry.scores.length < idx) { entry.scores.push(null); entry.latencies.push(null); }
                    entry.scores.push(op.score);
                    entry.latencies.push(op.latencyMean ?? op.avgLatency ?? null);
                  });
                });
                // Pad all entries
                allOps.forEach(entry => {
                  while (entry.scores.length < compareData.reports.length) { entry.scores.push(null); entry.latencies.push(null); }
                });

                const opData = Array.from(allOps.values()).filter(o => o.scores.some(s => s != null));
                if (opData.length === 0) return null;

                return (
                  <>
                    <Divider />
                    <Title level={5}>算子级对比</Title>
                    <Table
                      dataSource={opData}
                      rowKey="name"
                      pagination={opData.length > 20 ? { pageSize: 20 } : false}
                      size="small"
                      scroll={{ x: 600 }}
                      columns={[
                        { title: "算子", dataIndex: "name", key: "name", width: 140, fixed: "left",
                          render: (v, record) => <Space><span>{v}</span><Tag style={{ fontSize: 10 }}>{record.dimension}</Tag></Space> },
                        ...compareData.reports.map((r, idx) => ({
                          title: r.reportNo.replace("RPT-", ""),
                          key: "score_" + idx,
                          align: "center",
                          width: 100,
                          render: (_, record) => {
                            const score = record.scores[idx];
                            if (score == null) return <Tag color="warning" style={{ fontSize: 10 }}>⚠️ 缺失</Tag>;
                            return <Text style={{ color: getScoreColor(score), fontWeight: "bold" }}>{Number(score).toFixed(1)}</Text>;
                          },
                        })),
                        { title: "变化", key: "delta", align: "center", width: 100,
                          render: (_, record) => {
                            const first = record.scores.find(s => s != null);
                            const last = [...record.scores].reverse().find(s => s != null);
                            if (first == null || last == null) return <Tag color="warning">⚠️</Tag>;
                            const delta = last - first;
                            const pct = first !== 0 ? Math.abs(delta / first) * 100 : 0;
                            if (pct < 5) return <Text type="secondary">→</Text>;
                            if (delta > 0) return <Text style={{ color: "#52c41a" }}>↑ +{delta.toFixed(1)}</Text>;
                            return <Text style={{ color: "#ff4d4f" }}>↓ {delta.toFixed(1)}</Text>;
                          },
                        },
                      ]}
                    />
                  </>
                );
              })()}
            </Card>
          )}
          </Card>

          {/* 评分趋势折线图 */}
          {trendOption && (
            <Card title={<Space><RiseOutlined /> 评分趋势</Space>} style={{ marginTop: 16 }}>
              <ReactECharts option={trendOption} style={{ height: "300px" }} />
            </Card>
          )}
        </div>
      ),
    },
    {
      key: "report",
      label: <span><ProfileOutlined /> 评价报告</span>,
      children: (
        <div>
          {reports.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <Text style={{ marginRight: 8 }}>选择报告：</Text>
              <Select
                value={selectedReportId}
                onChange={(v) => setSelectedReportId(v)}
                style={{ width: 300 }}
              >
                {reports.map(r => (
                  <Option key={r.id} value={r.id}>
                    {r.reportNo} — {r.overallScore?.toFixed(1)}% ({new Date(r.createdAt).toLocaleDateString("zh-CN")})
                  </Option>
                ))}
              </Select>
            </div>
          )}

          {selectedReport ? (
            <div>
              {/* 板块 1: 能力总览 */}
              <Card style={{ marginBottom: 16 }}>
                <Row gutter={24} align="middle">
                  <Col xs={24} md={8} style={{ textAlign: "center" }}>
                    <Progress
                      type="circle"
                      percent={Math.round(selectedReport.overallScore || 0)}
                      strokeColor={getScoreColor(selectedReport.overallScore || 0)}
                      size={160}
                      format={() => (
                        <div>
                          <div style={{ fontSize: 36, fontWeight: "bold", color: getScoreColor(selectedReport.overallScore || 0) }}>
                            {(selectedReport.overallScore || 0).toFixed(1)}
                          </div>
                          <div style={{ fontSize: 14, color: "#666" }}>
                            {getScoreGrade(selectedReport.overallScore || 0).text}
                          </div>
                        </div>
                      )}
                    />
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary">报告编号: {selectedReport.reportNo}</Text>
                    </div>
                  </Col>
                  <Col xs={24} md={16}>
                    <RadarChart data={safeParse(selectedReport.radarData) || radarData} height={280} />
                  </Col>
                </Row>
              </Card>

              {/* 板块 2: 算子排行 */}
              {operatorRanking.length > 0 && (
                <Card title="算子排行" style={{ marginBottom: 16 }}>
                  <Table
                    dataSource={operatorRanking}
                    columns={operatorColumns}
                    rowKey={(_, idx) => idx}
                    pagination={operatorRanking.length > 20 ? { pageSize: 20 } : false}
                    size="middle"
                  />
                </Card>
              )}

              {/* 板块 3: 瓶颈分析 */}
              {bottleneckData.length > 0 && (
                <Card title="瓶颈分析" style={{ marginBottom: 16 }}>
                  <Row gutter={[16, 16]}>
                    {bottleneckData.map((item, idx) => {
                      const levelConfig = {
                        error:   { color: "#fff2f0", borderColor: "#ffccc7", tagColor: "error" },
                        warning: { color: "#fffbe6", borderColor: "#ffe58f", tagColor: "warning" },
                        info:    { color: "#e6f7ff", borderColor: "#91d5ff", tagColor: "processing" },
                      }[item.level] || { color: "#f5f5f5", borderColor: "#d9d9d9", tagColor: "default" };
                      return (
                        <Col xs={24} md={8} key={idx}>
                          <Card size="small" style={{ background: levelConfig.color, borderColor: levelConfig.borderColor }}>
                            <Tag color={levelConfig.tagColor} style={{ marginBottom: 8 }}>
                              {item.level === "error" ? "严重" : item.level === "warning" ? "警告" : "提示"}
                            </Tag>
                            <div><Text strong>{item.title}</Text></div>
                            <div style={{ marginTop: 4 }}><Text type="secondary" style={{ fontSize: 12 }}>{item.detail}</Text></div>
                          </Card>
                        </Col>
                      );
                    })}
                  </Row>
                </Card>
              )}

              {/* 板块 4: 场景推荐 */}
              {scenarioRecs.length > 0 && (
                <Card title="适用场景推荐" style={{ marginBottom: 16 }}>
                  <Row gutter={16}>
                    {["recommended", "caution", "unverified"].map((type) => {
                      const items = scenarioRecs.filter(r => r.type === type);
                      if (items.length === 0) return null;
                      const config = {
                        recommended: { title: "✅ 推荐场景", color: "#f6ffed", borderColor: "#b7eb8f" },
                        caution: { title: "⚠️ 需关注", color: "#fffbe6", borderColor: "#ffe58f" },
                        unverified: { title: "❌ 待验证", color: "#fff2f0", borderColor: "#ffccc7" },
                      }[type];
                      return (
                        <Col xs={24} md={8} key={type}>
                          <Card size="small" title={config.title}
                            style={{ background: config.color, borderColor: config.borderColor, height: "100%" }}>
                            {items.map((item, idx) => (
                              <div key={idx} style={{ marginBottom: idx < items.length - 1 ? 12 : 0 }}>
                                <Text strong>{item.scenario}</Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: 12 }}>{item.reason}</Text>
                              </div>
                            ))}
                          </Card>
                        </Col>
                      );
                    })}
                  </Row>
                </Card>
              )}

              {/* 板块 5: 评测环境信息 */}
              <Card title="评测环境信息" size="small">
                <Alert
                  type="info" showIcon
                  message="CPU 评测模式"
                  description="当前评测数据在 CPU 模式下生成。真实 GPU/NPU 评测需连接硬件节点执行。"
                  style={{ marginBottom: 12 }}
                />
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="评测时间">
                    {selectedReport.createdAt ? new Date(selectedReport.createdAt).toLocaleString("zh-CN") : "-"}
                  </Descriptions.Item>
                  <Descriptions.Item label="报告状态">
                    <Tag color={selectedReport.status === "PUBLISHED" ? "success" : "default"}>
                      {selectedReport.status === "PUBLISHED" ? "已发布" : "草稿"}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </div>
          ) : (
            <Empty description="暂无评价报告" style={{ padding: 60 }}>
              <Button type="primary" icon={<PlusOutlined />}
                onClick={() => navigate("/plans/create")}>创建评测任务</Button>
            </Empty>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* ── 顶部概要（增强 #160） ── */}
      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="top">
          <Col flex="auto">
            <Space align="start">
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/chips")} style={{ marginRight: 8, marginTop: 4 }} />
              <div>
                <Space align="center" style={{ marginBottom: 8 }}>
                  <Title level={3} style={{ margin: 0 }}>{chip.name}</Title>
                  <Tag color={CHIP_TYPE_COLORS[chip.chipType] || "default"}>
                    {CHIP_TYPE_LABELS[chip.chipType] || chip.chipType}
                  </Tag>
                  {/* 状态 Badge + 文字增强 (#160) */}
                  <Tag
                    color={statusInfo.color}
                    style={{
                      borderColor: statusInfo.color,
                      color: chip.status === "UNEVALUATED" ? "#666" : "#fff",
                      fontWeight: 500,
                    }}
                  >
                    <Badge status={statusInfo.status} />
                    {" " + statusInfo.text}
                  </Tag>
                </Space>
                <div>
                  {/* 芯片编号显示增强 (#160) */}
                  <Text
                    copyable={{ text: chip.chipNo }}
                    style={{ marginRight: 24, fontFamily: "monospace", fontSize: 13 }}
                  >
                    <ExperimentOutlined style={{ marginRight: 4 }} />
                    {chip.chipNo}
                  </Text>
                  <Text type="secondary">厂商: {chip.manufacturer || "-"}</Text>
                  {chip.tags && (
                    <span style={{ marginLeft: 24 }}>
                      {chip.tags.split(",").filter(Boolean).map((t) => (
                        <Tag key={t.trim()} style={{ marginBottom: 2 }}>{t.trim()}</Tag>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            </Space>
          </Col>
          <Col>
            <Space align="center" size={24}>
              {/* 综合评分用 Progress circle (#160) */}
              {overallScore != null ? (
                <div style={{ textAlign: "center" }}>
                  <Progress
                    type="circle"
                    size={120}
                    percent={Math.round(overallScore)}
                    strokeColor={getScoreColor(overallScore)}
                    format={() => (
                      <div>
                        <div style={{ fontSize: 28, fontWeight: "bold", color: getScoreColor(overallScore), lineHeight: 1.2 }}>
                          {overallScore.toFixed ? overallScore.toFixed(1) : overallScore}
                        </div>
                        <div style={{ fontSize: 11, color: "#999" }}>综合评分</div>
                      </div>
                    )}
                  />
                </div>
              ) : (
                <div style={{ textAlign: "center", color: "#ccc" }}>
                  <Progress
                    type="circle"
                    size={120}
                    percent={0}
                    format={() => (
                      <div>
                        <div style={{ fontSize: 14, color: "#ccc" }}>暂无评分</div>
                      </div>
                    )}
                  />
                </div>
              )}
              <Button type="primary" icon={<PlusOutlined />}
                onClick={() => navigate("/plans/create")}>创建评测任务</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* ── 4 Tab ── */}
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="large" />
      </Card>

      {/* ── 编辑技术规格 Modal（增强 #160: InputNumber + 单位后缀） ── */}
      <Modal title="编辑技术规格" open={techModalVisible} onCancel={() => setTechModalVisible(false)}
        onOk={handleTechSave} confirmLoading={submitLoading} width={560} destroyOnClose>
        <Form form={techForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="标称算力">
                <Space.Compact style={{ width: "100%" }}>
                  <Form.Item name="computePower" noStyle>
                    <InputNumber placeholder="如 312" style={{ width: "60%" }} min={0} />
                  </Form.Item>
                  <Form.Item name="computePowerUnit" noStyle>
                    <Select style={{ width: "40%" }}>
                      <Option value="TOPS">TOPS</Option>
                      <Option value="TFLOPS">TFLOPS</Option>
                      <Option value="PFLOPS">PFLOPS</Option>
                    </Select>
                  </Form.Item>
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="显存/内存">
                <Space.Compact style={{ width: "100%" }}>
                  <Form.Item name="memory" noStyle>
                    <InputNumber placeholder="如 80" style={{ width: "60%" }} min={0} />
                  </Form.Item>
                  <Form.Item name="memoryType" noStyle>
                    <Select style={{ width: "40%" }}>
                      <Option value="HBM2e">GB HBM2e</Option>
                      <Option value="HBM3">GB HBM3</Option>
                      <Option value="GDDR6">GB GDDR6</Option>
                      <Option value="GDDR6X">GB GDDR6X</Option>
                      <Option value="DDR5">GB DDR5</Option>
                      <Option value="LPDDR5">GB LPDDR5</Option>
                    </Select>
                  </Form.Item>
                </Space.Compact>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="tdp" label="TDP 功耗">
                <InputNumber placeholder="如 400" style={{ width: "100%" }} min={0} addonAfter="W" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="frequency" label="频率">
                <InputNumber placeholder="如 1.41" style={{ width: "100%" }} min={0} step={0.01} addonAfter="GHz" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cores" label="核心数">
                <InputNumber placeholder="如 6912" style={{ width: "100%" }} min={0} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ── 编辑软件栈 Modal ── */}
      <Modal title="编辑软件栈" open={swModalVisible} onCancel={() => setSwModalVisible(false)}
        onOk={handleSwSave} confirmLoading={submitLoading} destroyOnClose>
        <Form form={swForm} layout="vertical">
          <Form.Item name="driver" label="驱动版本"><Input placeholder="如 535.129.03" /></Form.Item>
          <Form.Item name="sdk" label="SDK 版本"><Input placeholder="如 CUDA 12.2" /></Form.Item>
          <Form.Item name="frameworks" label="适配框架">
            <Select mode="tags" placeholder="选择或输入适配框架" allowClear tokenSeparators={[","]}>
              {FRAMEWORK_OPTIONS.map((f) => <Option key={f} value={f}>{f}</Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
