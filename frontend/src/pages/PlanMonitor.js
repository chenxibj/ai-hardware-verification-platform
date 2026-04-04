/**
 * @file PlanMonitor.js
 * @description 执行监控页面 — 资源仪表盘 + 任务列表(含重试/跳过) + 实时日志
 * Issue: #134, #163
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Card, Row, Col, Statistic, Progress, Badge, Tag, Button, Space,
  Collapse, Typography, Tooltip, message, Spin, Popconfirm, Input, Select, Modal,
} from "antd";
import {
  ArrowLeftOutlined, PauseCircleOutlined, PlayCircleOutlined,
  StopOutlined, ReloadOutlined, CheckCircleOutlined,
  ClockCircleOutlined, ExclamationCircleOutlined,
  SyncOutlined, ExperimentOutlined, RobotOutlined,
  ForwardOutlined, DashboardOutlined, SearchOutlined,
  DownloadOutlined,
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
  SKIPPED:   { color: "gold",       text: "已跳过", icon: <ForwardOutlined /> },
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

/* ── 模拟资源数据 ── */
function simulateResource(tasks) {
  const running = tasks.filter(t => t.status === "RUNNING").length;
  const total = tasks.length;
  return {
    cpu: Math.min(95, 15 + running * 18 + Math.floor(Math.random() * 8)),
    memory: Math.min(90, 30 + running * 12 + Math.floor(Math.random() * 6)),
  };
}

/* ── 模拟日志 ── */
const LOG_TEMPLATES = [
  (task) => `[INFO] Task "${task.name}" — initializing evaluation environment...`,
  (task) => `[INFO] Task "${task.name}" — loading test data (batch_size=64)...`,
  (task) => `[INFO] Task "${task.name}" — running forward pass iteration ${Math.floor(Math.random() * 100)}...`,
  (task) => `[DEBUG] Task "${task.name}" — memory allocated: ${(Math.random() * 4 + 1).toFixed(1)} GB`,
  (task) => `[INFO] Task "${task.name}" — checkpoint saved, progress: ${task.progress || 0}%`,
  (task) => `[WARN] Task "${task.name}" — high latency detected: ${(Math.random() * 50 + 10).toFixed(1)}ms`,
];

