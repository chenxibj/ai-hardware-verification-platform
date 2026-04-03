/**
 * @file PlanCreate.js
 * @description 创建评测计划 — 3步向导（选芯片 → 选方案 → 确认提交）
 * Issue: #131
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Steps, Button, Radio, Tag, Badge, Empty, Row, Col, Space,
  Descriptions, message, Typography, Spin, Result,
} from "antd";
import {
  RocketOutlined, FileTextOutlined, ExperimentOutlined,
  CheckCircleOutlined, ArrowLeftOutlined, ArrowRightOutlined,
  PlayCircleOutlined, SaveOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";

const { Title, Text, Paragraph } = Typography;

/* ── 芯片相关常量（同 ChipList） ── */
const CHIP_TYPE_COLORS = { GPU: "blue", NPU: "green", TPU: "purple", CPU: "orange", OTHER: "default" };
const CHIP_TYPE_LABELS = { GPU: "GPU", NPU: "NPU", TPU: "TPU", CPU: "CPU", OTHER: "其他" };
const STATUS_MAP = {
  UNEVALUATED: { text: "待评测", status: "default" },
  EVALUATING:  { text: "评测中", status: "processing" },
  EVALUATED:   { text: "已评测", status: "success" },
};

/* ── 评测预设方案 ── */
const PRESETS = [
  {
    key: "QUICK",
    icon: <RocketOutlined style={{ fontSize: 32, color: "#1890ff" }} />,
    title: "🚀 快速验证",
    desc: "核心算子 + MLP推理",
    detail: "覆盖 10 个核心算子（MatMul、Conv2D、BatchNorm 等）及 MLP 端到端推理验证，适合初次接入快速摸底。",
    duration: "~15 分钟",
    taskCount: "约 15 个任务",
    color: "#1890ff",
  },
  {
    key: "STANDARD",
    icon: <FileTextOutlined style={{ fontSize: 32, color: "#52c41a" }} />,
    title: "📋 标准评测",
    desc: "50+ 算子 + MLP 多 Batch",
    detail: "覆盖 50+ 算子全精度验证、MLP 多 Batch Size 推理及基础性能采集，适合日常回归验证。",
    duration: "~1 小时",
    taskCount: "约 60 个任务",
    color: "#52c41a",
  },
  {
    key: "FULL",
    icon: <ExperimentOutlined style={{ fontSize: 32, color: "#722ed1" }} />,
    title: "🔬 全量评测",
    desc: "100+ 算子 + 基础模型 + 性能",
    detail: "覆盖 100+ 算子、基础模型端到端推理、性能 Benchmark 全项评测，适合正式评测报告出具。",
    duration: "~4 小时",
    taskCount: "约 120 个任务",
    color: "#722ed1",
  },
];

