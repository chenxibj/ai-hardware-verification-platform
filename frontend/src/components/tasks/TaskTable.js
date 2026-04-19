/**
 * @file TaskTable.js
 * @description 评测任务表格组件 — 搜索/筛选/操作/失败原因显示
 * @fix #303 任务失败原因摘要显示
 * @feat #519 卡顿任务橙色告警 + 重试/取消快捷按钮
 * @feat #520 排队任务显示排队位置徽标
 */
import React from "react";
import {
  Card, Table, Tag, Space, Button, Input, Select, Tooltip, Typography,
  Badge, Popover, Dropdown, Popconfirm, Alert,
} from "antd";
import {
  SearchOutlined, PlusOutlined, ReloadOutlined,
  EyeOutlined, CopyOutlined, CloseCircleOutlined,
  RedoOutlined, DeleteOutlined, BugOutlined,
  ExclamationCircleOutlined, MoreOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

const { Text } = Typography;

const STATUS_MAP = {
  PENDING: { text: "等待中", color: "default", badge: "default" },
  QUEUED: { text: "排队中", color: "gold", badge: "warning" },
  DISPATCHED: { text: "已分发", color: "cyan", badge: "processing" },
  RUNNING: { text: "执行中", color: "processing", badge: "processing" },
  COMPLETED: { text: "已完成", color: "success", badge: "success" },
  FAILED: { text: "失败", color: "error", badge: "error" },
  CANCELLED: { text: "已取消", color: "default", badge: "default" },
  TIMEOUT: { text: "超时", color: "warning", badge: "warning" },
  SKIPPED: { text: "已跳过", color: "default", badge: "default" },
};

const PRIORITY_MAP = {
  LOW: { text: "低", color: "default" },
  MEDIUM: { text: "中", color: "blue" },
  HIGH: { text: "高", color: "orange" },
  CRITICAL: { text: "紧急", color: "red" },
};


/** #524: Failure type labels */
const FAILURE_TYPE_MAP = {
  TIMEOUT_NOT_STARTED: { text: "未启动超时", color: "#d48806" },
  TIMEOUT_IN_PROGRESS: { text: "执行中超时", color: "#cf1322" },
  AGENT_ERROR: { text: "Agent 错误", color: "#f5222d" },
  EVAL_FAILED: { text: "评测失败", color: "#722ed1" },
};

/** #303: 截取失败原因摘要 */
function ErrorSummary({ errorMessage }) {
  if (!errorMessage) return null;
  const summary = errorMessage.length > 60
    ? errorMessage.substring(0, 60) + "..."
    : errorMessage;
  return (
    <Popover
      content={
        <div style={{ maxWidth: 400, maxHeight: 200, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 12 }}>
          {errorMessage}
        </div>
      }
      title="错误详情"
      trigger="click"
    >
      <Tooltip title="点击查看完整错误信息">
        <Text type="danger" style={{ fontSize: 12, cursor: "pointer" }}>
          <ExclamationCircleOutlined /> {summary}
        </Text>
      </Tooltip>
    </Popover>
  );
}

export default function TaskTable({
  tasks, loading,
  selectedKeys, setSelectedKeys,
  searchText, setSearchText,
  statusFilter, setStatusFilter,
  onRefresh, onCreateOpen, onShowDetail,
  onClone, onCancel, onRetry, onDelete,
  onBatchCancel, onBatchDelete,
  onDebug,
}) {
  const columns = [
    {
      title: "任务编号", dataIndex: "taskNo", key: "taskNo", width: 140, ellipsis: true,
      render: (v, r) => (
        <Button type="link" size="small" onClick={() => onShowDetail(r)} style={{ padding: 0 }}>
          {v || `#${r.id}`}
        </Button>
      ),
    },
    {
      title: "任务名称", dataIndex: "name", key: "name", width: 200, ellipsis: true,
      render: (v) => v || "-",
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 120,
      render: (v, r) => {
        const info = STATUS_MAP[v] || { text: v, color: "default" };
        return (
          <Space direction="vertical" size={0}>
            <Space size={4}>
              <Badge status={info.badge || "default"} text={info.text} />
              {/* #519: 卡顿任务显示橙色告警图标 */}
              {r.isStalled && (
                <Tooltip title={r.warningMessage || "任务可能已卡顿"}>
                  <WarningOutlined style={{ color: "#fa8c16", fontSize: 14 }} />
                </Tooltip>
              )}
            </Space>
            {/* #519: 卡顿告警提示文字 */}
            {r.isStalled && r.warningMessage && (
              <Text type="warning" style={{ fontSize: 11 }}>
                <WarningOutlined /> {r.warningMessage}
              </Text>
            )}
            {/* #303: 失败任务显示错误原因摘要 */}
            {(v === "FAILED" || v === "TIMEOUT") && r.errorMessage && (
              <ErrorSummary errorMessage={r.errorMessage} />
            )}
            {/* #524: Failure type label */}
            {(v === "FAILED" || v === "TIMEOUT") && r.failureType && FAILURE_TYPE_MAP[r.failureType] && (
              <Tag color={FAILURE_TYPE_MAP[r.failureType].color} style={{ fontSize: 11, marginTop: 2 }}>
                {FAILURE_TYPE_MAP[r.failureType].text}
              </Tag>
            )}
            {/* #520: 排队中任务显示排队位置徽章 + 排队原因 */}
            {v === "QUEUED" && (
              <Tooltip
                title={
                  <div>
                    {r.queuePosition && <div>排队位置: 第 {r.queuePosition} 位</div>}
                    {r.estimatedWaitMinutes != null && <div>预估等待: {r.estimatedWaitMinutes} 分钟</div>}
                    {r.queueReason && <div>原因: {r.queueReason}</div>}
                  </div>
                }
              >
                <span>
                  {r.queuePosition && (
                    <Tag color="gold" style={{ fontSize: 11, marginLeft: 4 }}>
                      排队 #{r.queuePosition}
                    </Tag>
                  )}
                  {r.queueReason && (
                    <Text type="warning" style={{ fontSize: 12, cursor: "pointer" }}>
                      <ExclamationCircleOutlined style={{ marginLeft: 2 }} />
                    </Text>
                  )}
                </span>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: "优先级", dataIndex: "priority", key: "priority", width: 70,
      render: (v) => {
        const info = PRIORITY_MAP[v] || { text: v, color: "default" };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: "维度", dataIndex: "dimension", key: "dimension", width: 100,
      render: (v) => v ? <Tag>{v}</Tag> : "-",
    },
    {
      title: "测试项", dataIndex: "testItem", key: "testItem", width: 120, ellipsis: true,
      render: (v) => v || "-",
    },
    {
      title: "进度", dataIndex: "progress", key: "progress", width: 70,
      render: (v) => v != null ? `${v}%` : "-",
    },
    {
      title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 150,
      render: (v) => v ? dayjs(v).format("MM-DD HH:mm") : "-",
      sorter: (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0),
      defaultSortOrder: "descend",
    },
    {
      title: "操作", key: "action", width: 180, fixed: "right",
      render: (_, r) => {
        const items = [
          { key: "view", icon: <EyeOutlined />, label: "详情", onClick: () => onShowDetail(r) },
          { key: "clone", icon: <CopyOutlined />, label: "克隆", onClick: () => onClone(r.id) },
        ];
        /* #519: 卡顿任务提供重试和取消快捷按钮 */
        if (r.isStalled) {
          items.push({ key: "retry-stalled", icon: <RedoOutlined />, label: "重试(卡顿)", onClick: () => onRetry(r.id) });
          items.push({ key: "cancel-stalled", icon: <CloseCircleOutlined />, label: "取消(卡顿)", danger: true, onClick: () => onCancel(r.id) });
        }
        if (r.status === "PENDING" || r.status === "QUEUED" || r.status === "DISPATCHED" || r.status === "RUNNING") {
          items.push({ key: "cancel", icon: <CloseCircleOutlined />, label: "取消", danger: true, onClick: () => onCancel(r.id) });
        }
        if (r.status === "FAILED" || r.status === "TIMEOUT" || r.status === "CANCELLED") {
          items.push({ key: "retry", icon: <RedoOutlined />, label: "重试", onClick: () => onRetry(r.id) });
        }
        if (r.status !== "RUNNING") {
          items.push({ key: "delete", icon: <DeleteOutlined />, label: "删除", danger: true, onClick: () => onDelete(r.id) });
        }
        if (onDebug) {
          items.push({ key: "debug", icon: <BugOutlined />, label: "调试", onClick: () => onDebug(r.id) });
        }
        return (
          <Space size={4}>
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onShowDetail(r)}>详情</Button>
            {/* #519: 卡顿任务快捷重试按钮 */}
            {r.isStalled && (
              <Tooltip title="卡顿重试">
                <Button type="link" size="small" icon={<RedoOutlined />} style={{ color: "#fa8c16" }}
                  onClick={() => onRetry(r.id)} />
              </Tooltip>
            )}
            <Dropdown menu={{
              items: items.filter(i => i.key !== "view").map(i => ({
                key: i.key, icon: i.icon, label: i.label, danger: i.danger,
                onClick: i.onClick,
              })),
            }} trigger={["click"]}>
              <Button type="link" size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  const filteredTasks = tasks.filter(t => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (searchText) {
      const s = searchText.toLowerCase();
      return (t.name || "").toLowerCase().includes(s) ||
             (t.taskNo || "").toLowerCase().includes(s) ||
             (t.testItem || "").toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <Card
      title="评测任务列表"
      extra={
        <Space wrap>
          <Input
            placeholder="搜索任务..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 180 }}
            allowClear
          />
          <Select
            placeholder="状态筛选"
            allowClear
            value={statusFilter}
            onChange={v => setStatusFilter(v)}
            style={{ width: 120 }}
            options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.text }))}
          />
          <Button icon={<ReloadOutlined />} onClick={onRefresh}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreateOpen}>创建任务</Button>
        </Space>
      }
    >
      {selectedKeys.length > 0 && (
        <Space style={{ marginBottom: 16 }}>
          <Text>已选择 {selectedKeys.length} 项</Text>
          <Button size="small" onClick={onBatchCancel}>批量取消</Button>
          <Button size="small" danger onClick={onBatchDelete}>批量删除</Button>
        </Space>
      )}
      <Table
        columns={columns}
        dataSource={filteredTasks}
        rowKey="id"
        loading={loading}
        scroll={{ x: "max-content" }}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: setSelectedKeys,
        }}
        pagination={{
          pageSize: 15,
          showSizeChanger: true,
          pageSizeOptions: ["10", "15", "30", "50"],
          showTotal: (t) => `共 ${t} 条`,
        }}
      />
    </Card>
  );
}
