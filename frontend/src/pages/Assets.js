/**
 * @file Assets.js
 * @description 数字资产管理 — 列表 + 上传弹窗(拖拽上传) + 类型图标 + 标签筛选
 * @feat #172 数字资产上传与管理 (US-2.4)
 */
import React, { useState, useEffect } from "react";
import {
  Card, Table, Tag, Space, Button, Row, Col, Statistic, Modal, Form, Input, Select,
  message, Tooltip, Badge, Spin, Upload, Typography
} from "antd";
import {
  DatabaseOutlined, PlusOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined,
  SearchOutlined, CloudUploadOutlined, DownloadOutlined, LinkOutlined,
  FileTextOutlined, CodeOutlined, PictureOutlined, ExperimentOutlined,
  FolderOutlined, InboxOutlined, AppstoreOutlined
} from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";

const { Text } = Typography;
const { Dragger } = Upload;

const formatFileSize = (bytes) => {
  if (!bytes) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
};

// 资产类型配置：图标 + 颜色
const ASSET_TYPES = {
  MODEL: { label: "模型", icon: <ExperimentOutlined />, color: "blue" },
  DATASET: { label: "数据集", icon: <DatabaseOutlined />, color: "green" },
  OPERATOR_SCRIPT: { label: "算子脚本", icon: <CodeOutlined />, color: "orange" },
  EVAL_SCRIPT: { label: "评测脚本", icon: <FileTextOutlined />, color: "volcano" },
  IMAGE: { label: "镜像", icon: <PictureOutlined />, color: "purple" },
  OTHER: { label: "其他", icon: <FolderOutlined />, color: "default" },
  // Legacy compatibility
  SCRIPT: { label: "脚本", icon: <CodeOutlined />, color: "orange" },
  BENCHMARK: { label: "基准", icon: <AppstoreOutlined />, color: "cyan" },
  CONFIG: { label: "配置", icon: <FileTextOutlined />, color: "geekblue" },
};

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [createVisible, setCreateVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selected, setSelected] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [form] = Form.useForm();

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const params = { size: 100 };
      if (searchText) params.keyword = searchText;
      if (typeFilter) params.assetType = typeFilter;
      const res = await api.get("/assets", { params });
      if (res.data.code === 0) setAssets(res.data.data || []);
    } catch (e) { message.error("获取资产列表失败"); }
    finally { setLoading(false); }
  };

  const fetchStats = async () => {
    try { const r = await api.get("/assets/stats"); if (r.data.code === 0) setStats(r.data.data); } catch (e) {}
  };

  useEffect(() => { fetchAssets(); fetchStats(); }, []);

  const handleCreate = async (values) => {
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("name", values.name);
      formData.append("assetType", values.assetType);
      if (values.description) formData.append("description", values.description);
      if (values.tags) formData.append("tags", values.tags);
      if (values.version) formData.append("version", values.version);

      // Attach file if present
      if (fileList.length > 0 && fileList[0].originFileObj) {
        formData.append("file", fileList[0].originFileObj);
      }

      const r = await api.post("/assets", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (r.data.code === 0) {
        message.success("资产创建成功");
        setCreateVisible(false);
        form.resetFields();
        setFileList([]);
        fetchAssets();
        fetchStats();
      }
    } catch (e) { message.error(e.response?.data?.message || "创建失败"); }
    finally { setUploading(false); }
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: "确定删除？", okText: "删除", okType: "danger", cancelText: "取消",
      content: "被引用的资产将无法删除",
      onOk: async () => {
        try {
          await api.delete("/assets/" + id);
          message.success("已删除");
          fetchAssets();
          fetchStats();
        } catch (e) { message.error(e.response?.data?.message || "删除失败"); }
      },
    });
  };

  const handleDownload = async (record) => {
    if (!record.filePath) {
      message.warning("该资产没有关联文件，无法下载");
      return;
    }
    try {
      const res = await api.get(`/assets/${record.id}/download`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", record.name || "download");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success("下载成功");
    } catch (e) { message.error("下载失败"); }
  };

  const getTypeInfo = (type) => ASSET_TYPES[type] || ASSET_TYPES.OTHER;

  const parseTags = (tagsStr) => {
    if (!tagsStr) return [];
    try {
      const parsed = typeof tagsStr === "string" ? JSON.parse(tagsStr) : tagsStr;
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  };

  const columns = [
    {
      title: "资产编号", dataIndex: "assetNo", key: "assetNo", width: 160, ellipsis: true,
    },
    {
      title: "名称", dataIndex: "name", key: "name", ellipsis: true, width: 180,
      render: (v, r) => {
        const info = getTypeInfo(r.assetType);
        return <Space size={4}><span style={{ color: info.color !== "default" ? undefined : "#999" }}>{info.icon}</span><Text>{v}</Text></Space>;
      },
    },
    {
      title: "类型", dataIndex: "assetType", key: "assetType", width: 110,
      render: v => {
        const info = getTypeInfo(v);
        return <Tag color={info.color} icon={info.icon}>{info.label}</Tag>;
      },
    },
    { title: "版本", dataIndex: "version", key: "version", width: 60 },
    {
      title: "标签", key: "tags", width: 160,
      render: (_, r) => {
        const tags = parseTags(r.tags);
        return tags.length > 0 ? (
          <Space size={2} wrap>
            {tags.slice(0, 3).map(t => <Tag key={t} style={{ fontSize: 11 }}>{t.trim()}</Tag>)}
            {tags.length > 3 && <Tag>+{tags.length - 3}</Tag>}
          </Space>
        ) : "-";
      },
    },
    {
      title: "格式", dataIndex: "fileFormat", key: "fileFormat", width: 70,
      render: v => v ? <Tag>{v}</Tag> : "-",
    },
    { title: "大小", dataIndex: "fileSize", key: "fileSize", width: 90, render: v => formatFileSize(v) },
    {
      title: "状态", dataIndex: "status", key: "status", width: 70,
      render: v => <Badge status={v === "ACTIVE" ? "success" : "default"} text={v === "ACTIVE" ? "可用" : "归档"} />,
    },
    { title: "下载", dataIndex: "downloadCount", key: "downloadCount", width: 60, render: v => v || 0 },
    {
      title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 140,
      render: v => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-",
    },
    {
      title: "操作", key: "action", width: 200,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setSelected(r); setDetailVisible(true); }}>详情</Button>
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(r)} disabled={!r.filePath}>下载</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  // Upload props (prevent auto upload)
  const uploadProps = {
    maxCount: 1,
    fileList: fileList,
    beforeUpload: () => false,
    onChange: (info) => setFileList(info.fileList),
    onRemove: () => setFileList([]),
  };

  return (
    <Spin spinning={loading}>
      <div>
        {/* Stats cards */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6} lg={4}><Card hoverable><Statistic title="总资产" value={stats.total || 0} prefix={<DatabaseOutlined />} /></Card></Col>
          <Col xs={24} sm={12} md={6} lg={4}><Card hoverable><Statistic title="模型" value={stats.models || 0} valueStyle={{ color: "#1890ff" }} prefix={<ExperimentOutlined />} /></Card></Col>
          <Col xs={24} sm={12} md={6} lg={4}><Card hoverable><Statistic title="数据集" value={stats.datasets || 0} valueStyle={{ color: "#52c41a" }} prefix={<DatabaseOutlined />} /></Card></Col>
          <Col xs={24} sm={12} md={6} lg={4}><Card hoverable><Statistic title="脚本" value={stats.scripts || 0} valueStyle={{ color: "#fa8c16" }} prefix={<CodeOutlined />} /></Card></Col>
          <Col xs={24} sm={12} md={6} lg={4}><Card hoverable><Statistic title="镜像" value={stats.images || 0} valueStyle={{ color: "#722ed1" }} prefix={<PictureOutlined />} /></Card></Col>
          <Col xs={24} sm={12} md={6} lg={4}><Card hoverable><Statistic title="其他" value={stats.others || 0} prefix={<FolderOutlined />} /></Card></Col>
        </Row>

        {/* Asset table */}
        <Card title="数字资产管理" extra={
          <Space>
            <Input placeholder="搜索" prefix={<SearchOutlined />} value={searchText}
              onChange={e => setSearchText(e.target.value)} onPressEnter={fetchAssets}
              style={{ width: 160 }} allowClear />
            <Select placeholder="类型筛选" allowClear style={{ width: 130 }} value={typeFilter}
              onChange={v => { setTypeFilter(v); }}
              options={Object.entries(ASSET_TYPES).filter(([k]) => !["SCRIPT", "BENCHMARK", "CONFIG"].includes(k))
                .map(([k, v]) => ({ value: k, label: v.label }))} />
            <Button onClick={fetchAssets}>查询</Button>
            <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => { setCreateVisible(true); form.resetFields(); setFileList([]); }}>上传资产</Button>
          </Space>
        }>
          <Table columns={columns} dataSource={assets} rowKey="id" loading={loading}
            scroll={{ x: "max-content" }}
            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", "20", "50"], showTotal: total => `共 ${total} 条` }} />
        </Card>

        {/* Upload modal with drag-and-drop */}
        <Modal title={<><CloudUploadOutlined /> 上传数字资产</>} open={createVisible}
          onCancel={() => { setCreateVisible(false); setFileList([]); }} footer={null} width={640} destroyOnClose>
          <Form form={form} onFinish={handleCreate} layout="vertical"
            initialValues={{ version: "1.0", assetType: "MODEL" }}>
            <Form.Item name="name" label="资产名称" rules={[{ required: true }]}>
              <Input placeholder="例：ResNet50-ImageNet-Pretrained" />
            </Form.Item>
            <Form.Item name="assetType" label="资产类型" rules={[{ required: true }]}>
              <Select options={Object.entries(ASSET_TYPES)
                .filter(([k]) => !["SCRIPT", "BENCHMARK", "CONFIG"].includes(k))
                .map(([k, v]) => ({ value: k, label: <Space>{v.icon}{v.label}</Space> }))} />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="version" label="版本"><Input /></Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="tags" label="标签(逗号分隔)">
                  <Input placeholder="例：NLP,Transformer,预训练" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="description" label="描述">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item label="上传文件">
              <Dragger {...uploadProps}>
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
                <p className="ant-upload-hint">支持模型文件、数据集、脚本等各类资产文件</p>
              </Dragger>
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block size="large" loading={uploading}
                icon={<CloudUploadOutlined />}>
                {uploading ? "上传中..." : "创建资产"}
              </Button>
            </Form.Item>
          </Form>
        </Modal>

        {/* Detail modal */}
        <Modal title="资产详情" open={detailVisible} onCancel={() => setDetailVisible(false)} footer={null} width={600}>
          {selected && (() => {
            const info = getTypeInfo(selected.assetType);
            const tags = parseTags(selected.tags);
            return (
              <div style={{ lineHeight: 2.5 }}>
                <p><b>编号：</b>{selected.assetNo}</p>
                <p><b>名称：</b>{selected.name}</p>
                <p><b>类型：</b><Tag color={info.color} icon={info.icon}>{info.label}</Tag></p>
                <p><b>版本：</b>{selected.version}</p>
                <p><b>格式：</b>{selected.fileFormat || selected.mimeType || "-"}</p>
                <p><b>大小：</b>{formatFileSize(selected.fileSize)}</p>
                {tags.length > 0 && (
                  <p><b>标签：</b><Space wrap>{tags.map(t => <Tag key={t}>{t}</Tag>)}</Space></p>
                )}
                <p><b>来源：</b>{selected.sourceUrl ? <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">{selected.sourceUrl}</a> : "无"}</p>
                <p><b>下载次数：</b>{selected.downloadCount || 0}</p>
                <p><b>描述：</b>{selected.description || "无"}</p>
                <p><b>创建时间：</b>{selected.createdAt ? dayjs(selected.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</p>
                {selected.filePath && (
                  <Button type="primary" icon={<DownloadOutlined />} onClick={() => handleDownload(selected)} style={{ marginTop: 8 }}>下载文件</Button>
                )}
              </div>
            );
          })()}
        </Modal>
      </div>
    </Spin>
  );
}
