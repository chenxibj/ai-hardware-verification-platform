/**
 * @file PlanList.js
 * @description 评测计划列表 — 统计卡片 + 筛选表格 + 详情抽屉 + 操作
 * Issue: #132
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Button, Select, Tag, Badge, Space, Statistic, Row, Col,
  message, Popconfirm, Drawer, Descriptions, Tooltip, Typography, Progress,
} from "antd";
import {
  ReloadOutlined, EyeOutlined, DeleteOutlined, PlayCircleOutlined,
  PauseCircleOutlined, StopOutlined, PlusOutlined,
  FileTextOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import api from "../utils/api";

const { Option } = Select;
const { Text } = Typography;

/* ── 状态映射 ── */
const PLAN_STATUS_MAP = {
  DRAFT:     { text: "草稿",   color: "default",    badge: "default",    icon: <FileTextOutlined /> },
  RUNNING:   { text: "运行中", color: "processing",  badge: "processing", icon: <PlayCircleOutlined /> },
  PAUSED:    { text: "已暂停", color: "warning",     badge: "warning",    icon: <PauseCircleOutlined /> },
  COMPLETED: { text: "已完成", color: "success",     badge: "success",    icon: <CheckCircleOutlined /> },
  FAILED:    { text: "失败",   color: "error",       badge: "error",      icon: <CloseCircleOutlined /> },
  CANCELLED: { text: "已取消", color: "default",     badge: "default",    icon: <StopOutlined /> },
};

const CHIP_TYPE_COLORS = { GPU: "blue", NPU: "green", TPU: "purple", CPU: "orange", OTHER: "default" };

/* ── 进度模拟（后端暂无 progress 字段，根据状态给默认值） ── */
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

