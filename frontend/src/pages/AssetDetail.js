/**
 * @file AssetDetail.js
 * @description 数字资产详情页 — 基本信息 + 预览 + 复用记录 + 版本/标签/元信息
 * @feat #264 #266 #267
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Descriptions, Tag, Space, Button, Tabs, Modal, Form, Input,
  message, Badge, Spin, Typography, Empty,
} from "antd";
import {
  ArrowLeftOutlined, EditOutlined, DeleteOutlined, DownloadOutlined,
  ShareAltOutlined, HistoryOutlined, TagsOutlined, InfoCircleOutlined,
  EyeOutlined, LinkOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";
import { getTypeInfo, formatFileSize } from "./assets/constants";
import VersionHistoryTab from "./assets/VersionHistoryTab";
import TagsTab from "./assets/TagsTab";
import ShareModal from "../components/ShareModal";
import AssetPreviewTab from "./assets/AssetPreviewTab";
import AssetReuseTab from "./assets/AssetReuseTab";

const { Paragraph } = Typography;

const STATUS_MAP = {
  ACTIVE:   { color: "success", text: "可用" },
  ARCHIVED: { color: "default", text: "已归档" },
  DELETED:  { color: "error",   text: "已删除" },
};

const parseMetadata = (raw) => {
  if (!raw) return {};
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { return {}; }
};

export default function AssetDetail({ assetId, onBack }) {
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editVisible, setEditVisible] = useState(false);
  const [editForm] = Form.useForm();
  const [shareVisible, setShareVisible] = useState(false);

  const fetchAsset = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    try {
      const res = await api.get(`/assets/${assetId}`);
      if (res.data.code === 0) setAsset(res.data.data);
    } catch {
      message.error("获取资产详情失败");
    } finally {
      setLoading(false);
    }
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
    } catch {
      message.error("下载失败");
    }
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
          if (onBack) onBack();
        } catch {
          message.error("删除失败");
        }
      },
    });
  };

  if (loading) {
    return (
      <Spin size="large"
        style={{ display: "flex", justifyContent: "center", marginTop: 100 }} />
    );
  }
  if (!asset) return <Empty description="资产不存在" />;

  const typeConfig = getTypeInfo(asset.assetType);
  const statusConfig = STATUS_MAP[asset.status] || { color: "default", text: asset.status };
  const metadata = parseMetadata(asset.metadata);

  const tabItems = [
    {
      key: "preview",
      label: <span><EyeOutlined /> 预览</span>,
      children: <AssetPreviewTab asset={asset} />,
    },
    {
      key: "reuse",
      label: <span><LinkOutlined /> 复用记录</span>,
      children: <AssetReuseTab asset={asset} />,
    },
    {
      key: "versions",
      label: <span><HistoryOutlined /> 版本历史</span>,
      children: <VersionHistoryTab asset={asset} onDownload={handleDownload} />,
    },
    {
      key: "tags",
      label: <span><TagsOutlined /> 标签</span>,
      children: <TagsTab asset={asset} />,
    },
    {
      key: "metadata",
      label: <span><InfoCircleOutlined /> 元信息</span>,
      children: Object.keys(metadata).length > 0 ? (
        <Descriptions column={2} bordered size="small">
          {Object.entries(metadata).map(([k, v]) => (
            <Descriptions.Item key={k} label={k}>
              {typeof v === "object" ? JSON.stringify(v) : String(v)}
            </Descriptions.Item>
          ))}
        </Descriptions>
      ) : (
        <span style={{ color: "#999" }}>暂无额外元信息</span>
      ),
    },
  ];

  return (
    <div>
      <div style={{
        marginBottom: 16, display: "flex",
        justifyContent: "space-between", alignItems: "center",
      }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回列表</Button>
          <span style={{ fontSize: 18, fontWeight: 600 }}>
            <span style={{ color: typeConfig.color, marginRight: 8 }}>
              {typeConfig.icon}
            </span>
            {asset.name}
          </span>
          <Badge status={statusConfig.color} text={statusConfig.text} />
        </Space>
        <Space>
          <Button icon={<EditOutlined />} onClick={() => {
            setEditVisible(true);
            editForm.setFieldsValue(asset);
          }}>编辑</Button>
          <Button icon={<ShareAltOutlined />} onClick={() => setShareVisible(true)}>分享</Button>
          <Button icon={<DownloadOutlined />} onClick={handleDownload}
            disabled={!asset.filePath}>下载</Button>
          <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
            删除
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions
          column={{ xxl: 3, xl: 3, lg: 2, md: 2, sm: 1 }}
          bordered size="small"
        >
          <Descriptions.Item label="资产编号">{asset.assetNo}</Descriptions.Item>
          <Descriptions.Item label="资产类型">
            <Tag color={typeConfig.color} icon={typeConfig.icon}>
              {typeConfig.label}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="当前版本">
            <Tag color="blue">v{asset.version || "1.0.0"}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="文件格式">
            {asset.fileFormat ? <Tag>{asset.fileFormat}</Tag> : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="文件大小">
            {formatFileSize(asset.fileSize)}
          </Descriptions.Item>
          <Descriptions.Item label="下载次数">
            {asset.downloadCount || 0} 次
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {asset.createdAt
              ? dayjs(asset.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {asset.updatedAt
              ? dayjs(asset.updatedAt).format("YYYY-MM-DD HH:mm:ss") : "-"}
          </Descriptions.Item>
          <Descriptions.Item label="来源">
            {asset.sourceUrl
              ? <a href={asset.sourceUrl} target="_blank"
                  rel="noopener noreferrer">{asset.sourceUrl}</a>
              : "本地上传"}
          </Descriptions.Item>
          <Descriptions.Item label="描述" span={3}>
            <Paragraph style={{ margin: 0 }}>
              {asset.description || "暂无描述"}
            </Paragraph>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card>
        <Tabs items={tabItems} defaultActiveKey="preview" />
      </Card>

      <Modal title="编辑资产信息" open={editVisible}
        onCancel={() => setEditVisible(false)} footer={null} width={560}>
        <Form form={editForm} layout="vertical" onFinish={() => {
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

      {/* #269 分享弹窗 */}
      <ShareModal
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        assetId={assetId}
        assetName={asset?.name}
      />
    </div>
  );
}