export default function PlanMonitor({ planId, onBack }) {
  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState("all");
  const [logSearch, setLogSearch] = useState("");
  const [resource, setResource] = useState({ cpu: 0, memory: 0 });
  const prevTasksRef = useRef({});
  const timerRef = useRef(null);
  const logTimerRef = useRef(null);
  const startTimeRef = useRef(Date.now());

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
        const prevMap = prevTasksRef.current;
        const now = new Date().toLocaleTimeString("zh-CN");
        const newLogs = [];
        newTasks.forEach((t) => {
          const prev = prevMap[t.id];
          if (prev && prev !== t.status) {
            newLogs.push({ time: now, taskId: t.id, taskName: t.name, level: "INFO",
              text: `任务 "${t.name}" 状态变更: ${prev} → ${t.status}` });
          }
        });
        if (newLogs.length > 0) {
          setLogs((prev) => [...newLogs, ...prev].slice(0, 200));
        }
        const map = {};
        newTasks.forEach((t) => { map[t.id] = t.status; });
        prevTasksRef.current = map;
        setTasks(newTasks);
        setResource(simulateResource(newTasks));
      }
    } catch (e) {
      console.error("获取任务列表失败", e);
    }
  }, [planId]);

  /* ── 首次加载 + 轮询 ── */
  useEffect(() => {
    setLoading(true);
    startTimeRef.current = Date.now();
    Promise.all([fetchPlan(), fetchTasks()]).finally(() => setLoading(false));
    timerRef.current = setInterval(() => {
      fetchPlan();
      fetchTasks();
    }, 10000);
    return () => clearInterval(timerRef.current);
  }, [fetchPlan, fetchTasks]);

  /* ── 模拟日志流 ── */
  useEffect(() => {
    logTimerRef.current = setInterval(() => {
      const runningTasks = tasks.filter(t => t.status === "RUNNING");
      if (runningTasks.length === 0) return;
      const task = runningTasks[Math.floor(Math.random() * runningTasks.length)];
      const template = LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)];
      const now = new Date().toLocaleTimeString("zh-CN");
      const level = Math.random() > 0.85 ? "WARN" : Math.random() > 0.7 ? "DEBUG" : "INFO";
      setLogs(prev => [{ time: now, taskId: task.id, taskName: task.name, level, text: template(task) }, ...prev].slice(0, 200));
    }, 3000);
    return () => clearInterval(logTimerRef.current);
  }, [tasks]);

  /* ── 操作 ── */
  /* Bug #200: 操作增加二次确认弹窗 */
  const PLAN_ACTION_CONFIRM = {
    pause:  { title: '确认暂停', content: '暂停后正在运行的任务将继续完成，新任务不再启动。', okText: '确认暂停' },
    resume: { title: '确认恢复', content: '恢复后将继续执行排队中的任务。', okText: '确认恢复' },
    start:  { title: '确认启动', content: '启动后将开始执行评测任务。', okText: '确认启动' },
    cancel: { title: '确认取消', content: '取消后该计划将停止执行，已完成的任务结果保留。确认取消？', okText: '确认取消', okType: 'danger' },
  };

  const handlePlanAction = (action, label) => {
    const confirmCfg = PLAN_ACTION_CONFIRM[action] || { title: `确认${label}`, content: `确定要${label}该计划吗？`, okText: '确认' };
    Modal.confirm({
      title: confirmCfg.title,
      content: confirmCfg.content,
      okText: confirmCfg.okText || '确认',
      okType: confirmCfg.okType || 'primary',
      cancelText: '返回',
      onOk: async () => {
        try {
          await api.put(`/plans/${planId}/${action}`);
          message.success(`${label}成功`);
          fetchPlan();
          fetchTasks();
        } catch (e) {
          message.error(`${label}失败: ` + (e.response?.data?.message || e.message));
        }
      },
    });
  };

  const handleRetryTask = (taskId) => {
    Modal.confirm({
      title: '确认重试',
      content: '将重新执行该失败任务，是否继续？',
      okText: '确认重试',
      cancelText: '返回',
      onOk: async () => {
        try {
          await api.post(`/tasks/${taskId}/retry`);
          message.success("重试已提交");
          fetchTasks();
        } catch (e) {
          message.error("重试失败: " + (e.response?.data?.message || e.message));
        }
      },
    });
  };

  /* Bug #200: 重试全部失败任务（带确认） */
  const handleRetryAllFailed = () => {
    const failedTasks = tasks.filter(t => t.status === "FAILED");
    if (failedTasks.length === 0) {
      message.info("没有失败的任务需要重试");
      return;
    }
    Modal.confirm({
      title: '确认重试全部失败任务',
      content: `将重试 ${failedTasks.length} 个失败任务，是否继续？`,
      okText: '确认重试',
      cancelText: '返回',
      onOk: async () => {
        try {
          await Promise.all(failedTasks.map(t => api.post(`/tasks/${t.id}/retry`)));
          message.success(`已提交 ${failedTasks.length} 个重试任务`);
          fetchTasks();
        } catch (e) {
          message.error("部分重试失败");
          fetchTasks();
        }
      },
    });
  };

  const handleSkipTask = async (taskId) => {
    try {
      await api.post(`/tasks/${taskId}/skip`);
      message.success("已跳过该任务");
      fetchTasks();
      fetchPlan();
    } catch (e) {
      message.error("跳过失败: " + (e.response?.data?.message || e.message));
    }
  };

  /* ── 统计 ── */
  const statCounts = {
    completed: tasks.filter((t) => t.status === "COMPLETED").length,
    running:   tasks.filter((t) => t.status === "RUNNING").length,
    pending:   tasks.filter((t) => ["PENDING", "QUEUED"].includes(t.status)).length,
    failed:    tasks.filter((t) => t.status === "FAILED").length,
    skipped:   tasks.filter((t) => t.status === "SKIPPED").length,
  };

  const progressPercent = plan && plan.totalTasks > 0
    ? Math.round(((statCounts.completed + statCounts.skipped) / plan.totalTasks) * 100)
    : 0;

  const progressStatus = plan
    ? plan.status === "COMPLETED" ? "success"
    : plan.status === "FAILED" ? "exception"
    : statCounts.running > 0 ? "active" : "normal"
    : "normal";

  /* ── 计算已耗时 + 预估剩余 ── */
  const elapsed = Date.now() - startTimeRef.current;
  const elapsedStr = formatDuration(new Date(startTimeRef.current).toISOString(), null);
  const done = statCounts.completed + statCounts.skipped + statCounts.failed;
  const remaining = tasks.length > 0 && done > 0 && done < tasks.length
    ? Math.round((elapsed / done) * (tasks.length - done) / 1000) : 0;
  const remainStr = remaining > 0
    ? remaining < 60 ? `~${remaining}s`
    : remaining < 3600 ? `~${Math.floor(remaining / 60)}m`
    : `~${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m`
    : plan?.status === "COMPLETED" ? "已完成" : "-";

  /* ── 按 testSubject 分组 ── */
  const grouped = {};
  tasks.forEach((t) => {
    const key = t.testSubject || "OTHER";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  /* ── 日志过滤 ── */
  const filteredLogs = logs.filter(log => {
    if (logFilter !== "all" && String(log.taskId) !== logFilter) return false;
    if (logSearch && !log.text.toLowerCase().includes(logSearch.toLowerCase())) return false;
    return true;
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
            <Space size={4}>
              <Tooltip title={task.errorMessage || "执行失败，无详细错误信息"}>
                <ExclamationCircleOutlined style={{ color: "#ff4d4f", cursor: "pointer" }} />
              </Tooltip>
              <Popconfirm title="确定重试该任务？" onConfirm={() => handleRetryTask(task.id)}>
                <Button type="link" size="small" icon={<ReloadOutlined />}>
                  重试
                </Button>
              </Popconfirm>
              <Popconfirm title="确定跳过该任务？跳过后不会再执行" onConfirm={() => handleSkipTask(task.id)}>
                <Button type="link" size="small" icon={<ForwardOutlined />} style={{ color: "#faad14" }}>
                  跳过
                </Button>
              </Popconfirm>
            </Space>
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

      {/* ── 顶部: 资源仪表盘 (#163) ── */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={24} align="middle">
          <Col xs={24} md={5} style={{ textAlign: "center" }}>
            <DashboardOutlined style={{ fontSize: 18, color: "#1890ff", marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>CPU 使用率</div>
            <Progress
              type="circle"
              percent={resource.cpu}
              size={80}
              strokeColor={resource.cpu > 80 ? "#ff4d4f" : resource.cpu > 60 ? "#faad14" : "#52c41a"}
              format={p => <span style={{ fontSize: 16, fontWeight: "bold" }}>{p}%</span>}
            />
          </Col>
          <Col xs={24} md={5} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>内存使用率</div>
            <Progress
              type="circle"
              percent={resource.memory}
              size={80}
              strokeColor={resource.memory > 80 ? "#ff4d4f" : resource.memory > 60 ? "#faad14" : "#1890ff"}
              format={p => <span style={{ fontSize: 16, fontWeight: "bold" }}>{p}%</span>}
            />
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="已耗时" value={elapsedStr} valueStyle={{ fontSize: 18 }} />
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="预估剩余" value={remainStr} valueStyle={{ fontSize: 18, color: "#1890ff" }} />
          </Col>
          <Col xs={12} md={3}>
            <Statistic title="任务进度"
              value={`${statCounts.completed + statCounts.skipped}/${plan?.totalTasks || tasks.length}`}
              valueStyle={{ fontSize: 18 }} />
          </Col>
          <Col xs={12} md={3}>
            <Statistic title="失败/跳过"
              value={`${statCounts.failed}/${statCounts.skipped}`}
              valueStyle={{ fontSize: 18, color: statCounts.failed > 0 ? "#ff4d4f" : "#999" }} />
          </Col>
        </Row>
      </Card>

      {/* ── 计划信息 + 整体进度 ── */}
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
                <Popconfirm title="确定要暂停评测？暂停后可恢复继续执行" onConfirm={() => handlePlanAction("pause", "暂停")}>
                  <Button icon={<PauseCircleOutlined />}>
                    暂停
                  </Button>
                </Popconfirm>
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
                <Button danger icon={<StopOutlined />}
                  onClick={() => handlePlanAction("cancel", "取消")}>取消</Button>
              )}
              <Tooltip title="手动刷新">
                <Button icon={<ReloadOutlined />} onClick={() => { fetchPlan(); fetchTasks(); }} />
              </Tooltip>
            </Space>
          </Col>
        </Row>

        <Progress percent={progressPercent} status={progressStatus}
          format={() => `${statCounts.completed + statCounts.skipped}/${plan?.totalTasks || tasks.length}`}
          style={{ marginBottom: 16 }} />

        <Row gutter={24}>
          <Col xs={12} sm={5}>
            <Statistic title="已完成" value={statCounts.completed}
              valueStyle={{ color: "#52c41a" }}
              prefix={<CheckCircleOutlined />} />
          </Col>
          <Col xs={12} sm={5}>
            <Statistic title="运行中" value={statCounts.running}
              valueStyle={{ color: "#1890ff" }}
              prefix={<SyncOutlined />} />
          </Col>
          <Col xs={12} sm={5}>
            <Statistic title="排队中" value={statCounts.pending}
              prefix={<ClockCircleOutlined />} />
          </Col>
          <Col xs={12} sm={5}>
            <Statistic title="失败" value={statCounts.failed}
              valueStyle={{ color: "#ff4d4f" }}
              prefix={<ExclamationCircleOutlined />} />
          </Col>
          <Col xs={12} sm={4}>
            <Statistic title="已跳过" value={statCounts.skipped}
              valueStyle={{ color: "#faad14" }}
              prefix={<ForwardOutlined />} />
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
              const skipped = subjectTasks.filter((t) => t.status === "SKIPPED").length;
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
                      {skipped > 0 && <Tag color="gold">{skipped} 跳过</Tag>}
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

      {/* ── 底部：实时日志面板 (#163) ── */}
      <Card
        title="实时执行日志"
        size="small"
        extra={
          <Space>
            <Select
              value={logFilter}
              onChange={setLogFilter}
              style={{ width: 180 }}
              size="small"
            >
              <Select.Option value="all">全部任务</Select.Option>
              {tasks.map(t => (
                <Select.Option key={t.id} value={String(t.id)}>
                  {t.testItem || t.name}
                </Select.Option>
              ))}
            </Select>
            <Input
              placeholder="搜索日志..."
              prefix={<SearchOutlined />}
              value={logSearch}
              onChange={e => setLogSearch(e.target.value)}
              style={{ width: 180 }}
              size="small"
              allowClear
            />
          </Space>
        }
      >
        <div style={{
          background: "#1e1e1e", color: "#d4d4d4", padding: 12, borderRadius: 6,
          fontFamily: "'JetBrains Mono', Consolas, Monaco, 'Courier New', monospace", fontSize: 12,
          maxHeight: 320, overflowY: "auto", minHeight: 80,
        }}>
          {filteredLogs.length === 0 ? (
            <Text style={{ color: "#888" }}>等待任务执行日志...</Text>
          ) : (
            filteredLogs.map((log, i) => {
              const levelColor = log.level === "WARN" ? "#faad14"
                : log.level === "ERROR" ? "#ff4d4f"
                : log.level === "DEBUG" ? "#888" : "#d4d4d4";
              return (
                <div key={i} style={{ color: levelColor, lineHeight: 1.6 }}>
                  <span style={{ color: "#888" }}>[{log.time}]</span>{" "}
                  <span style={{ color: levelColor }}>[{log.level}]</span>{" "}
                  {log.text}
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