export default function PlanList({ onOpenMonitor, onCreatePlan }) {

  /* 列表 state */
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState(undefined);
  const [chipFilter, setChipFilter] = useState(undefined);

  /* 统计 */
  const [stats, setStats] = useState({ total: 0, running: 0, completed: 0, failed: 0 });

  /* 芯片列表（筛选用） */
  const [chips, setChips] = useState([]);

  /* 详情抽屉 */
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);

  /* ── API: 获取计划列表 ── */
  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, size: pageSize };
      if (statusFilter) params.status = statusFilter;
      if (chipFilter) params.chipId = chipFilter;
      const { data: resp } = await api.get("/plans", { params });
      if (resp.code === 0) {
        const planList = resp.data || [];
        setPlans(planList);
        setTotal(resp.total || 0);
        // Stats loaded separately via /api/plans/stats
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, chipFilter]);

  /* ── Bug #199: 从后端统计 API 获取（替代4次API调用） ── */
  const fetchStats = useCallback(async () => {
    try {
      const { data: resp } = await api.get("/plans/stats");
      if (resp.code === 0 && resp.data) {
        setStats({
          total:     resp.data.total     || 0,
          running:   resp.data.running   || 0,
          completed: resp.data.completed || 0,
          failed:    resp.data.failed    || 0,
        });
      }
    } catch (_) { /* 统计失败不阻塞 */ }
  }, []);

  /* ── API: 芯片列表 ── */
  const fetchChips = useCallback(async () => {
    try {
      const { data: resp } = await api.get("/chips", { params: { page: 0, size: 100 } });
      if (resp.code === 0) setChips(resp.data || []);
    } catch (_) {}
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);
  useEffect(() => { fetchStats(); fetchChips(); }, [fetchStats, fetchChips]);

  /* ── 操作 ── */
  const handleAction = async (id, action, label) => {
    try {
      await api.put(`/plans/${id}/${action}`);
      message.success(`${label}成功`);
      fetchPlans();
      fetchStats();
    } catch (e) {
      message.error(`${label}失败: ` + (e.response?.data?.message || e.message));
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/plans/${id}`);
      message.success("删除成功");
      fetchPlans();
    } catch (e) {
      message.error("删除失败: " + (e.response?.data?.message || e.message));
    }
  };

  /* ── 详情 ── */
  const openDetail = (record) => {
    setDetailRecord(record);
    setDetailVisible(true);
  };

  /* ── 解析 JSON ── */
  const safeParse = (str) => { try { return JSON.parse(str || "{}"); } catch (_) { return {}; } };

  /* ── 获取芯片名称 ── */
  const getChipName = (record) => {
    if (record.chipName) return record.chipName;
    if (record.chip?.name) return record.chip.name;
    const chip = chips.find((c) => c.id === record.chipId);
    return chip ? chip.name : `#${record.chipId || "-"}`;
  };

  const getChipType = (record) => {
    if (record.chipType) return record.chipType;
    if (record.chip?.chipType) return record.chip.chipType;
    const chip = chips.find((c) => c.id === record.chipId);
    return chip ? chip.chipType : null;
  };

  /* ── 表格列 ── */
  const columns = [
    {
      title: "计划编号", dataIndex: "planNo", key: "planNo", width: 180,
      render: (v, record) => (
        <Text copyable={{ text: v || `PLAN-${record.id}` }} style={{ fontSize: 13 }}>
          {v || `PLAN-${record.id}`}
        </Text>
      ),
    },
    {
      title: "名称", dataIndex: "name", key: "name", width: 220, ellipsis: true,
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: "关联芯片", key: "chip", width: 150,
      render: (_, record) => {
        const chipType = getChipType(record);
        return (
          <Space>
            <Link to="/chips" style={{ color: "#1890ff" }}>{getChipName(record)}</Link>
            {chipType && <Tag color={CHIP_TYPE_COLORS[chipType]} style={{ marginLeft: 0 }}>{chipType}</Tag>}
          </Space>
        );
      },
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 110,
      render: (v) => {
        const s = PLAN_STATUS_MAP[v] || { text: v, badge: "default" };
        return <Badge status={s.badge} text={s.text} />;
      },
    },
    {
      title: "进度", key: "progress", width: 160,
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
      title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 170,
      render: (v) => v ? new Date(v).toLocaleString("zh-CN") : "-",
    },
    {
      title: "操作", key: "actions", width: 220, fixed: "right",
      render: (_, record) => {
        const st = record.status;
        return (
          <Space size="small">
            <Tooltip title="执行监控">
              <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onOpenMonitor ? onOpenMonitor(record.id) : openDetail(record)} />
            </Tooltip>

            {st === "DRAFT" && (
              <Tooltip title="启动执行">
                <Button type="link" size="small" icon={<PlayCircleOutlined />}
                  style={{ color: "#52c41a" }}
                  onClick={() => handleAction(record.id, "start", "启动")} />
              </Tooltip>
            )}

            {st === "RUNNING" && (
              <Tooltip title="暂停">
                <Button type="link" size="small" icon={<PauseCircleOutlined />}
                  style={{ color: "#faad14" }}
                  onClick={() => handleAction(record.id, "pause", "暂停")} />
              </Tooltip>
            )}

            {st === "PAUSED" && (
              <Tooltip title="恢复执行">
                <Button type="link" size="small" icon={<PlayCircleOutlined />}
                  style={{ color: "#52c41a" }}
                  onClick={() => handleAction(record.id, "resume", "恢复")} />
              </Tooltip>
            )}

            {(st === "RUNNING" || st === "PAUSED") && (
              <Popconfirm title="确定取消该计划?" onConfirm={() => handleAction(record.id, "cancel", "取消")} okText="确定" cancelText="取消">
                <Tooltip title="取消">
                  <Button type="link" size="small" icon={<StopOutlined />} style={{ color: "#ff4d4f" }} />
                </Tooltip>
              </Popconfirm>
            )}

            {(st === "DRAFT" || st === "COMPLETED" || st === "FAILED" || st === "CANCELLED") && (
              <Popconfirm title="确定删除该计划?" onConfirm={() => handleDelete(record.id)} okText="删除" cancelText="取消">
                <Tooltip title="删除">
                  <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  /* ── 渲染 ── */
  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card hoverable>
            <Statistic title="计划总数" value={stats.total} prefix={<FileTextOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable>
            <Statistic title="运行中" value={stats.running} valueStyle={{ color: "#1890ff" }} prefix={<PlayCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable>
            <Statistic title="已完成" value={stats.completed} valueStyle={{ color: "#52c41a" }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable>
            <Statistic title="失败" value={stats.failed} valueStyle={{ color: "#ff4d4f" }} prefix={<ExclamationCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      {/* 工具栏 + 表格 */}
      <Card
        title="评测计划列表"
        extra={
          <Space>
            <Select
              placeholder="按芯片筛选" allowClear style={{ width: 160 }}
              value={chipFilter} onChange={(v) => { setChipFilter(v); setPage(0); }}
            >
              {chips.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
            </Select>
            <Select
              placeholder="按状态筛选" allowClear style={{ width: 140 }}
              value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(0); }}
            >
              {Object.entries(PLAN_STATUS_MAP).map(([k, v]) => <Option key={k} value={k}>{v.text}</Option>)}
            </Select>
            <Button icon={<ReloadOutlined />} onClick={() => { fetchPlans(); }}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => onCreatePlan && onCreatePlan()}>创建计划</Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={plans}
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{
            current: page + 1,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => { setPage(p - 1); setPageSize(ps); },
          }}
        />
      </Card>

      {/* 详情抽屉 */}
      <Drawer
        title={detailRecord ? `计划详情 — ${detailRecord.name}` : "计划详情"}
        open={detailVisible}
        onClose={() => setDetailVisible(false)}
        width={560}
      >
        {detailRecord && (() => {
          const config = safeParse(detailRecord.evalConfig);
          const st = PLAN_STATUS_MAP[detailRecord.status] || { text: detailRecord.status, badge: "default" };
          return (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="计划编号">
                {detailRecord.planNo || `PLAN-${detailRecord.id}`}
              </Descriptions.Item>
              <Descriptions.Item label="计划名称">{detailRecord.name}</Descriptions.Item>
              <Descriptions.Item label="关联芯片">
                <Link to="/chips">{getChipName(detailRecord)}</Link>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Badge status={st.badge} text={st.text} />
              </Descriptions.Item>
              <Descriptions.Item label="进度">
                <Progress percent={getProgress(detailRecord)} size="small" status={getProgressStatus(detailRecord.status)} />
              </Descriptions.Item>
              <Descriptions.Item label="评测方案">
                {config.preset || "-"} — {config.description || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="评测配置">
                <Text code style={{ fontSize: 12 }}>{detailRecord.evalConfig || "-"}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {detailRecord.createdAt ? new Date(detailRecord.createdAt).toLocaleString("zh-CN") : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {detailRecord.updatedAt ? new Date(detailRecord.updatedAt).toLocaleString("zh-CN") : "-"}
              </Descriptions.Item>
            </Descriptions>
          );
        })()}
      </Drawer>
    </div>
  );
}
