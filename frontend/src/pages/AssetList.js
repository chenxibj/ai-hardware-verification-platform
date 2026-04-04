/**
 * @file AssetList.js
 * @description 数字资产管理页面 — 上传/下载/删除 + 类型筛选
 * Issue: #172
 */
import React, { useState, useEffect } from "react";
import {
  Card, Table, Tag, Space, Button, Row, Col, Statistic, Modal, Form,
  Input, Select, message, Tooltip, Badge, Spin, Upload, Tabs,
} from "antd";
import {
  DatabaseOutlined, PlusOutlined, EyeOutlined, DeleteOutlined,
  SearchOutlined, CloudUploadOutlined, DownloadOutlined, LinkOutlined,
  InboxOutlined, FileOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";

const { Dragger } = Upload;

const formatFileSize = (bytes) => {
  if (!bytes) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
};

const TYPE_MAP = {
  MODEL: "模型", DATASET: "数据集", SCRIPT: "脚本", CONFIG: "配置", LOG: "日志", BENCHMARK: "基准",
};
const TYPE_COLORS = {
  MODEL: "blue", DATASET: "green", SCRIPT: "orange", CONFIG: "cyan", LOG: "purple", BENCHMARK: "magenta",
};

export default function AssetList() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [uploadVisible, setUploadVisible] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selected, setSelected] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");
  const [form] = Form.useForm();
  const [uploadForm] = Form.useForm();

  const fetchAssets = async (type) => {
    setLoading(true);
    try {
      const params = { size: 100 };
      if (searchText) params.keyword = searchText;
      if (type && type !== "ALL") params.assetType = type;
      const res = await api.get("/assets", { params });
      if (res.data.code === 0) setAssets(res.data.data || []);
    } catch (e) { message.error("获取资产列表失败"); }
    finally { setLoading(false); }
  };
  const fetchStats = async () => { try { const r = await api.get("/assets/stats"); if (r.data.code === 0) setStats(r.data.data); } catch (e) {} };

  useEffect(() => { fetchAssets(activeTab); fetchStats(); }, []);

  const handleTabChange = (key) => {
    setActiveTab(key);
    fetchAssets(key);
  };

  const handleUpload = async (values) => {
    const formData = new FormData();
    if (values.file && values.file.length > 0) {
      formData.append("file", values.file[0].originFileObj);
    }
    formData.append("name", values.name || "");
    formData.append("assetType", values.assetType || "MISC");
    formData.append("description", values.description || "");
    try {
      const res = await api.post("/assets/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data.code === 0) {
        message.success("上传成功");
        setUploadVisible(false);
        uploadForm.resetFields();
        fetchAssets(activeTab);
        fetchStats();
      }
    } catch (e) { message.error("上传失败: " + (e.response?.data?.message || e.message)); }
  };

  const handleCreate = async (values) => {
    try {
      const r = await api.post("/assets", values);
      if (r.data.code === 0) {
        message.success("资产创建成功");
        setCreateVisible(false);
        form.resetFields();
        fetchAssets(activeTab);
        fetchStats();
      }
    } catch (e) { message.error("创建失败"); }
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: "确定删除该资产？", okText: "删除", okType: "danger", cancelText: "取消",
      onOk: async () => {
        try { await api.delete("/assets/" + id); message.success("已删除"); fetchAssets(activeTab); fetchStats(); }
        catch (e) { message.error("删除失败"); }
      },
    });
  };

  const handleDownload = async (record) => {
    if (!record.filePath) { message.warning("该资产没有关联文件"); return; }
    try {
      const res = await api.get(`/assets/${record.id}/download`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", record.name || "download");
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
      message.success("下载成功");
    } catch (e) { message.error("下载失败"); }
  };

  const columns = [
    { title: "名称", dataIndex: "name", key: "name", ellipsis: true, width: 200 },
    {
      title: "类型", dataIndex: "assetType", key: "assetType", width: 90,
      render: v => <Tag color={TYPE_COLORS[v] || "default"}>{TYPE_MAP[v] || v}</Tag>,
    },
    { title: "大小", dataIndex: "fileSize", key: "fileSize", width: 90, render: v => formatFileSize(v) },
    { title: "格式", dataIndex: "fileFormat", key: "fileFormat", width: 70, render: v => v ? <Tag>{v}</Tag> : "-" },
    { title: "上传者", dataIndex: "createdBy", key: "createdBy", width: 80, render: v => v ? `用户 #${v}` : "-" },
    { title: "状态", dataIndex: "status", key: "status", width: 70, render: v => <Badge status={v === "ACTIVE" ? "success" : "default"} text={v === "ACTIVE" ? "可用" : "归档"} /> },
    { title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 150, render: v => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-" },
    {
      title: "操作", key: "action", width: 220, render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setSelected(r); setDetailVisible(true); }}>详情</Button>
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(r)} disabled={!r.filePath}>下载</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  const tabItems = [
    { key: "ALL", label: "全部" },
    { key: "MODEL", label: "模型" },
    { key: "DATASET", label: "数据集" },
    { key: "SCRIPT", label: "脚本" },
    { key: "CONFIG", label: "配置" },
    { key: "LOG", label: "日志" },
  ];

  return (
    <Spin spinning={loading}>
      <div>
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={4}><Card hoverable><Statistic title="总资产" value={stats.total || 0} prefix={<DatabaseOutlined />} /></Card></Col>
          <Col xs={24} sm={12} md={4}><Card hoverable><Statistic title="模型" value={stats.models || 0} valueStyle={{ color: "#1890ff" }} /></Card></Col>
          <Col xs={24} sm={12} md={4}><Card hoverable><Statistic title="数据集" value={stats.datasets || 0} valueStyle={{ color: "#52c41a" }} /></Card></Col>
          <Col xs={24} sm={12} md={4}><Card hoverable><Statistic title="脚本" value={stats.scripts || 0} valueStyle={{ color: "#fa8c16" }} /></Card></Col>
          <Col xs={24} sm={12} md={4}><Card hoverable><Statistic title="配置" value={stats.configs || 0} valueStyle={{ color: "#13c2c2" }} /></Card></Col>
          <Col xs={24} sm={12} md={4}><Card hoverable><Statistic title="日志" value={stats.logs || 0} valueStyle={{ color: "#722ed1" }} /></Card></Col>
        </Row>

        <Card
          title="数字资产管理"
          extra={
            <Space>
              <Input placeholder="搜索资产" prefix={<SearchOutlined />} value={searchText}
                onChange={e => setSearchText(e.target.value)} onPressEnter={() => fetchAssets(activeTab)}
                style={{ width: 180 }} allowClear />
              <Button onClick={() => fetchAssets(activeTab)}>查询</Button>
              <Button icon={<CloudUploadOutlined />} type="primary" onClick={() => setUploadVisible(true)}>上传资产</Button>
              <Button icon={<PlusOutlined />} onClick={() => setCreateVisible(true)}>新增资产</Button>
            </Space>
          }
        >
          <Tabs activeKey={activeTab} onChange={handleTabChange} items={tabItems} style={{ marginBottom: 16 }} />
          <Table columns={columns} dataSource={assets} rowKey="id" loading={loading}
            scroll={{ x: "max-content" }}
            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", "20", "50"], showTotal: t => `共 ${t} 条` }} />
        </Card>

        {/* 上传资产 Modal */}
        <Modal title="上传数字资产" open={uploadVisible} onCancel={() => setUploadVisible(false)} footer={null} width={600} destroyOnClose>
          <Form form={uploadForm} onFinish={handleUpload} layout="vertical" initialValues={{ assetType: "MODEL" }}>
            <Form.Item name="file" label="选择文件" valuePropName="fileList" getValueFromEvent={e => Array.isArray(e) ? e : e?.fileList}
              rules={[{ required: true, message: "请选择文件" }]}>
              <Dragger beforeUpload={() => false} maxCount={1}>
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
                <p className="ant-upload-hint">支持单个文件上传，最大 100MB</p>
              </Dragger>
            </Form.Item>
            <Form.Item name="name" label="资产名称"><Input placeholder="留空则使用文件名" /></Form.Item>
            <Form.Item name="assetType" label="资产类型" rules={[{ required: true }]}>
              <Select options={Object.entries(TYPE_MAP).map(([k, v]) => ({ value: k, label: v }))} />
            </Form.Item>
            <Form.Item name="description" label="描述"><Input.TextArea rows={3} /></Form.Item>
            <Form.Item><Button type="primary" htmlType="submit" block size="large" icon={<CloudUploadOutlined />}>开始上传</Button></Form.Item>
          </Form>
        </Modal>

        {/* 手动创建资产 Modal */}
        <Modal title="新增数字资产" open={createVisible} onCancel={() => setCreateVisible(false)} footer={null} width={600} destroyOnClose>
          <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{ version: "1.0", assetType: "MODEL" }}>
            <Form.Item name="name" label="资产名称" rules={[{ required: true }]}><Input placeholder="例：ResNet50-ImageNet-Pretrained" /></Form.Item>
            <Form.Item name="assetType" label="资产类型" rules={[{ required: true }]}>
              <Select options={Object.entries(TYPE_MAP).map(([k, v]) => ({ value: k, label: v }))} />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}><Form.Item name="version" label="版本"><Input /></Form.Item></Col>
              <Col span={12}><Form.Item name="fileFormat" label="文件格式"><Input placeholder="例：ONNX, PyTorch" /></Form.Item></Col>
            </Row>
            <Form.Item name="sourceUrl" label="来源URL"><Input placeholder="例：https://huggingface.co/xxx" /></Form.Item>
            <Form.Item name="description" label="描述"><Input.TextArea rows={3} /></Form.Item>
            <Form.Item><Button type="primary" htmlType="submit" block size="large">创建</Button></Form.Item>
          </Form>
        </Modal>

        {/* 资产详情 Modal */}
        <Modal title="资产详情" open={detailVisible} onCancel={() => setDetailVisible(false)} footer={null} width={600}>
          {selected && (
            <div style={{ lineHeight: 2.5 }}>
              <p><b>编号：</b>{selected.assetNo}</p>
              <p><b>名称：</b>{selected.name}</p>
              <p><b>类型：</b><Tag color={TYPE_COLORS[selected.assetType]}>{TYPE_MAP[selected.assetType] || selected.assetType}</Tag></p>
              <p><b>版本：</b>{selected.version || "-"}</p>
              <p><b>格式：</b>{selected.fileFormat || selected.mimeType || "-"}</p>
              <p><b>大小：</b>{formatFileSize(selected.fileSize)}</p>
              <p><b>来源：</b>{selected.sourceUrl ? <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">{selected.sourceUrl}</a> : "无"}</p>
              <p><b>下载次数：</b>{selected.downloadCount || 0}</p>
              <p><b>描述：</b>{selected.description || "无"}</p>
              <p><b>创建时间：</b>{selected.createdAt ? dayjs(selected.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</p>
              {selected.filePath && <Button type="primary" icon={<DownloadOutlined />} onClick={() => handleDownload(selected)} style={{ marginTop: 8 }}>下载文件</Button>}
            </div>
          )}
        </Modal>
      </div>
    </Spin>
  );
}
