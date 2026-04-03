/**
 * @file PlanMonitor.js
 * @description 执行监控页面 — 计划信息 + 任务列表 + 日志
 * Issue: #134
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Card, Row, Col, Statistic, Progress, Badge, Tag, Button, Space,
  Collapse, Typography, Tooltip, message, Spin, Popconfirm,
} from "antd";
import {
  ArrowLeftOutlined, PauseCircleOutlined, PlayCircleOutlined,
  StopOutlined, ReloadOutlined, CheckCircleOutlined,
  ClockCircleOutlined, ExclamationCircleOutlined,
  SyncOutlined, ExperimentOutlined, RobotOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text } = Typography;

/* ── 状态颜色映射 ── */
const TASK_STATUS_MAP = {
  COMPLETED: { color: "green",      text: "已完成", icon: <CheckCircleOutlined /> },
  RUNNING:   { color: "blue",       text: "运行中", icon: <SyncOutlined spin /> },
  PENDING:   { color: "default",    text: "排队中", icon: <ClockCircleOutlined /> },
  QUEUED:    { color: "default",    text: "排队中", icon: <ClockCircleOutlined /> },
  FAILED:    { color: "red",        text: "失败",   icon: <ExclamationCircleOutlined /> },
  PAUSED:    { color: "orange",     text: "已暂停", icon: <PauseCircleOutlined /> },
  CANCELLED: { color: "default",    text: "已取消", icon: <StopOutlined /> },
};

const PLAN_STATUS_MAP = {
  DRAFT:     { text: "草稿",   badge: "default" },
  RUNNING:   { text: "运行中", badge: "processing" },
  PAUSED:    { text: "已暂停", badge: "warning" },
  COMPLETED: { text: "已完成", badge: "success" },
  FAILED:    { text: "失败",   badge: "error" },
  CANCELLED: { text: "已取消", badge: "default" },
};

const SUBJECT_ICONS = {
  OPERATOR: <ExperimentOutlined />,
  MODEL: <RobotOutlined />,
};

const SUBJECT_LABELS = {
  OPERATOR: "算子评测",
  MODEL: "模型推理",
};