export default function PlanCreate() {
  const navigate = useNavigate();

  /* 向导步骤 */
  const [current, setCurrent] = useState(0);

  /* Step 1: 芯片 */
  const [chips, setChips] = useState([]);
  const [chipsLoading, setChipsLoading] = useState(false);
  const [selectedChipId, setSelectedChipId] = useState(null);

  /* Step 2: 预设 */
  const [selectedPreset, setSelectedPreset] = useState(null);

  /* Step 3: 提交 */
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  /* ── 获取芯片列表 ── */
  const fetchChips = useCallback(async () => {
    setChipsLoading(true);
    try {
      const { data: resp } = await api.get("/chips", { params: { page: 0, size: 100 } });
      if (resp.code === 0) {
        setChips(resp.data || []);
      }
    } catch (e) {
      message.error("获取芯片列表失败");
    } finally {
      setChipsLoading(false);
    }
  }, []);

  useEffect(() => { fetchChips(); }, [fetchChips]);

  /* ── 导出选中对象 ── */
  const selectedChip = chips.find((c) => c.id === selectedChipId);
  const selectedPresetObj = PRESETS.find((p) => p.key === selectedPreset);

  /* ── 自动生成名称 ── */
  const generateName = () => {
    if (!selectedChip || !selectedPresetObj) return "";
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const presetLabel = selectedPresetObj.title.replace(/[🚀📋🔬]\s*/, "");
    return `${selectedChip.name} ${presetLabel} ${date}`;
  };

  /* ── 提交 ── */
  const handleSubmit = async (runNow) => {
    setSubmitting(true);
    try {
      const payload = {
        name: generateName(),
        chipId: selectedChipId,
        evalConfig: JSON.stringify({ preset: selectedPreset, description: selectedPresetObj.desc }),
        status: runNow ? "RUNNING" : "DRAFT",
      };
      const { data: resp } = await api.post("/plans", payload);
      if (resp.code === 0) {
        message.success(runNow ? "计划已创建并启动执行" : "计划已保存为草稿");
        setSubmitted(true);
      } else {
        message.error(resp.message || "创建失败");
      }
    } catch (e) {
      message.error("创建失败: " + (e.response?.data?.message || e.message));
    } finally {
      setSubmitting(false);
    }
  };

  /* ── 步骤配置 ── */
  const steps = [
    { title: "选择目标芯片", icon: <ExperimentOutlined /> },
    { title: "选择评测方案", icon: <FileTextOutlined /> },
    { title: "确认并提交", icon: <CheckCircleOutlined /> },
  ];

  /* ── 步骤导航 ── */
  const canNext = () => {
    if (current === 0) return selectedChipId !== null;
    if (current === 1) return selectedPreset !== null;
    return true;
  };

  /* ── 提交成功 ── */
  if (submitted) {
    return (
      <Card>
        <Result
          status="success"
          title="评测计划创建成功！"
          subTitle={`计划名称：${generateName()}`}
          extra={[
            <Button type="primary" key="list" onClick={() => navigate("/plans")}>
              查看计划列表
            </Button>,
            <Button key="create" onClick={() => {
              setCurrent(0);
              setSelectedChipId(null);
              setSelectedPreset(null);
              setSubmitted(false);
            }}>
              继续创建
            </Button>,
          ]}
        />
      </Card>
    );
  }

  /* ── Step 1: 选芯片 ── */
  const renderStep1 = () => (
    <Spin spinning={chipsLoading}>
      {chips.length === 0 && !chipsLoading ? (
        <Empty description="暂无已注册芯片">
          <Button type="primary" onClick={() => navigate("/chips")}>
            去注册芯片
          </Button>
        </Empty>
      ) : (
        <Radio.Group
          value={selectedChipId}
          onChange={(e) => setSelectedChipId(e.target.value)}
          style={{ width: "100%" }}
        >
          <Row gutter={[16, 16]}>
            {chips.map((chip) => {
              const st = STATUS_MAP[chip.status] || { text: chip.status, status: "default" };
              const isSelected = selectedChipId === chip.id;
              return (
                <Col xs={24} sm={12} md={8} key={chip.id}>
                  <Radio value={chip.id} style={{ display: "none" }} />
                  <Card
                    hoverable
                    onClick={() => setSelectedChipId(chip.id)}
                    style={{
                      border: isSelected ? "2px solid #1890ff" : "1px solid #f0f0f0",
                      background: isSelected ? "#e6f7ff" : "#fff",
                      cursor: "pointer",
                    }}
                  >
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

  /* ── Step 2: 选方案 ── */
  const renderStep2 = () => (
    <div>
      <Radio.Group
        value={selectedPreset}
        onChange={(e) => setSelectedPreset(e.target.value)}
        style={{ width: "100%" }}
      >
        <Row gutter={[16, 16]}>
          {PRESETS.map((preset) => {
            const isSelected = selectedPreset === preset.key;
            return (
              <Col xs={24} md={8} key={preset.key}>
                <Radio value={preset.key} style={{ display: "none" }} />
                <Card
                  hoverable
                  onClick={() => setSelectedPreset(preset.key)}
                  style={{
                    border: isSelected ? `2px solid ${preset.color}` : "1px solid #f0f0f0",
                    background: isSelected ? `${preset.color}08` : "#fff",
                    cursor: "pointer",
                    textAlign: "center",
                    minHeight: 200,
                  }}
                >
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    <div>{preset.icon}</div>
                    <Title level={4} style={{ margin: 0 }}>{preset.title}</Title>
                    <Text type="secondary">{preset.desc}</Text>
                    <div>
                      <Tag color="blue">{preset.duration}</Tag>
                      <Tag>{preset.taskCount}</Tag>
                    </div>
                    {isSelected && <CheckCircleOutlined style={{ color: preset.color, fontSize: 20 }} />}
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Radio.Group>

      {/* 方案摘要 */}
      {selectedPresetObj && (
        <Card size="small" style={{ marginTop: 16, background: "#fafafa" }}>
          <Title level={5} style={{ margin: 0 }}>方案说明</Title>
          <Paragraph style={{ margin: "8px 0 0" }}>{selectedPresetObj.detail}</Paragraph>
        </Card>
      )}
    </div>
  );

  /* ── Step 3: 确认 ── */
  const renderStep3 = () => (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Title level={5}>📋 计划摘要</Title>
        <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
          <Descriptions.Item label="计划名称" span={2}>
            <Text strong>{generateName()}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="目标芯片">
            <Space>
              <Text>{selectedChip?.name}</Text>
              <Tag color={CHIP_TYPE_COLORS[selectedChip?.chipType]}>
                {CHIP_TYPE_LABELS[selectedChip?.chipType] || selectedChip?.chipType}
              </Tag>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="芯片厂商">{selectedChip?.manufacturer}</Descriptions.Item>
          <Descriptions.Item label="评测方案">
            <Text strong style={{ color: selectedPresetObj?.color }}>
              {selectedPresetObj?.title}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="方案说明">{selectedPresetObj?.desc}</Descriptions.Item>
          <Descriptions.Item label="预计任务数">
            <Tag color="blue">{selectedPresetObj?.taskCount}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="预计耗时">
            <Tag color="orange">{selectedPresetObj?.duration}</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row justify="center" gutter={16}>
        <Col>
          <Button
            size="large"
            icon={<SaveOutlined />}
            loading={submitting}
            onClick={() => handleSubmit(false)}
          >
            保存为草稿
          </Button>
        </Col>
        <Col>
          <Button
            type="primary"
            size="large"
            icon={<PlayCircleOutlined />}
            loading={submitting}
            onClick={() => handleSubmit(true)}
          >
            立即执行
          </Button>
        </Col>
      </Row>
    </div>
  );

  const stepContent = [renderStep1, renderStep2, renderStep3];

  return (
    <div>
      <Card>
        <Steps current={current} items={steps} style={{ marginBottom: 32 }} />

        <div style={{ minHeight: 300, padding: "16px 0" }}>
          {stepContent[current]()}
        </div>

        {/* 底部导航按钮 */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
          <div>
            {current > 0 && (
              <Button icon={<ArrowLeftOutlined />} onClick={() => setCurrent(current - 1)}>
                上一步
              </Button>
            )}
          </div>
          <div>
            {current < 2 && (
              <Button
                type="primary"
                disabled={!canNext()}
                onClick={() => setCurrent(current + 1)}
              >
                下一步 <ArrowRightOutlined />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
