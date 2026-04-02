/**
 * @file TaskTable.js
 * @description 任务列表表格组件
 * @param {Object} props
 * @param {Array}    props.tasks - 任务列表
 * @param {boolean}  props.loading - 加载状态
 * @param {Array}    props.selectedKeys - 已选行 key
 * @param {Function} props.setSelectedKeys - 设置已选行
 * @param {string}   props.searchText - 搜索文本
 * @param {Function} props.setSearchText - 设置搜索文本
 * @param {string}   props.statusFilter - 状态筛选
 * @param {Function} props.setStatusFilter - 设置状态筛选
 * @param {Function} props.onRefresh - 刷新回调
 * @param {Function} props.onCreateOpen - 打开创建弹窗
 * @param {Function} props.onShowDetail - 展示详情
 * @param {Function} props.onClone - 克隆任务
 * @param {Function} props.onCancel - 取消任务
 * @param {Function} props.onRetry - 重试任务
 * @param {Function} props.onDelete - 删除任务
 * @param {Function} props.onBatchCancel - 批量取消
 * @param {Function} props.onBatchDelete - 批量删除
 */
import React from "react";
import {
  Card, Table, Tag, Space, Button, Badge, Progress, Input, Select,
} from "antd";
import {
  PlusOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined,
  CopyOutlined, StopOutlined, RedoOutlined, SearchOutlined,
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
}) {
  const columns = [
    { title: "任务编号", dataIndex: "taskNo", width: 140, ellipsis: true, fixed: "left" },
    {
      title: "名称", dataIndex: "name", ellipsis: true, width: 260,
      render: (v, r) => (
        <span>
          {v} {isPreset(r) && <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>📦 系统预置</Tag>}
        </span>
      ),
    },
    { title: "评测类型", dataIndex: "evalType", width: 100, render: v => <Tag color="blue">{EVAL_TYPES[v] || v}</Tag> },
    { title: "优先级", dataIndex: "priority", width: 70, render: v => <Tag color={PRIORITY_COLORS[v]}>{PRIORITIES[v] || v}</Tag> },
    { title: "状态", dataIndex: "status", width: 90, render: v => <Badge status={STATUS_COLORS[v]} text={STATUS_MAP[v] || v} /> },
    {
      title: "进度", dataIndex: "progress", width: 120,
      render: v => <Progress percent={v || 0} size="small" strokeColor={v >= 100 ? "#52c41a" : v >= 50 ? "#1890ff" : "#faad14"} />,
    },
    {
      title: "创建时间", dataIndex: "createdAt", width: 140,
      render: v => v ? dayjs(v).format("MM-DD HH:mm") : "-",
      sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    },
    {
      title: "操作", key: "action", width: 220, fixed: "right",
      render: (_, r) => (
        <Space size={2}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onShowDetail(r)}>详情</Button>
          <Button type="link" size="small" icon={<CopyOutlined />} onClick={() => onClone(r.id)}>克隆</Button>
          {(r.status === "PENDING" || r.status === "QUEUED" || r.status === "RUNNING") &&
            <Button type="link" size="small" danger icon={<StopOutlined />} onClick={() => onCancel(r.id)}>取消</Button>}
          {r.status === "FAILED" &&
            <Button type="link" size="small" icon={<RedoOutlined />} onClick={() => onRetry(r.id)}>重试</Button>}
          {!isPreset(r) &&
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(r.id)}>删除</Button>}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <span>
          评测任务 {selectedKeys.length > 0 && <Tag color="blue">已选 {selectedKeys.length} 项</Tag>}
        </span>
      }
      extra={
        <Space>
          <Input placeholder="搜索任务" prefix={<SearchOutlined />} value={searchText}
            onChange={e => setSearchText(e.target.value)} onPressEnter={onRefresh}
            style={{ width: 160 }} allowClear />
          <Select placeholder="状态筛选" allowClear style={{ width: 110 }} value={statusFilter}
            onChange={setStatusFilter}
            options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v }))} />
          <Button onClick={onRefresh} icon={<ReloadOutlined />}>刷新</Button>
          {selectedKeys.length > 0 && (
            <>
              <Button danger onClick={onBatchCancel}>批量取消</Button>
              <Button danger type="primary" onClick={onBatchDelete}>批量删除</Button>
            </>
          )}
          <Button type="primary" icon={<PlusOutlined />} size="large" onClick={onCreateOpen}>
            创建评测任务
          </Button>
        </Space>
      }
    >
      <Table
        columns={columns} dataSource={tasks} rowKey="id" loading={loading}
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 15, showTotal: t => "共 " + t + " 条", showSizeChanger: true }}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
      />
    </Card>
  );
}
