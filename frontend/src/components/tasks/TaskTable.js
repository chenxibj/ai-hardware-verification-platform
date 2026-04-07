/**
 * @file TaskTable.js
 * @description 任务列表表格组件
 * #227 - 克隆按钮 | #228 - 失败任务调试按钮
 */
import React from "react";
import {
  Card, Table, Tag, Space, Button, Badge, Progress, Input, Select,
} from "antd";
import {
  PlusOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined,
  CopyOutlined, StopOutlined, RedoOutlined, SearchOutlined,
  BugOutlined,
} from "@ant-design/icons";
import {
  EVAL_TYPES, PRIORITIES, PRIORITY_COLORS, STATUS_MAP, STATUS_COLORS,
} from "./taskConstants";
import dayjs from "dayjs";

const isPreset = (record) =>
  record.tags && record.tags.includes("SYSTEM_PRESET");

export default function TaskTable({
  tasks, loading, selectedKeys, setSelectedKeys,
  searchText, setSearchText, statusFilter, setStatusFilter,
  onRefresh, onCreateOpen, onShowDetail,
  onClone, onCancel, onRetry, onDelete,
  onBatchCancel, onBatchDelete,
  onDebug,
}) {
  const columns = [
    { title: "\u4EFB\u52A1\u7F16\u53F7", dataIndex: "taskNo", width: 140, ellipsis: true, fixed: "left" },
    {
      title: "\u540D\u79F0", dataIndex: "name", ellipsis: true, width: 260,
      render: (v, r) => (
        <span>
          {v} {isPreset(r) && <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>{"\uD83D\uDCE6 \u7CFB\u7EDF\u9884\u7F6E"}</Tag>}
        </span>
      ),
    },
    { title: "\u8BC4\u6D4B\u7C7B\u578B", dataIndex: "evalType", width: 100, render: v => <Tag color="blue">{EVAL_TYPES[v] || v}</Tag> },
    { title: "\u4F18\u5148\u7EA7", dataIndex: "priority", width: 70, render: v => <Tag color={PRIORITY_COLORS[v]}>{PRIORITIES[v] || v}</Tag> },
    { title: "\u72B6\u6001", dataIndex: "status", width: 90, render: v => <Badge status={STATUS_COLORS[v]} text={STATUS_MAP[v] || v} /> },
    {
      title: "\u8FDB\u5EA6", dataIndex: "progress", width: 120,
      render: v => <Progress percent={v || 0} size="small" strokeColor={v >= 100 ? "#52c41a" : v >= 50 ? "#1890ff" : "#faad14"} />,
    },
    {
      title: "\u521B\u5EFA\u65F6\u95F4", dataIndex: "createdAt", width: 140,
      render: v => v ? dayjs(v).format("MM-DD HH:mm") : "-",
      sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    },
    {
      title: "\u64CD\u4F5C", key: "action", width: 260, fixed: "right",
      render: (_, r) => (
        <Space size={2}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onShowDetail(r)}>{"\u8BE6\u60C5"}</Button>
          <Button type="link" size="small" icon={<CopyOutlined />} onClick={() => onClone(r.id)}>{"\u514B\u9686"}</Button>
          {r.status === "FAILED" && onDebug &&
            <Button type="link" size="small" danger icon={<BugOutlined />} onClick={() => onDebug(r.id)}>{"\u8C03\u8BD5"}</Button>}
          {(r.status === "PENDING" || r.status === "QUEUED" || r.status === "RUNNING") &&
            <Button type="link" size="small" danger icon={<StopOutlined />} onClick={() => onCancel(r.id)}>{"\u53D6\u6D88"}</Button>}
          {r.status === "FAILED" &&
            <Button type="link" size="small" icon={<RedoOutlined />} onClick={() => onRetry(r.id)}>{"\u91CD\u8BD5"}</Button>}
          {!isPreset(r) &&
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(r.id)}>{"\u5220\u9664"}</Button>}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <span>
          {"\u8BC4\u6D4B\u4EFB\u52A1"} {selectedKeys.length > 0 && <Tag color="blue">{"\u5DF2\u9009 " + selectedKeys.length + " \u9879"}</Tag>}
        </span>
      }
      extra={
        <Space>
          <Input placeholder={"\u641C\u7D22\u4EFB\u52A1"} prefix={<SearchOutlined />} value={searchText}
            onChange={e => setSearchText(e.target.value)} onPressEnter={onRefresh}
            style={{ width: 160 }} allowClear />
          <Select placeholder={"\u72B6\u6001\u7B5B\u9009"} allowClear style={{ width: 110 }} value={statusFilter}
            onChange={setStatusFilter}
            options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v }))} />
          <Button onClick={onRefresh} icon={<ReloadOutlined />}>{"\u5237\u65B0"}</Button>
          {selectedKeys.length > 0 && (
            <>
              <Button danger onClick={onBatchCancel}>{"\u6279\u91CF\u53D6\u6D88"}</Button>
              <Button danger type="primary" onClick={onBatchDelete}>{"\u6279\u91CF\u5220\u9664"}</Button>
            </>
          )}
          <Button type="primary" icon={<PlusOutlined />} size="large" onClick={onCreateOpen}>
            {"\u521B\u5EFA\u8BC4\u6D4B\u4EFB\u52A1"}
          </Button>
        </Space>
      }
    >
      <Table
        columns={columns} dataSource={tasks} rowKey="id" loading={loading}
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 15, showTotal: t => "\u5171 " + t + " \u6761", showSizeChanger: true }}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
      />
    </Card>
  );
}
