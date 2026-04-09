/**
 * @file VersionHistoryTab.js
 * @description 版本历史 Tab — 版本列表 + 锁定/回滚/下载操作
 *
 * 后端尚无独立 asset_versions 表，此处基于 asset.version 字段构建单条记录。
 * 后端 API 就绪后切换为真实版本列表。
 */
import React from "react";
import { Table, Tag, Space, Button, Tooltip, Typography } from "antd";
import {
  DownloadOutlined, LockOutlined, UnlockOutlined,
  RollbackOutlined, CloudUploadOutlined, InfoCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { formatFileSize } from "./constants";

const { Text } = Typography;

export default function VersionHistoryTab({ asset, onDownload }) {
  const versionHistory = [
    {
      key: "current",
      version: asset.version || "1.0.0",
      note: "当前版本",
      fileSize: asset.fileSize,
      status: "current",
      createdAt: asset.updatedAt || asset.createdAt,
      isLocked: false,
    },
  ];

  const columns = [
    { title: "版本号", dataIndex: "version", key: "version", width: 100,
      render: (v) => <Tag color="blue">v{v}</Tag> },
    { title: "版本说明", dataIndex: "note", key: "note", ellipsis: true },
    { title: "文件大小", dataIndex: "fileSize", key: "fileSize", width: 100,
      render: (v) => formatFileSize(v) },
    { title: "状态", dataIndex: "status", key: "status", width: 80,
      render: (v, r) => r.isLocked
        ? <Tag icon={<LockOutlined />} color="orange">锁定</Tag>
        : v === "current" ? <Tag color="green">当前</Tag> : <Tag>历史</Tag> },
    { title: "时间", dataIndex: "createdAt", key: "createdAt", width: 160,
      render: (v) => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-" },
    { title: "操作", key: "action", width: 200,
      render: (_, r) => (
        <Space>
          <Tooltip title="下载">
            <Button type="link" size="small" icon={<DownloadOutlined />}
              onClick={onDownload} disabled={!asset.filePath} />
          </Tooltip>
          {r.status !== "current" && (
            <Tooltip title="回滚到此版本">
              <Button type="link" size="small" icon={<RollbackOutlined />} disabled />
            </Tooltip>
          )}
          <Tooltip title={r.isLocked ? "解锁" : "锁定"}>
            <Button type="link" size="small"
              icon={r.isLocked ? <UnlockOutlined /> : <LockOutlined />} disabled />
          </Tooltip>
        </Space>
      ) },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text type="secondary">共 {versionHistory.length} 个版本</Text>
        <Button type="primary" icon={<CloudUploadOutlined />} disabled>上传新版本</Button>
      </div>
      <Table columns={columns} dataSource={versionHistory} rowKey="key" pagination={false} size="small" />
      <div style={{ marginTop: 12, color: "#999", fontSize: 12 }}>
        <InfoCircleOutlined /> 版本管理功能将在后端 API 支持后完整启用（三段式 semver）
      </div>
    </div>
  );
}
