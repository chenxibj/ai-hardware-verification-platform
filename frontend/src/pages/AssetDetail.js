/**
 * @file AssetDetail.js
 * @description 数字资产详情页 — 基本信息 + 版本历史 + 标签管理
 * @feat #264 前端资产管理页面
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Descriptions, Tag, Space, Button, Table, Tabs, Input, message,
  Modal, Form, Timeline, Tooltip, Badge, Row, Col, Spin, Typography, Empty
} from "antd";
import {
  ArrowLeftOutlined, EditOutlined, DeleteOutlined, DownloadOutlined,
  LockOutlined, UnlockOutlined, RollbackOutlined, TagsOutlined,
  HistoryOutlined, CloudUploadOutlined, ExperimentOutlined,
  DatabaseOutlined, CodeOutlined, FileTextOutlined, PictureOutlined,
  FolderOutlined, InfoCircleOutlined, PlusOutlined, ShareAltOutlined
} from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";

const { Text, Title, Paragraph } = Typography;

const formatFileSize = (bytes) => {
  if (!bytes) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
};

const ASSET_TYPE_CONFIG = {
  MODEL: { label: "模型", icon: <ExperimentOutlined />, color: "#1890ff" },
  DATASET: { label: "数据集", icon: <DatabaseOutlined />, color: "#52c41a" },
  OPERATOR: { label: "算子", icon: <CodeOutlined />, color: "#fa8c16" },
  OPERATOR_SCRIPT: { label: "算子脚本", icon: <CodeOutlined />, color: "#fa8c16" },
  SCRIPT: { label: "脚本", icon: <FileTextOutlined />, color: "#722ed1" },
  EVAL_SCRIPT: { label: "评测脚本", icon: <FileTextOutlined />, color: "#eb2f96" },
  TEMPLATE: { label: "流程模板", icon: <FolderOutlined />, color: "#13c2c2" },
  IMAGE: { label: "镜像", icon: <PictureOutlined />, color: "#722ed1" },
};

const STATUS_MAP = {
  ACTIVE: { color: "success", text: "可用" },
  ARCHIVED: { color: "default", text: "已归档" },
  DELETED: { color: "error", text: "已删除" },
};

const parseTags = (tagsStr) => {
  if (!tagsStr) return [];
  try {
    const parsed = typeof tagsStr === "string" ? JSON.parse(tagsStr) : tagsStr;
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "object") {
      return Object.entries(parsed).map(([k, v]) => `${k}:${v}`);
    }
    return [];
  } catch { return typeof tagsStr === "string" ? tagsStr.split(",").filter(Boolean) : []; }
};

const parseMetadata = (metaStr) => {
  if (!metaStr) return {};
  try { return typeof metaStr === "string" ? JSON.parse(metaStr) : metaStr; } catch { return {}; }
};

export default function AssetDetail({ assetId, onBack }) {
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editVisible, setEditVisible] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [editForm] = Form.useForm();

  const fetchAsset = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      const res = await api.get(`/assets/${assetId}`);
      if (res.data.code === 0) setAsset(res.data.data);
    } catch (e) { message.error("获取资产详情失败"); }
    finally { setLoading(false); }
  }, [assetId]);

  useEffect(() => { fetchAsset(); }, [fetchAsset]);

  const handleDownload = async () => {
    if (!asset?.filePath) { message.warning("该资产没有关联文件"); return; }
    try {
      const res = await api.get(`/assets/${assetId}/download`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", asset.name || "download");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success("下载成功");
    } catch (e) { message.error("下载失败"); }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: "确定删除该资产？",
      content: `将删除「${asset?.name}」，此操作不可恢复。`,
      okText: "删除", okType: "danger", cancelText: "取消",
      onOk: async () => {
        try {
          await api.delete(`/assets/${assetId}`);
          message.success("已删除");
          onBack && onBack();
        } catch (e) { message.error("删除失败"); }
      },
    });
  };

  if (loading) return <Spin size="large" style={{ display: "flex", justifyContent: "center", marginTop: 100 }} />;
  if (!asset) return <Empty description="资产不存在" />;

  const tags = parseTags(asset.tags);
  const metadata = parseMetadata(asset.metadata);
  const typeConfig = ASSET_TYPE_CONFIG[asset.assetType] || { label: asset.assetType, icon: <FolderOutlined />, color: "#999" };
  const statusConfig = STATUS_MAP[asset.status] || { color: "default", text: asset.status };

  // Simulated version history (since backend doesn't have versions table yet)
  const versionHistory = [
    {
      key: "current",
      version: asset.version || "1.0.0",
      note: "当前版本",
      fileSize: asset.fileSize,
      status: "current",
      createdAt: asset.updatedAt || asset.createdAt,
      isLocked: false,
    }
  ];

  const versionColumns = [
    { title: "版本号", dataIndex: "version", key: "version", width: 100,
      render: (v) => <Tag color="blue">v{v}</Tag> },
    { title: "版本说明", dataIndex: "note", key: "note", ellipsis: true },
    { title: "文件大小", dataIndex: "fileSize", key: "fileSize", width: 100,
      render: v => formatFileSize(v) },
    { title: "状态", dataIndex: "status", key: "status", width: 80,
      render: (v, r) => r.isLocked ? <Tag icon={<LockOutlined />} color="orange">锁定</Tag> :
        v === "current" ? <Tag color="green">当前</Tag> : <Tag>历史</Tag> },
    { title: "时间", dataIndex: "createdAt", key: "createdAt", width: 160,
      render: v => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-" },
    { title: "操作", key: "action", width: 200,
      render: (_, r) => (
        <Space>
          <Tooltip title="下载"><Button type="link" size="small" icon={<DownloadOutlined />} onClick={handleDownload} disabled={!asset.filePath} /></Tooltip>
          {r.status !== "current" && <Tooltip title="回滚到此版本"><Button type="link" size="small" icon={<RollbackOutlined />} disabled /></Tooltip>}
          <Tooltip title={r.isLocked ? "解锁" : "锁定"}>
            <Button type="link" size="small" icon={r.isLocked ? <UnlockOutlined /> : <LockOutlined />} disabled />
          </Tooltip>
        </Space>
      ) },
  ];

  const tabItems = [
    {
      key: "versions",
      label: <span><HistoryOutlined /> 版本历史</span>,
      children: (
        <div>
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Text type="secondary">共 {versionHistory.length} 个版本</Text>
            <Button type="primary" icon={<CloudUploadOutlined />} disabled>上传新版本</Button>
          </div>
          <Table
            columns={versionColumns}
            dataSource={versionHistory}
            rowKey="key"
            pagination={false}
            size="small"
          />
          <div style={{ marginTop: 12, color: "#999", fontSize: 12 }}>
            <InfoCircleOutlined /> 版本管理功能将在后端 API 支持后完整启用（三段式 semver: v{"{major}.{minor}.{patch}"}）
          </div>
        </div>
      ),
    },
    {
      key: "tags",
      label: <span><TagsOutlined /> 标签</span>,
      children: (
        <div>
          <div style={{ marginBottom: 16 }}>
            {tags.length > 0 ? (
              <Space wrap size={[8, 8]}>
                {tags.map((t, i) => {
                  const isKV = typeof t === "string" && t.includes(":");
                  return (
                    <Tag key={i} closable={false} color={isKV ? "processing" : "default"}
                      style={{ padding: "4px 12px", fontSize: 13 }}>
                      {t}
                    </Tag>
                  );
                })}
              </Space>
            ) : (
              <Text type="secondary">暂无标签</Text>
            )}
          </div>
          <Space>
            <Input
              placeholder="添加标签（key:value 格式）"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              style={{ width: 260 }}
              onPressEnter={() => {
                if (tagInput.trim()) {
                  message.info("标签管理将在后端 API 支持后启用");
                  setTagInput("");
                }
              }}
            />
            <Button icon={<PlusOutlined />} disabled>添加</Button>
          </Space>
          <div style={{ marginTop: 12, color: "#999", fontSize: 12 }}>
            <InfoCircleOutlined /> 标签 CRUD 功能将在后端标签 API 就绪后启用
          </div>
        </div>
      ),
    },
    {
      key: "metadata",
      label: <span><InfoCircleOutlined /> 元信息</span>,
      children: (
        <div>
          {Object.keys(metadata).length > 0 ? (
            <Descriptions column={2} bordered size="small">
              {Object.entries(metadata).map(([k, v]) => (
                <Descriptions.Item key={k} label={k}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</Descriptions.Item>
              ))}
            </Descriptions>
          ) : (
            <Text type="secondary">暂无额外元信息</Text>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回列表</Button>
          <Title level={4} style={{ margin: 0 }}>
            <span style={{ color: typeConfig.color, marginRight: 8 }}>{typeConfig.icon}</span>
            {asset.name}
          </Title>
          <Badge status={statusConfig.color} text={statusConfig.text} />
        </Space>
        <Space>
          <Button icon={<EditOutlined />} onClick={() => { setEditVisible(true); editForm.setFieldsValue(asset); }}>编辑</Button>
          <Button icon={<ShareAltOutlined />} disabled>分享</Button>
          <Button icon={<DownloadOutlined />} onClick={handleDownload} disabled={!asset.filePath}>下载</Button>
          <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>删除</Button>
        </Space>
      </div>

      {/* Basic Info */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={{ xxl: 3, xl: 3, lg: 2, md: 2, sm: 1 }} bordered size="small">
          <Descriptions.Item label="资产编号">{asset.assetNo}</Descriptions.Item>
          <Descriptions.Item label="资产类型">
            <Tag color={typeConfig.color} icon={typeConfig.icon}>{typeConfig.label}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="当前版本">
            <Tag color="blue">v{asset.version || "1.0.0"}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="文件格式">
            {asset.fileFormat ? <Tag>{asset.fileFormat}</Tag> : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="文件大小">{formatFileSize(asset.fileSize)}</Descriptions.Item>
          <Descriptions.Item label="下载次数">{asset.downloadCount || 0} 次</Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {asset.createdAt ? dayjs(asset.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {asset.updatedAt ? dayjs(asset.updatedAt).format("YYYY-MM-DD HH:mm:ss") : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="来源">
            {asset.sourceUrl ? <a href={asset.sourceUrl} target="_blank" rel="noopener noreferrer">{asset.sourceUrl}</a> : "本地上传"}
          </Descriptions.Item>
          <Descriptions.Item label="描述" span={3}>
            <Paragraph style={{ margin: 0 }}>{asset.description || "暂无描述"}</Paragraph>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Tabs: Versions / Tags / Metadata */}
      <Card>
        <Tabs items={tabItems} defaultActiveKey="versions" />
      </Card>

      {/* Edit Modal */}
      <Modal title="编辑资产信息" open={editVisible} onCancel={() => setEditVisible(false)} footer={null} width={560}>
        <Form form={editForm} layout="vertical" onFinish={async (values) => {
          message.info("编辑功能将通过 PUT /api/assets/{id} 实现");
          setEditVisible(false);
        }}>
          <Form.Item name="name" label="资产名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>保存</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
