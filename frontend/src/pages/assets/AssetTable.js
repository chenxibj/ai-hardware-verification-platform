/**
 * @file AssetTable.js
 * @description 资产列表表格 — 含列定义、操作按钮
 */
import React from "react";
import { Table, Tag, Space, Button, Badge, Tooltip, Typography } from "antd";
import { EyeOutlined, DownloadOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { getTypeInfo, formatFileSize, parseTags } from "./constants";

const { Text } = Typography;

export default function AssetTable({ assets, loading, onView, onDownload, onDelete }) {
  const columns = [
    {
      title: "名称", dataIndex: "name", key: "name", ellipsis: true, width: 220,
      render: (v, r) => {
        const info = getTypeInfo(r.assetType);
        return (
          <Space size={6}>
            <span style={{ color: info.color !== "default" ? undefined : "#999" }}>{info.icon}</span>
            <Button type="link" style={{ padding: 0 }} onClick={() => onView(r.id)}>{v}</Button>
          </Space>
        );
      },
    },
    {
      title: "类型", dataIndex: "assetType", key: "assetType", width: 100,
      render: (v) => { const info = getTypeInfo(v); return <Tag color={info.color}>{info.label}</Tag>; },
    },
    {
      title: "版本", dataIndex: "version", key: "version", width: 80,
      render: (v) => v ? <Tag color="blue">v{v}</Tag> : "-",
    },
    {
      title: "标签", key: "tags", width: 180,
      render: (_, r) => {
        const tags = parseTags(r.tags);
        if (tags.length === 0) return <Text type="secondary">-</Text>;
        return (
          <Space size={2} wrap>
            {tags.slice(0, 2).map((t, i) => (
              <Tag key={i} style={{ fontSize: 11 }}>{String(t).trim()}</Tag>
            ))}
            {tags.length > 2 && <Tag>+{tags.length - 2}</Tag>}
          </Space>
        );
      },
    },
    {
      title: "格式", dataIndex: "fileFormat", key: "fileFormat", width: 70,
      render: (v) => v ? <Tag>{v}</Tag> : "-",
    },
    {
      title: "大小", dataIndex: "fileSize", key: "fileSize", width: 90,
      render: (v) => formatFileSize(v),
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 70,
      render: (v) => {
        const map = { ACTIVE: ["success", "可用"], DELETED: ["error", "已删除"], ARCHIVED: ["default", "归档"] };
        const [status, text] = map[v] || ["default", v];
        return <Badge status={status} text={text} />;
      },
    },
    {
      title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 140,
      render: (v) => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-",
    },
    {
      title: "操作", key: "action", width: 180, fixed: "right",
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="详情">
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onView(r.id)} />
          </Tooltip>
          <Tooltip title="下载">
            <Button type="link" size="small" icon={<DownloadOutlined />}
              onClick={() => onDownload(r)} disabled={!r.filePath} />
          </Tooltip>
          <Tooltip title="删除">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}
              onClick={() => onDelete(r.id, r.name)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={assets}
      rowKey="id"
      loading={loading}
      scroll={{ x: 1200 }}
      size="small"
      pagination={{
        pageSize: 15, showSizeChanger: true,
        pageSizeOptions: ["10", "15", "30", "50"],
        showTotal: (total) => `共 ${total} 条`,
        showQuickJumper: true,
      }}
    />
  );
}