/* ── 计算耗时 ── */
function formatDuration(startedAt, completedAt) {
  if (!startedAt) return "-";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const sec = Math.floor((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

export default function PlanMonitor({ planId, onBack }) {
  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const prevTasksRef = useRef({});
  const timerRef = useRef(null);

  /* ── 获取计划信息 ── */
  const fetchPlan = useCallback(async () => {
    try {
      const { data: resp } = await api.get(`/plans/${planId}`);
      if (resp.code === 0) setPlan(resp.data);
    } catch (e) {
      console.error("获取计划信息失败", e);
    }
  }, [planId]);

  /* ── 获取任务列表 ── */
  const fetchTasks = useCallback(async () => {
    try {
      const { data: resp } = await api.get(`/plans/${planId}/tasks`);
      if (resp.code === 0) {
        const newTasks = resp.data || [];
        // 检测状态变更生成日志
        const prevMap = prevTasksRef.current;
        const now = new Date().toLocaleTimeString("zh-CN");
        const newLogs = [];
        newTasks.forEach((t) => {
          const prev = prevMap[t.id];
          if (prev && prev !== t.status) {
            newLogs.push(`[${now}] 任务 "${t.name}" 状态变更: ${prev} → ${t.status}`);
          }
        });
        if (newLogs.length > 0) {
          setLogs((prev) => [...newLogs, ...prev].slice(0, 100));
        }
        // 更新引用
        const map = {};
        newTasks.forEach((t) => { map[t.id] = t.status; });
        prevTasksRef.current = map;
        setTasks(newTasks);
      }
    } catch (e) {
      console.error("获取任务列表失败", e);
    }
  }, [planId]);

  /* ── 首次加载 + 轮询 ── */
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchPlan(), fetchTasks()]).finally(() => setLoading(false));
    timerRef.current = setInterval(() => {
      fetchPlan();
      fetchTasks();
    }, 10000);
    return () => clearInterval(timerRef.current);
  }, [fetchPlan, fetchTasks]);

  /* ── 操作 ── */
  const handlePlanAction = async (action, label) => {
    try {
      await api.put(`/plans/${planId}/${action}`);
      message.success(`${label}成功`);
      fetchPlan();
      fetchTasks();
    } catch (e) {
      message.error(`${label}失败: ` + (e.response?.data?.message || e.message));
    }
  };

  const handleRetryTask = async (taskId) => {
    try {
      await api.post(`/tasks/${taskId}/retry`);
      message.success("重试已提交");
      fetchTasks();
    } catch (e) {
      message.error("重试失败: " + (e.response?.data?.message || e.message));
    }
  };

  /* ── 统计 ── */
  const statCounts = {
    completed: tasks.filter((t) => t.status === "COMPLETED").length,
    running:   tasks.filter((t) => t.status === "RUNNING").length,
    pending:   tasks.filter((t) => ["PENDING", "QUEUED"].includes(t.status)).length,
    failed:    tasks.filter((t) => t.status === "FAILED").length,
  };

  const progressPercent = plan && plan.totalTasks > 0
    ? Math.round((statCounts.completed / plan.totalTasks) * 100)
    : 0;

  const progressStatus = plan
    ? plan.status === "COMPLETED" ? "success"
    : plan.status === "FAILED" ? "exception"
    : statCounts.running > 0 ? "active" : "normal"
    : "normal";

  /* ── 按 testSubject 分组 ── */
  const grouped = {};
  tasks.forEach((t) => {
    const key = t.testSubject || "OTHER";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  /* ── 渲染任务行 ── */
  const renderTaskRow = (task) => {
    const st = TASK_STATUS_MAP[task.status] || { color: "default", text: task.status };
    return (
      <div key={task.id} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: "1px solid #f0f0f0",
      }}>
        <Space style={{ flex: 1 }}>
          <Text style={{ width: 200, display: "inline-block" }}>{task.testItem || task.name}</Text>
          <Tag color={st.color} icon={st.icon}>{st.text}</Tag>
        </Space>
        <Space>
          {task.progress !== undefined && task.progress > 0 && task.status === "RUNNING" && (
            <Text type="secondary" style={{ fontSize: 12 }}>{task.progress}%</Text>
          )}
          <Text type="secondary" style={{ fontSize: 12, width: 80, textAlign: "right" }}>
            {formatDuration(task.startedAt, task.completedAt)}
          </Text>
          {task.status === "FAILED" && (
            <Button type="link" size="small" icon={<ReloadOutlined />}
              onClick={() => handleRetryTask(task.id)}>
              重试
            </Button>
          )}
        </Space>
      </div>
    );
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" tip="加载中..." /></div>;
  }

  const planStatus = plan ? (PLAN_STATUS_MAP[plan.status] || { text: plan.status, badge: "default" }) : {};

  return (
    <div>
      {/* 返回按钮 */}
      <Button type="link" icon={<ArrowLeftOutlined />} onClick={onBack}
        style={{ marginBottom: 12, paddingLeft: 0 }}>
        返回计划列表
      </Button>

      {/* ── 顶部：计划信息 + 整体进度 ── */}
      <Card style={{ marginBottom: 16 }}>
        <Row align="middle" justify="space-between" style={{ marginBottom: 16 }}>
          <Col>
            <Space size="middle">
              <Title level={4} style={{ margin: 0 }}>{plan?.name || "-"}</Title>
              <Badge status={planStatus.badge} text={planStatus.text} />
              <Text type="secondary">芯片 #{plan?.chipId}</Text>
            </Space>
          </Col>
          <Col>
            <Space>
              {plan?.status === "RUNNING" && (
                <Button icon={<PauseCircleOutlined />}
                  onClick={() => handlePlanAction("pause", "暂停")}>
                  暂停
                </Button>
              )}
              {plan?.status === "PAUSED" && (
                <Button type="primary" icon={<PlayCircleOutlined />}
                  onClick={() => handlePlanAction("resume", "恢复")}>
                  恢复
                </Button>
              )}
              {plan?.status === "DRAFT" && (
                <Button type="primary" icon={<PlayCircleOutlined />}
                  onClick={() => handlePlanAction("start", "启动")}>
                  启动执行
                </Button>
              )}
              {(plan?.status === "RUNNING" || plan?.status === "PAUSED") && (
                <Popconfirm title="确定取消该计划?" onConfirm={() => handlePlanAction("cancel", "取消")}>
                  <Button danger icon={<StopOutlined />}>取消</Button>
                </Popconfirm>
              )}
              <Tooltip title="手动刷新">
                <Button icon={<ReloadOutlined />} onClick={() => { fetchPlan(); fetchTasks(); }} />
              </Tooltip>
            </Space>
          </Col>
        </Row>

        <Progress percent={progressPercent} status={progressStatus}
          format={() => `${statCounts.completed}/${plan?.totalTasks || 0}`}
          style={{ marginBottom: 16 }} />

        <Row gutter={24}>
          <Col xs={12} sm={6}>
            <Statistic title="已完成" value={statCounts.completed}
              valueStyle={{ color: "#52c41a" }}
              prefix={<CheckCircleOutlined />} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="运行中" value={statCounts.running}
              valueStyle={{ color: "#1890ff" }}
              prefix={<SyncOutlined />} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="排队中" value={statCounts.pending}
              prefix={<ClockCircleOutlined />} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="失败" value={statCounts.failed}
              valueStyle={{ color: "#ff4d4f" }}
              prefix={<ExclamationCircleOutlined />} />
          </Col>
        </Row>
      </Card>

      {/* ── 中部：分组任务列表 ── */}
      <Card title="任务列表" style={{ marginBottom: 16 }}>
        {Object.keys(grouped).length === 0 ? (
          <Text type="secondary">暂无任务</Text>
        ) : (
          <Collapse defaultActiveKey={Object.keys(grouped)} ghost>
            {Object.entries(grouped).map(([subject, subjectTasks]) => {
              const completed = subjectTasks.filter((t) => t.status === "COMPLETED").length;
              const failed = subjectTasks.filter((t) => t.status === "FAILED").length;
              const running = subjectTasks.filter((t) => t.status === "RUNNING").length;
              return (
                <Collapse.Panel
                  key={subject}
                  header={
                    <Space>
                      {SUBJECT_ICONS[subject] || <ExperimentOutlined />}
                      <Text strong>{SUBJECT_LABELS[subject] || subject}</Text>
                      <Text type="secondary">({subjectTasks.length} 项)</Text>
                      {completed > 0 && <Tag color="green">{completed} 完成</Tag>}
                      {running > 0 && <Tag color="blue">{running} 运行中</Tag>}
                      {failed > 0 && <Tag color="red">{failed} 失败</Tag>}
                    </Space>
                  }
                >
                  {subjectTasks.map(renderTaskRow)}
                </Collapse.Panel>
              );
            })}
          </Collapse>
        )}
      </Card>

      {/* ── 底部：日志区域 ── */}
      <Card title="执行日志" size="small">
        <div style={{
          background: "#1e1e1e", color: "#d4d4d4", padding: 12, borderRadius: 6,
          fontFamily: "Consolas, Monaco, 'Courier New', monospace", fontSize: 12,
          maxHeight: 240, overflowY: "auto", minHeight: 80,
        }}>
          {logs.length === 0 ? (
            <Text style={{ color: "#888" }}>等待任务状态变更...</Text>
          ) : (
            logs.map((line, i) => <div key={i}>{line}</div>)
          )}
        </div>
      </Card>
    </div>
  );
}
