/**
 * @file ChipProfile.js
 * @description 芯片档案页 — 概要 + 技术规格 + 软件栈 + 评测历史
 * Issue: #137 MVP-0 最后一个 issue 🎉
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Button, Tag, Badge, Space, Row, Col, Table, Progress, Descriptions,
  message, Spin, Typography, Divider, Modal, Form, Input, Select, Empty,
  Tooltip,
} from "antd";
import {
  ArrowLeftOutlined, EditOutlined, PlusOutlined, FileTextOutlined,
  PlayCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  PauseCircleOutlined, StopOutlined, EyeOutlined,
  ThunderboltOutlined, DatabaseOutlined, AppstoreOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text } = Typography;
const { Option } = Select;

/* ── 常量 ── */
const CHIP_TYPE_COLORS = { GPU: "blue", NPU: "green", TPU: "purple", CPU: "orange", OTHER: "default" };
const CHIP_TYPE_LABELS = { GPU: "GPU", NPU: "NPU", TPU: "TPU", CPU: "CPU", OTHER: "其他" };
const STATUS_MAP = {
  UNEVALUATED: { text: "未评测", status: "default",    color: "#d9d9d9" },
  EVALUATING:  { text: "评测中", status: "processing", color: "#1890ff" },
  EVALUATED:   { text: "已评测", status: "success",    color: "#52c41a" },
};

const PLAN_STATUS_MAP = {
  DRAFT:     { text: "草稿",   badge: "default" },
  RUNNING:   { text: "运行中", badge: "processing" },
  PAUSED:    { text: "已暂停", badge: "warning" },
  COMPLETED: { text: "已完成", badge: "success" },
  FAILED:    { text: "失败",   badge: "error" },
  CANCELLED: { text: "已取消", badge: "default" },
};

const FRAMEWORK_OPTIONS = ["PyTorch", "ONNX Runtime", "TensorFlow", "PaddlePaddle"];

const getProgress = (record) => {
  if (record.progress !== undefined && record.progress !== null) return record.progress;
  switch (record.status) {
    case "DRAFT":     return 0;
    case "RUNNING":   return 45;
    case "PAUSED":    return 30;
    case "COMPLETED": return 100;
    case "FAILED":    return 60;
    case "CANCELLED": return 20;
    default:          return 0;
  }
};

const getProgressStatus = (status) => {
  switch (status) {
    case "RUNNING":   return "active";
    case "COMPLETED": return "success";
    case "FAILED":    return "exception";
    default:          return "normal";
  }
};

const safeParse = (str) => {
  try { return JSON.parse(str || "{}"); } catch (_) { return {}; }
};

/* 综合评分颜色 */
const getScoreColor = (score) => {
  if (score >= 80) return "#52c41a";
  if (score >= 60) return "#faad14";
  return "#ff4d4f";
};

