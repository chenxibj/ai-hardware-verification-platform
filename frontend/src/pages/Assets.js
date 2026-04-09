/**
 * @file Assets.js
 * @description 数字资产管理 — 独立一级菜单主页面（列表+分类导航+搜索+统计卡片+详情+上传）
 * @feat #259 资产 CRUD, #260 分类, #261 标签, #262 版本, #263 上传, #264 前端页面
 * @version 2.0 — Phase 1 增强版
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Tag, Space, Button, Row, Col, Statistic, Modal, Form, Input, Select,
  message, Tooltip, Badge, Spin, Upload, Typography, Menu, Dropdown, Popconfirm, Empty
} from "antd";
import {
  DatabaseOutlined, PlusOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined,
  SearchOutlined, CloudUploadOutlined, DownloadOutlined, EditOutlined,
  FileTextOutlined, CodeOutlined, PictureOutlined, ExperimentOutlined,
  FolderOutlined, InboxOutlined, AppstoreOutlined, FilterOutlined,
  TagsOutlined, HistoryOutlined, UnorderedListOutlined, TableOutlined,
  SortAscendingOutlined, FundOutlined, RiseOutlined
} from "@ant-design/icons";
import AssetDetail from "./AssetDetail";
import AssetUpload from "./AssetUpload";
import api from "../utils/api";
import dayjs from "dayjs";

const { Text, Title } = Typography;
const { Dragger } = Upload;

const formatFileSize = (bytes) => {
  if (!bytes) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
};

// 五大类资产 + 兼容旧类型
const ASSET_TYPES = {
  MODEL: { label: "模型", icon: <ExperimentOutlined />, color: "blue" },
  DATASET: { label: "数据集", icon: <DatabaseOutlined />, color: "green" },
  OPERATOR: { label: "算子", icon: <CodeOutlined />, color: "orange" },
  OPERATOR_SCRIPT: { label: "算子脚本", icon: <CodeOutlined />, color: "orange" },
  SCRIPT: { label: "脚本", icon: <FileTextOutlined />, color: "purple" },
  EVAL_SCRIPT: { label: "评测脚本", icon: <FileTextOutlined />, color: "volcano" },
  TEMPLATE: { label: "流程模板", icon: <FolderOutlined />, color: "cyan" },
  IMAGE: { label: "镜像", icon: <PictureOutlined />, color: "purple" },
  CONFIG: { label: "配置", icon: <FileTextOutlined />, color: "geekblue" },
  BENCHMARK: { label: "基准", icon: <AppstoreOutlined />, color: "cyan" },
  LOG: { label: "日志", icon: <FileTextOutlined />, color: "default" },
  MISC: { label: "其他", icon: <FolderOutlined />, color: "default" },
};

// Category tree for left nav
const CATEGORY_TREE = [
  { key: "all", label: "全部资产", icon: <AppstoreOutlined /> },
  { key: "MODEL", label: "模型资产", icon: <ExperimentOutlined />,
    children: [
      { key: "MODEL:image_class", label: "图像分类" },
      { key: "MODEL:object_detect", label: "目标检测" },
      { key: "MODEL:nlp", label: "自然语言处理" },
      { key: "MODEL:other", label: "其他模型" },
    ]
  },
  { key: "DATASET", label: "数据集资产", icon: <DatabaseOutlined />,
    children: [
      { key: "DATASET:image", label: "图像数据集" },
      { key: "DATASET:text", label: "文本数据集" },
      { key: "DATASET:tabular", label: "表格数据集" },
      { key: "DATASET:other", label: "其他数据集" },
    ]
  },
  { key: "OPERATOR", label: "算子资产", icon: <CodeOutlined /> },
  { key: "SCRIPT", label: "脚本资产", icon: <FileTextOutlined /> },
  { key: "TEMPLATE", label: "流程模板", icon: <FolderOutlined /> },
];

// Sub-page enum
const SUB_PAGE = { LIST: "list", DETAIL: "detail", UPLOAD: "upload" };

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Sub-page state
  const [subPage, setSubPage] = useState(SUB_PAGE.LIST);
  const [selectedAssetId, setSelectedAssetId] = useState(null);

  // Quick upload modal
  const [quickUploadVisible, setQuickUploadVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [form] = Form.useForm();

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = { size: 100 };
      if (searchText) params.keyword = searchText;
      // Determine type filter from category or dropdown
      const effectiveType = typeFilter || (selectedCategory !== "all" ? selectedCategory.split(":")[0] : null);
      if (effectiveType) params.assetType = effectiveType;
      const res = await api.get("/assets", { params });
      if (res.data.code === 0) setAssets(res.data.data || []);
    } catch (e) { message.error("获取资产列表失败"); }
    finally { setLoading(false); }
  }, [searchText, typeFilter, selectedCategory]);

  const fetchStats = useCallback(async () => {
    try { const r = await api.get("/assets/stats"); if (r.data.code === 0) setStats(r.data.data || {}); } catch (e) {}
  }, []);

  useEffect(() => { fetchAssets(); fetchStats(); }, [fetchAssets, fetchStats]);

  const handleDelete = (id, name) => {
    Modal.confirm({
      title: "确定删除？",
      content: `将删除资产「${name}」`,
      okText: "删除", okType: "danger", cancelText: "取消",
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
    if (!record.filePath) { message.warning("该资产没有关联文件"); return; }
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
    } catch (e) { message.error("下载失败"); }
  };

  const handleQuickUpload = async (values) => {
    if (fileList.length === 0) { message.error("请选择文件"); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", fileList[0].originFileObj);
      formData.append("name", values.name);
      formData.append("assetType", values.assetType);
      if (values.description) formData.append("description", values.description);
      if (values.version) formData.append("version", values.version);
      if (values.tags) formData.append("tags", JSON.stringify(values.tags.split(",").map(t => t.trim()).filter(Boolean)));

      const r = await api.post("/assets/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (r.data.code === 0) {
        message.success("上传成功");
        setQuickUploadVisible(false);
        form.resetFields();
        setFileList([]);
        fetchAssets();
        fetchStats();
      }
    } catch (e) { message.error(e.response?.data?.message || "上传失败"); }
    finally { setUploading(false); }
  };

  const getTypeInfo = (type) => ASSET_TYPES[type] || ASSET_TYPES.MISC;

  const parseTags = (tagsStr) => {
    if (!tagsStr) return [];
    try {
      const parsed = typeof tagsStr === "string" ? JSON.parse(tagsStr) : tagsStr;
      return Array.isArray(parsed) ? parsed : [];
    } catch { return typeof tagsStr === "string" ? tagsStr.split(",").filter(Boolean) : []; }
  };

  // --- Sub-page routing ---
  if (subPage === SUB_PAGE.DETAIL && selectedAssetId) {
    return <AssetDetail assetId={selectedAssetId} onBack={() => { setSubPage(SUB_PAGE.LIST); setSelectedAssetId(null); fetchAssets(); }} />;
  }
  if (subPage === SUB_PAGE.UPLOAD) {
    return <AssetUpload onBack={() => { setSubPage(SUB_PAGE.LIST); fetchAssets(); fetchStats(); }} onSuccess={() => { setSubPage(SUB_PAGE.LIST); fetchAssets(); fetchStats(); }} />;
  }

  const columns = [
    {
      title: "名称", dataIndex: "name", key: "name", ellipsis: true, width: 220,
      render: (v, r) => {
        const info = getTypeInfo(r.assetType);
        return (
          <Space size={6}>
            <span style={{ color: info.color !== "default" ? undefined : "#999" }}>{info.icon}</span>
            <Button type="link" style={{ padding: 0 }} onClick={() => { setSelectedAssetId(r.id); setSubPage(SUB_PAGE.DETAIL); }}>
              {v}
            </Button>
          </Space>
        );
      },
    },
    {
      title: "类型", dataIndex: "assetType", key: "assetType", width: 100,
      render: v => { const info = getTypeInfo(v); return <Tag color={info.color}>{info.label}</Tag>; },
    },
    {
      title: "版本", dataIndex: "version", key: "version", width: 80,
      render: v => v ? <Tag color="blue">v{v}</Tag> : "-",
    },
    {
      title: "标签", key: "tags", width: 180,
      render: (_, r) => {
        const tags = parseTags(r.tags);
        return tags.length > 0 ? (
          <Space size={2} wrap>
            {tags.slice(0, 2).map((t, i) => <Tag key={i} style={{ fontSize: 11 }}>{typeof t === "string" ? t.trim() : String(t)}</Tag>)}
            {tags.length > 2 && <Tag>+{tags.length - 2}</Tag>}
          </Space>
        ) : <Text type="secondary">-</Text>;
      },
    },
    {
      title: "格式", dataIndex: "fileFormat", key: "fileFormat", width: 70,
      render: v => v ? <Tag>{v}</Tag> : "-",
    },
    { title: "大小", dataIndex: "fileSize", key: "fileSize", width: 90, render: v => formatFileSize(v) },
    {
      title: "状态", dataIndex: "status", key: "status", width: 70,
      render: v => <Badge status={v === "ACTIVE" ? "success" : v === "DELETED" ? "error" : "default"}
        text={v === "ACTIVE" ? "可用" : v === "DELETED" ? "已删除" : "归档"} />,
    },
    {
      title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 140,
      render: v => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-",
    },
    {
      title: "操作", key: "action", width: 180, fixed: "right",
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="详情"><Button type="link" size="small" icon={<EyeOutlined />}
            onClick={() => { setSelectedAssetId(r.id); setSubPage(SUB_PAGE.DETAIL); }} /></Tooltip>
          <Tooltip title="下载"><Button type="link" size="small" icon={<DownloadOutlined />}
            onClick={() => handleDownload(r)} disabled={!r.filePath} /></Tooltip>
          <Tooltip title="删除"><Button type="link" size="small" danger icon={<DeleteOutlined />}
            onClick={() => handleDelete(r.id, r.name)} /></Tooltip>
        </Space>
      ),
    },
  ];

  const totalAssets = Number(stats.total) || 0;
  const modelCount = Number(stats.models) || 0;
  const datasetCount = Number(stats.datasets) || 0;
  const scriptCount = Number(stats.scripts) || 0;

  // Category menu items
  const categoryMenuItems = CATEGORY_TREE.map(cat => ({
    key: cat.key,
    icon: cat.icon,
    label: (
      <span>
        {cat.label}
        {cat.key === "all" && totalAssets > 0 && <Badge count={totalAssets} style={{ marginLeft: 8, backgroundColor: "#1890ff" }} size="small" />}
      </span>
    ),
    children: cat.children?.map(sub => ({
      key: sub.key,
      label: sub.label,
    })),
  }));

  return (
    <Spin spinning={loading && assets.length === 0}>
      <div>
        {/* Stats cards */}
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Card hoverable size="small" onClick={() => { setSelectedCategory("all"); setTypeFilter(null); }}>
              <Statistic title="总资产" value={totalAssets} prefix={<DatabaseOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Card hoverable size="small" onClick={() => { setSelectedCategory("MODEL"); setTypeFilter(null); }}>
              <Statistic title="模型" value={modelCount} valueStyle={{ color: "#1890ff" }} prefix={<ExperimentOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Card hoverable size="small" onClick={() => { setSelectedCategory("DATASET"); setTypeFilter(null); }}>
              <Statistic title="数据集" value={datasetCount} valueStyle={{ color: "#52c41a" }} prefix={<DatabaseOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Card hoverable size="small" onClick={() => { setSelectedCategory("SCRIPT"); setTypeFilter(null); }}>
              <Statistic title="脚本" value={scriptCount} valueStyle={{ color: "#722ed1" }} prefix={<CodeOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Card hoverable size="small">
              <Statistic title="配置" value={Number(stats.configs) || 0} prefix={<FileTextOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Card hoverable size="small">
              <Statistic title="基准" value={Number(stats.benchmarks) || 0} prefix={<AppstoreOutlined />} />
            </Card>
          </Col>
        </Row>

        {/* Main content: Category Nav + Table */}
        <Row gutter={16}>
          {/* Left category nav */}
          <Col xs={24} md={5} lg={4}>
            <Card size="small" title={<><FilterOutlined /> 资产分类</>} bodyStyle={{ padding: 0 }}>
              <Menu
                mode="inline"
                selectedKeys={[selectedCategory]}
                defaultOpenKeys={["MODEL", "DATASET"]}
                onClick={({ key }) => { setSelectedCategory(key); setTypeFilter(null); }}
                items={categoryMenuItems}
                style={{ border: "none" }}
              />
            </Card>
          </Col>

          {/* Right table */}
          <Col xs={24} md={19} lg={20}>
            <Card
              title={
                <Space>
                  <UnorderedListOutlined />
                  <span>
                    {selectedCategory === "all" ? "全部资产" :
                      (ASSET_TYPES[selectedCategory.split(":")[0]]?.label || selectedCategory)}
                  </span>
                  <Badge count={assets.length} style={{ backgroundColor: "#1890ff" }} size="small" />
                </Space>
              }
              extra={
                <Space wrap>
                  <Input
                    placeholder="搜索资产..."
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    onPressEnter={fetchAssets}
                    style={{ width: 180 }}
                    allowClear
                    onClear={() => { setSearchText(""); }}
                  />
                  <Select
                    placeholder="类型"
                    allowClear
                    style={{ width: 110 }}
                    value={typeFilter}
                    onChange={v => setTypeFilter(v)}
                    options={[
                      { value: "MODEL", label: "模型" },
                      { value: "DATASET", label: "数据集" },
                      { value: "OPERATOR", label: "算子" },
                      { value: "SCRIPT", label: "脚本" },
                      { value: "TEMPLATE", label: "模板" },
                    ]}
                  />
                  <Button icon={<SearchOutlined />} onClick={fetchAssets}>查询</Button>
                  <Button icon={<ReloadOutlined />} onClick={() => { setSearchText(""); setTypeFilter(null); setSelectedCategory("all"); fetchAssets(); fetchStats(); }} />
                  <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setSubPage(SUB_PAGE.UPLOAD)}>
                    上传资产
                  </Button>
                  <Button icon={<PlusOutlined />} onClick={() => { setQuickUploadVisible(true); form.resetFields(); setFileList([]); }}>
                    快速创建
                  </Button>
                </Space>
              }
            >
              <Table
                columns={columns}
                dataSource={assets}
                rowKey="id"
                loading={loading}
                scroll={{ x: 1200 }}
                size="small"
                pagination={{
                  pageSize: 15,
                  showSizeChanger: true,
                  pageSizeOptions: ["10", "15", "30", "50"],
                  showTotal: total => `共 ${total} 条`,
                  showQuickJumper: true,
                }}
              />
            </Card>
          </Col>
        </Row>

        {/* Quick upload modal */}
        <Modal title={<><CloudUploadOutlined /> 快速创建资产</>} open={quickUploadVisible}
          onCancel={() => { setQuickUploadVisible(false); setFileList([]); }} footer={null} width={600} destroyOnClose>
          <Form form={form} onFinish={handleQuickUpload} layout="vertical"
            initialValues={{ version: "1.0.0", assetType: "MODEL" }}>
            <Form.Item name="name" label="资产名称" rules={[{ required: true }]}>
              <Input placeholder="例：ResNet50-ImageNet-Pretrained" />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="assetType" label="资产类型" rules={[{ required: true }]}>
                  <Select options={[
                    { value: "MODEL", label: "模型" },
                    { value: "DATASET", label: "数据集" },
                    { value: "OPERATOR", label: "算子" },
                    { value: "SCRIPT", label: "脚本" },
                    { value: "TEMPLATE", label: "流程模板" },
                  ]} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="version" label="版本号">
                  <Input placeholder="1.0.0" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="tags" label="标签（逗号分隔）">
              <Input placeholder="例：NLP,Transformer,预训练" />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item label="上传文件">
              <Dragger
                maxCount={1}
                fileList={fileList}
                beforeUpload={() => false}
                onChange={(info) => setFileList(info.fileList)}
                onRemove={() => setFileList([])}
              >
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">点击或拖拽文件到此区域</p>
              </Dragger>
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block size="large" loading={uploading} icon={<CloudUploadOutlined />}>
                {uploading ? "上传中..." : "创建资产"}
              </Button>
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </Spin>
  );
}
