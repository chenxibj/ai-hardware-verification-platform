/**
 * @file TemplateTable.js
 * @description 模板列表表格
 * @param {Object} props
 * @param {Array}    props.templates - 全部模板
 * @param {boolean}  props.loading - 加载状态
 * @param {Function} props.onRefresh - 刷新
 * @param {Function} props.onCreate - 新建
 * @param {Function} props.onView - 查看详情
 * @param {Function} props.onEdit - 编辑
 * @param {Function} props.onClone - 克隆
 * @param {Function} props.onDelete - 删除
 */
import React from "react";
import {
  Card, Table, Tag, Space, Button, Tooltip, Popconfirm, Badge, Typography,
} from "antd";
import {
  AppstoreOutlined, PlusOutlined, ReloadOutlined,
  EyeOutlined, EditOutlined, DeleteOutlined, CopyOutlined,
} from "@ant-design/icons";
import {
  EVAL_TYPES, EVAL_DIMENSIONS, DIMENSION_ICONS, parseConfig,
} from "./templateConstants";
import dayjs from "dayjs";

const { Text } = Typography;

export default function TemplateTable({
  templates, loading, onRefresh, onCreate,
  onView, onEdit, onClone, onDelete,
}) {
  const columns = [
    {
      title: "模板名称", dataIndex: "name", width: 260,
      render: (v, r) => (
        <Space>
          {DIMENSION_ICONS[parseConfig(r.configJson).evalDimension] || <AppstoreOutlined />}
          <span style={{ fontWeight: 500 }}>{v}</span>
          {r.isSystem && <Tag color="purple" style={{ fontSize: 11 }}>📦 系统预置</Tag>}
        </Space>
      ),
    },
    { title: "评测类型", dataIndex: "evalType", width: 110, render: v => <Tag color="blue">{EVAL_TYPES[v] || v}</Tag> },
    {
      title: "评测维度", key: "dimension", width: 110,
      render: (_, r) => {
        const d = parseConfig(r.configJson).evalDimension;
        return d ? <Tag>{EVAL_DIMENSIONS[d] || d}</Tag> : <Text type="secondary">-</Text>;
      },
    },
    { title: "描述", dataIndex: "description", ellipsis: true },
    {
      title: "评测项数", key: "evalItemCount", width: 100, align: "center",
      render: (_, r) => {
        const config = parseConfig(r.configJson);
        const total = (config.operators?.length || 0) + (config.models?.length || 0) + (config.training?.length || 0);
        return total > 0 ? <Text strong style={{ fontSize: 14, color: "#1890ff" }}>{total}</Text> : <Text type="secondary">-</Text>;
      },
    },
    {
      title: "配置预览", key: "config", width: 220,
      render: (_, r) => {
        const config = parseConfig(r.configJson);
        const parts = [];
        if (config.operators?.length) parts.push(`${config.operators.length} 算子`);
        if (config.models?.length) parts.push(`${config.models.length} 模型`);
        if (config.training?.length) parts.push(`${config.training.length} 训练`);
        if (parts.length > 0) return <Text type="secondary" style={{ fontSize: 12 }}>{parts.join(" · ")}</Text>;
        return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>;
      },
    },
    { title: "创建时间", dataIndex: "createdAt", width: 140, render: v => v ? dayjs(v).format("MM-DD HH:mm") : "-" },
    {
      title: "操作", key: "action", width: 180,
      render: (_, r) => (
        <Space size={2}>
          <Tooltip title="查看详情"><Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onView(r)} /></Tooltip>
          <Tooltip title="克隆"><Button type="link" size="small" icon={<CopyOutlined />} onClick={() => onClone(r)} /></Tooltip>
          {!r.isSystem && (
            <>
              <Tooltip title="编辑"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => onEdit(r)} /></Tooltip>
              <Popconfirm title="确定删除该模板？" okText="删除" okType="danger" cancelText="取消" onConfirm={() => onDelete(r.id)}>
                <Tooltip title="删除"><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Tooltip>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <span>
          <AppstoreOutlined style={{ marginRight: 8 }} />全部模板
          <Badge count={templates.length} style={{ backgroundColor: "#1890ff", marginLeft: 8 }} />
        </span>
      }
      extra={
        <Space>
          <Button onClick={onRefresh} icon={<ReloadOutlined />}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>新建模板</Button>
        </Space>
      }
    >
      <Table columns={columns} dataSource={templates} rowKey="id" loading={loading}
        pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", "20", "50"], showTotal: total => `共 ${total} 条` }}
        scroll={{ x: "max-content" }} />
    </Card>
  );
}