/* ── 主组件 ── */
export default function ChipProfile({ chipId, onBack, onOpenMonitor, onOpenReport, onCreatePlan }) {
  const [chip, setChip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [report, setReport] = useState(null);

  /* 编辑 Modal */
  const [techModalVisible, setTechModalVisible] = useState(false);
  const [swModalVisible, setSwModalVisible] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [techForm] = Form.useForm();
  const [swForm] = Form.useForm();

  /* ── API: 获取芯片详情 ── */
  const fetchChip = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get(`/chips/${chipId}`);
      if (resp.code === 0) {
        setChip(resp.data);
      } else {
        message.error("获取芯片信息失败");
      }
    } catch (e) {
      message.error("获取芯片信息失败: " + (e.response?.data?.message || e.message));
    } finally {
      setLoading(false);
    }
  }, [chipId]);

  /* ── API: 获取评测计划列表 ── */
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
      console.error("获取评测计划失败", e);
    } finally {
      setPlansLoading(false);
    }
  }, [chipId]);

  /* ── API: 获取最新报告 ── */
  const fetchReport = useCallback(async () => {
    try {
      const { data: resp } = await api.get("/chip-reports", { params: { chipId } });
      if (resp.code === 0 && resp.data && resp.data.length > 0) {
        setReport(resp.data[0]);
      }
    } catch (_) {
      /* 无报告不影响主流程 */
    }
  }, [chipId]);

  useEffect(() => { fetchChip(); fetchPlans(); fetchReport(); }, [fetchChip, fetchPlans, fetchReport]);

  /* ── 编辑技术规格 ── */
  const openTechModal = () => {
    if (!chip) return;
    const tech = safeParse(chip.techSpec);
    techForm.setFieldsValue({
      computePower: tech.computePower || "",
      memory: tech.memory || "",
      tdp: tech.tdp || "",
    });
    setTechModalVisible(true);
  };

  const handleTechSave = async () => {
    try {
      const values = await techForm.validateFields();
      setSubmitLoading(true);
      const techSpec = JSON.stringify({
        computePower: values.computePower || "",
        memory: values.memory || "",
        tdp: values.tdp || "",
      });
      await api.put(`/chips/${chipId}`, { ...chip, techSpec });
      message.success("技术规格更新成功");
      setTechModalVisible(false);
      fetchChip();
    } catch (e) {
      if (e.errorFields) return;
      message.error("更新失败: " + (e.response?.data?.message || e.message));
    } finally {
      setSubmitLoading(false);
    }
  };

  /* ── 编辑软件栈 ── */
  const openSwModal = () => {
    if (!chip) return;
    const sw = safeParse(chip.softwareStack);
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
      message.error("更新失败: " + (e.response?.data?.message || e.message));
    } finally {
      setSubmitLoading(false);
    }
  };

  /* ── 评测历史列 ── */
  const planColumns = [
    {
      title: "计划名称", dataIndex: "name", key: "name", width: 200, ellipsis: true,
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: "预设方案", key: "preset", width: 120,
      render: (_, record) => {
        const config = safeParse(record.evalConfig);
        return config.preset || "-";
      },
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 100,
      render: (v) => {
        const s = PLAN_STATUS_MAP[v] || { text: v, badge: "default" };
        return <Badge status={s.badge} text={s.text} />;
      },
    },
    {
      title: "进度", key: "progress", width: 150,
      render: (_, record) => (
        <Progress
          percent={getProgress(record)}
          size="small"
          status={getProgressStatus(record.status)}
          style={{ marginBottom: 0 }}
        />
      ),
    },
    {
      title: "任务数", key: "taskCount", width: 80, align: "center",
      render: (_, record) => record.taskCount || record.totalTasks || "-",
    },
    {
      title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 170,
      render: (v) => v ? new Date(v).toLocaleString("zh-CN") : "-",
    },
    {
      title: "操作", key: "actions", width: 150, fixed: "right",
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看监控">
            <Button
              type="link" size="small" icon={<EyeOutlined />}
              onClick={() => onOpenMonitor && onOpenMonitor(record.id)}
            />
          </Tooltip>
          {record.status === "COMPLETED" && (
            <Tooltip title="查看报告">
              <Button
                type="link" size="small" icon={<FileTextOutlined />}
                style={{ color: "#52c41a" }}
                onClick={() => onOpenReport && onOpenReport(record.id)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  /* ── 渲染 ── */
  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Spin size="large" tip="加载芯片档案..." />
      </div>
    );
  }

  if (!chip) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Empty description="未找到芯片信息" />
        <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ marginTop: 16 }}>
          返回列表
        </Button>
      </div>
    );
  }

  const tech = safeParse(chip.techSpec);
  const sw = safeParse(chip.softwareStack);
  const statusInfo = STATUS_MAP[chip.status] || STATUS_MAP.UNEVALUATED;

  return (
    <div>
      {/* ── 顶部概要 Card ── */}
      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="top">
          <Col>
            <Space align="start">
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}
                style={{ marginRight: 8, marginTop: 4 }} />
              <div>
                <Space align="center" style={{ marginBottom: 8 }}>
                  <Title level={3} style={{ margin: 0 }}>{chip.name}</Title>
                  <Tag color={CHIP_TYPE_COLORS[chip.chipType] || "default"}>
                    {CHIP_TYPE_LABELS[chip.chipType] || chip.chipType}
                  </Tag>
                  <Badge status={statusInfo.status} text={statusInfo.text} />
                </Space>
                <div>
                  <Text type="secondary" style={{ marginRight: 24 }}>编号: {chip.chipNo}</Text>
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
            <Space>
              {chip.status === "EVALUATED" && chip.overallScore != null && (
                <div style={{ textAlign: "center", marginRight: 24 }}>
                  <div style={{ fontSize: 36, fontWeight: "bold", color: getScoreColor(chip.overallScore), lineHeight: 1 }}>
                    {chip.overallScore}
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>综合评分</Text>
                </div>
              )}
              {report && report.overallScore != null && chip.status !== "EVALUATED" && (
                <div style={{ textAlign: "center", marginRight: 24 }}>
                  <div style={{ fontSize: 36, fontWeight: "bold", color: getScoreColor(report.overallScore), lineHeight: 1 }}>
                    {report.overallScore}
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>综合评分</Text>
                </div>
              )}
              <Button icon={<EditOutlined />} onClick={openTechModal}>编辑信息</Button>
              <Button type="primary" icon={<PlusOutlined />}
                onClick={() => onCreatePlan && onCreatePlan(chipId)}>创建评测计划</Button>
              {report && (
                <Button icon={<FileTextOutlined />}
                  onClick={() => onOpenReport && onOpenReport(report.planId || report.id)}>
                  查看最新报告
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* ── 技术规格 + 软件栈 ── */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            title={<Space><ThunderboltOutlined /> 技术规格</Space>}
            extra={<Button type="link" size="small" icon={<EditOutlined />} onClick={openTechModal}>编辑</Button>}
            style={{ height: "100%" }}
          >
            <Descriptions column={1} size="small">
              <Descriptions.Item label={<Space><DatabaseOutlined /><span>标称算力</span></Space>}>
                <Text strong>{tech.computePower || "-"}</Text>
              </Descriptions.Item>
              <Descriptions.Item label={<Space><DatabaseOutlined /><span>显存/内存</span></Space>}>
                <Text strong>{tech.memory || "-"}</Text>
              </Descriptions.Item>
              <Descriptions.Item label={<Space><ThunderboltOutlined /><span>TDP功耗</span></Space>}>
                <Text strong>{tech.tdp || "-"}</Text>
              </Descriptions.Item>
            </Descriptions>
            {!tech.computePower && !tech.memory && !tech.tdp && (
              <div style={{ textAlign: "center", padding: "16px 0", color: "#999" }}>
                暂无技术规格数据，点击编辑添加
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={<Space><AppstoreOutlined /> 软件栈</Space>}
            extra={<Button type="link" size="small" icon={<EditOutlined />} onClick={openSwModal}>编辑</Button>}
            style={{ height: "100%" }}
          >
            <Descriptions column={1} size="small">
              <Descriptions.Item label="驱动版本">
                <Text strong>{sw.driver || "-"}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="SDK版本">
                <Text strong>{sw.sdk || "-"}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="适配框架">
                {(sw.frameworks || []).length > 0
                  ? sw.frameworks.map((f) => <Tag key={f} color="blue">{f}</Tag>)
                  : <Text type="secondary">-</Text>}
              </Descriptions.Item>
            </Descriptions>
            {!sw.driver && !sw.sdk && (!sw.frameworks || sw.frameworks.length === 0) && (
              <div style={{ textAlign: "center", padding: "16px 0", color: "#999" }}>
                暂无软件栈数据，点击编辑添加
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── 评测历史 ── */}
      <Card title={<Space><FileTextOutlined /> 评测历史</Space>}>
        <Table
          rowKey="id"
          columns={planColumns}
          dataSource={plans}
          loading={plansLoading}
          scroll={{ x: 900 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条评测记录`,
          }}
          locale={{ emptyText: <Empty description="暂无评测记录" /> }}
        />
      </Card>

      {/* ── 技术规格编辑 Modal ── */}
      <Modal
        title="编辑技术规格"
        open={techModalVisible}
        onCancel={() => setTechModalVisible(false)}
        onOk={handleTechSave}
        confirmLoading={submitLoading}
        destroyOnClose
      >
        <Form form={techForm} layout="vertical">
          <Form.Item name="computePower" label="标称算力">
            <Input placeholder="如 312 TFLOPS" />
          </Form.Item>
          <Form.Item name="memory" label="显存/内存">
            <Input placeholder="如 80GB HBM2e" />
          </Form.Item>
          <Form.Item name="tdp" label="TDP功耗">
            <Input placeholder="如 400W" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── 软件栈编辑 Modal ── */}
      <Modal
        title="编辑软件栈"
        open={swModalVisible}
        onCancel={() => setSwModalVisible(false)}
        onOk={handleSwSave}
        confirmLoading={submitLoading}
        destroyOnClose
      >
        <Form form={swForm} layout="vertical">
          <Form.Item name="driver" label="驱动版本">
            <Input placeholder="如 535.129.03" />
          </Form.Item>
          <Form.Item name="sdk" label="SDK版本">
            <Input placeholder="如 CUDA 12.2" />
          </Form.Item>
          <Form.Item name="frameworks" label="适配框架">
            <Select mode="multiple" placeholder="选择适配框架" allowClear>
              {FRAMEWORK_OPTIONS.map((f) => <Option key={f} value={f}>{f}</Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
