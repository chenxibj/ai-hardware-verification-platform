/**
 * @file ChipList.js
 * @description 芯片管理页面 — 列表 + 注册弹窗(增强版) + 详情抽屉
 * Issues: #129 芯片注册, #130 芯片列表, #159 芯片注册增强
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Badge, Space,
  Statistic, Row, Col, message, Popconfirm, Drawer, Descriptions, Tooltip, Typography,
  Divider,
} from "antd";
import {
  PlusOutlined, ReloadOutlined, SearchOutlined, EyeOutlined,
  EditOutlined, DeleteOutlined, ExperimentOutlined, SwapOutlined,
  ThunderboltOutlined, AppstoreOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import { useNavigate } from "react-router-dom";

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

/* ── 常量 ── */
const CHIP_TYPES = ["GPU", "NPU", "TPU", "CPU", "OTHER"];
const CHIP_TYPE_COLORS = { GPU: "blue", NPU: "green", TPU: "purple", CPU: "orange", OTHER: "default" };
const CHIP_TYPE_LABELS = { GPU: "GPU", NPU: "NPU", TPU: "TPU", CPU: "CPU", OTHER: "其他" };
const STATUS_MAP = {
  UNEVALUATED: { text: "待评测", status: "default" },
  EVALUATING:  { text: "评测中", status: "processing" },
  EVALUATED:   { text: "已评测", status: "success" },
};
const FRAMEWORK_OPTIONS = [
  "PyTorch", "ONNX Runtime", "TensorFlow", "PaddlePaddle",
  "MindSpore", "TVM", "OpenVINO", "TensorRT", "CANN",
];
const FRAMEWORK_COLORS = {
  "PyTorch": "orange", "ONNX Runtime": "blue", "TensorFlow": "red",
  "PaddlePaddle": "green", "MindSpore": "purple", "TVM": "cyan",
  "OpenVINO": "geekblue", "TensorRT": "lime", "CANN": "magenta",
};

/* ── 主组件 ── */
export default function ChipList() {
  const navigate = useNavigate();
  /* #305: 权限控制 — 仅 admin/super_admin 可删除芯片 */
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = ["admin","super_admin","ADMIN","SUPER_ADMIN"].includes(currentUser.role);

  /* state */
  const [chips, setChips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [typeFilter, setTypeFilter] = useState(undefined);
  const [statusFilter, setStatusFilter] = useState(undefined);

  /* 统计 */
  const [stats, setStats] = useState({ total: 0, gpu: 0, npu: 0, evaluating: 0 });

  /* 弹窗 / 抽屉 */
  const [createVisible, setCreateVisible] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [chipSearch, setChipSearch] = useState("");

  const [form] = Form.useForm();

  /* ── API ── */
  const fetchChips = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, size: pageSize };
      if (typeFilter) params.chipType = typeFilter;
      if (statusFilter) params.status = statusFilter;
      const { data: resp } = await api.get("/chips", { params });
      if (resp.code === 0) {
        setChips(resp.data || []);
        setTotal(resp.total || 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, typeFilter, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const { data: all } = await api.get("/chips", { params: { page: 0, size: 1 } });
      const totalCount = all.total || 0;
      const gpuP = api.get("/chips", { params: { page: 0, size: 1, chipType: "GPU" } });
      const npuP = api.get("/chips", { params: { page: 0, size: 1, chipType: "NPU" } });
      const evP  = api.get("/chips", { params: { page: 0, size: 1, status: "EVALUATING" } });
      const [gpuR, npuR, evR] = await Promise.all([gpuP, npuP, evP]);
      setStats({
        total: totalCount,
        gpu: gpuR.data.total || 0,
        npu: npuR.data.total || 0,
        evaluating: evR.data.total || 0,
      });
    } catch (_) {}
  }, []);

  useEffect(() => { fetchChips(); }, [fetchChips]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  /* 创建 / 编辑 */
  const openCreate = () => {
    setEditRecord(null);
    form.resetFields();
    setCreateVisible(true);
  };

  const openEdit = (record) => {
    setEditRecord(record);
    let techSpec = {};
    let softwareStack = {};
    try { techSpec = JSON.parse(record.techSpec || "{}"); } catch (_) {}
    try { softwareStack = JSON.parse(record.softwareStack || "{}"); } catch (_) {}
    form.setFieldsValue({
      name: record.name,
      manufacturer: record.manufacturer,
      chipType: record.chipType,
      computePower: techSpec.computePower || undefined,
      computePowerUnit: techSpec.computePowerUnit || "TFLOPS",
      memory: techSpec.memory || undefined,
      memoryTypeOld: techSpec.memoryType || "HBM2e",
      tdp: techSpec.tdp || undefined,
      frequency: techSpec.frequency || undefined,
      cores: techSpec.cores || undefined,
      driver: softwareStack.driver || "",
      sdk: softwareStack.sdk || "",
      frameworks: softwareStack.frameworks || [],
      tags: record.tags || "",
      remark: record.remark || "",
      // #433: 扩展规格字段
      peakGflopsFp32: record.peakGflopsFp32 || undefined,
      peakGflopsFp16: record.peakGflopsFp16 || undefined,
      fp64Tflops: record.fp64Tflops || undefined,
      tf32Tflops: record.tf32Tflops || undefined,
      bf16Tflops: record.bf16Tflops || undefined,
      fp8Tflops: record.fp8Tflops || undefined,
      int8Tops: record.int8Tops || undefined,
      memoryGb: record.memoryGb || undefined,
      memoryType: record.memoryType || undefined,
      memoryBandwidthTbps: record.memoryBandwidthTbps || undefined,
      interconnectBandwidthGbps: record.interconnectBandwidthGbps || undefined,
      interconnectType: record.interconnectType || undefined,
      tdpWatts: record.tdpWatts || undefined,
      processNode: record.processNode || undefined,
      supportedPrecisions: record.supportedPrecisions || undefined,
    });
    setCreateVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);

      const techSpec = JSON.stringify({
        computePower: values.computePower || "",
        computePowerUnit: values.computePowerUnit || "TFLOPS",
        memory: values.memory || "",
        memoryType: values.memoryType || "",
        tdp: values.tdp || "",
        frequency: values.frequency || "",
        cores: values.cores || "",
      });
      const softwareStack = JSON.stringify({
        driver: values.driver || "",
        sdk: values.sdk || "",
        frameworks: values.frameworks || [],
      });

      const payload = {
        name: values.name,
        manufacturer: values.manufacturer,
        chipType: values.chipType,
        techSpec,
        softwareStack,
        tags: values.tags || "",
        remark: values.remark || "",
        // #433: 扩展规格字段
        peakGflopsFp32: values.peakGflopsFp32 || null,
        peakGflopsFp16: values.peakGflopsFp16 || null,
        fp64Tflops: values.fp64Tflops || null,
        tf32Tflops: values.tf32Tflops || null,
        bf16Tflops: values.bf16Tflops || null,
        fp8Tflops: values.fp8Tflops || null,
        int8Tops: values.int8Tops || null,
        memoryGb: values.memoryGb || null,
        memoryType: values.memoryType || null,
        memoryBandwidthTbps: values.memoryBandwidthTbps || null,
        interconnectBandwidthGbps: values.interconnectBandwidthGbps || null,
        interconnectType: values.interconnectType || null,
        tdpWatts: values.tdpWatts || null,
        processNode: values.processNode || null,
        supportedPrecisions: values.supportedPrecisions || null,
      };

      if (editRecord) {
        await api.put("/chips/" + editRecord.id, payload);
        message.success("芯片更新成功");
      } else {
        await api.post("/chips", payload);
        message.success("芯片注册成功");
      }
      setCreateVisible(false);
      form.resetFields();
      fetchChips();
      fetchStats();
    } catch (e) {
      if (e.errorFields) return;
      const errMsg = e.response?.data?.message || e.message;
      message.error("操作失败: " + errMsg);
    } finally {
      setSubmitLoading(false);
    }
  };

  /* 删除 */
  const handleDelete = async (id) => {
    try {
      await api.delete("/chips/" + id);
      message.success("删除成功");
      fetchChips();
      fetchStats();
    } catch (e) {
      message.error("删除失败: " + (e.response?.data?.message || e.message));
    }
  };

  /* 详情 */
  const openDetail = (record) => {
    setDetailRecord(record);
    setDetailVisible(true);
  };

  /* ── 表格列 ── */
  const columns = [
    {
      title: "芯片编号", dataIndex: "chipNo", key: "chipNo", width: 180,
      render: (v) => <Text copyable={{ text: v }} style={{ fontSize: 13 }}>{v}</Text>,
    },
    { title: "名称", dataIndex: "name", key: "name", width: 160, ellipsis: true },
    { title: "厂商", dataIndex: "manufacturer", key: "manufacturer", width: 120, ellipsis: true },
    {
      title: "类型", dataIndex: "chipType", key: "chipType", width: 90,
      render: (v) => <Tag color={CHIP_TYPE_COLORS[v] || "default"}>{CHIP_TYPE_LABELS[v] || v}</Tag>,
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 100,
      render: (v) => {
        const s = STATUS_MAP[v] || { text: v, status: "default" };
        return <Badge status={s.status} text={s.text} />;
      },
    },
    {
      title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 170,
      render: (v) => v ? new Date(v).toLocaleString("zh-CN") : "-",
    },
    {
      title: "操作", key: "actions", width: 180, fixed: "right",
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/chips/${record.id}`)} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          {isAdmin && (
            <Popconfirm title="确定删除该芯片?" onConfirm={() => handleDelete(record.id)} okText="删除" cancelText="取消">
              <Tooltip title="删除">
                <Button type="link" size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  /* ── 解析 JSON 辅助 ── */
  const safeParse = (str) => { try { return JSON.parse(str || "{}"); } catch (_) { return {}; } };

  /* ── 渲染 ── */
  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card hoverable><Statistic title="芯片总数" value={stats.total} prefix={<ExperimentOutlined />} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable><Statistic title="GPU" value={stats.gpu} valueStyle={{ color: "#1890ff" }} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable><Statistic title="NPU" value={stats.npu} valueStyle={{ color: "#52c41a" }} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable><Statistic title="评测中" value={stats.evaluating} valueStyle={{ color: "#faad14" }} /></Card>
        </Col>
      </Row>

      {/* 工具栏 + 表格 */}
      <Card
        title="芯片列表"
        extra={
          <Space>
<Input.Search
              placeholder="搜索名称/编号/厂商"
              allowClear
              value={chipSearch}
              onChange={(e) => setChipSearch(e.target.value)}
              style={{ width: 200 }}
            />
            <Select
              placeholder="按类型筛选" allowClear style={{ width: 140 }}
              value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(0); }}
            >
              {CHIP_TYPES.map((t) => <Option key={t} value={t}>{CHIP_TYPE_LABELS[t]}</Option>)}
            </Select>
            <Select
              placeholder="按状态筛选" allowClear style={{ width: 140 }}
              value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(0); }}
            >
              {Object.entries(STATUS_MAP).map(([k, v]) => <Option key={k} value={k}>{v.text}</Option>)}
            </Select>
            {selectedRowKeys.length >= 2 && selectedRowKeys.length <= 4 && (
              <Button type="primary" icon={<SwapOutlined />} onClick={() => navigate(`/chips/compare?ids=${selectedRowKeys.join(",")}`)}>
                芯片对比 ({selectedRowKeys.length})
              </Button>
            )}
            {selectedRowKeys.length > 4 && (
              <span style={{ color: '#ff4d4f', fontSize: 12 }}>最多选择4颗芯片</span>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => { fetchChips(); fetchStats(); }}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增芯片</Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
            getCheckboxProps: (record) => ({
              disabled: selectedRowKeys.length >= 4 && !selectedRowKeys.includes(record.id),
            }),
          }}
          columns={columns}
          dataSource={chips.filter(c => {
            if (!chipSearch) return true;
            const q = chipSearch.toLowerCase();
            return (c.name || "").toLowerCase().includes(q) ||
                   (c.chipNo || "").toLowerCase().includes(q) ||
                   (c.manufacturer || "").toLowerCase().includes(q);
          })}
          loading={loading}
          scroll={{ x: 1000 }}
          pagination={{
            current: page + 1,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => { setPage(p - 1); setPageSize(ps); },
          }}
        />
      </Card>

      {/* ── 注册 / 编辑弹窗 (增强版 #159) ── */}
      <Modal
        title={editRecord ? "编辑芯片" : "注册芯片"}
        open={createVisible}
        onCancel={() => { setCreateVisible(false); form.resetFields(); }}
        onOk={handleSubmit}
        confirmLoading={submitLoading}
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          {/* chipNo 自动生成提示 */}
          {!editRecord && (
            <div style={{
              background: "#fafafa", border: "1px dashed #d9d9d9", borderRadius: 6,
              padding: "8px 12px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8,
            }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                <ExperimentOutlined style={{ marginRight: 4 }} />
                芯片编号：<Text type="secondary" italic>自动生成（格式：CHIP-YYYYMMDD-NNN）</Text>
              </Text>
            </div>
          )}

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="name" label="芯片名称" rules={[{ required: true, message: "请输入芯片名称" }]}>
                <Input placeholder="如 NVIDIA A100" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="manufacturer" label="厂商" rules={[{ required: true, message: "请输入厂商" }]}>
                <Input placeholder="如 NVIDIA" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="chipType" label="芯片类型" rules={[{ required: true, message: "请选择芯片类型" }]}>
                <Select placeholder="选择芯片类型">
                  {CHIP_TYPES.map((t) => <Option key={t} value={t}>{CHIP_TYPE_LABELS[t]}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* ── 算力规格（#433 扩展） ── */}
          <Card
            size="small"
            title={<span><ThunderboltOutlined style={{ marginRight: 6 }} />算力规格</span>}
            style={{ marginBottom: 16 }}
            type="inner"
          >
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="fp64Tflops" label="FP64 TFLOPS" style={{ marginBottom: 8 }}>
                  <InputNumber placeholder="如 30" style={{ width: "100%" }} min={0} step={0.1} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="peakGflopsFp32" label="FP32 TFLOPS" style={{ marginBottom: 8 }}>
                  <InputNumber placeholder="如 91.6" style={{ width: "100%" }} min={0} step={0.1} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="tf32Tflops" label="TF32 TFLOPS" style={{ marginBottom: 8 }}>
                  <InputNumber placeholder="如 183" style={{ width: "100%" }} min={0} step={0.1} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="peakGflopsFp16" label="FP16 TFLOPS" style={{ marginBottom: 8 }}>
                  <InputNumber placeholder="如 183.2" style={{ width: "100%" }} min={0} step={0.1} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="bf16Tflops" label="BF16 TFLOPS" style={{ marginBottom: 8 }}>
                  <InputNumber placeholder="如 183.2" style={{ width: "100%" }} min={0} step={0.1} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="fp8Tflops" label="FP8 TFLOPS" style={{ marginBottom: 8 }}>
                  <InputNumber placeholder="如 733" style={{ width: "100%" }} min={0} step={0.1} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="int8Tops" label="INT8 TOPS" style={{ marginBottom: 8 }}>
                  <InputNumber placeholder="如 733" style={{ width: "100%" }} min={0} step={0.1} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* ── 存储规格 ── */}
          <Card
            size="small"
            title={<span><AppstoreOutlined style={{ marginRight: 6 }} />存储规格</span>}
            style={{ marginBottom: 16 }}
            type="inner"
          >
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="memoryGb" label="显存容量 (GB)" style={{ marginBottom: 8 }}>
                  <InputNumber placeholder="如 48" style={{ width: "100%" }} min={0} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="memoryType" label="显存类型" style={{ marginBottom: 8 }}>
                  <Select placeholder="选择显存类型" allowClear>
                    <Option value="HBM2e">HBM2e</Option>
                    <Option value="HBM3">HBM3</Option>
                    <Option value="HBM3e">HBM3e</Option>
                    <Option value="GDDR6">GDDR6</Option>
                    <Option value="GDDR6X">GDDR6X</Option>
                    <Option value="LPDDR5">LPDDR5</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="memoryBandwidthTbps" label="显存带宽 (TB/s)" style={{ marginBottom: 8 }}>
                  <InputNumber placeholder="如 0.864" style={{ width: "100%" }} min={0} step={0.1} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* ── 互联与其他规格 ── */}
          <Card
            size="small"
            title={<span><SwapOutlined style={{ marginRight: 6 }} />互联与其他规格</span>}
            style={{ marginBottom: 16 }}
            type="inner"
          >
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="interconnectBandwidthGbps" label="互联带宽 (GB/s)" style={{ marginBottom: 8 }}>
                  <InputNumber placeholder="如 63" style={{ width: "100%" }} min={0} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="interconnectType" label="互联类型" style={{ marginBottom: 8 }}>
                  <Select placeholder="选择互联类型" allowClear>
                    <Option value="NVLink">NVLink</Option>
                    <Option value="MUSA Link">MUSA Link</Option>
                    <Option value="HiLink">HiLink</Option>
                    <Option value="PCIe">PCIe</Option>
                    <Option value="PCIe Gen4 x16">PCIe Gen4 x16</Option>
                    <Option value="PCIe Gen5 x16">PCIe Gen5 x16</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="tdpWatts" label="TDP 功耗 (W)" style={{ marginBottom: 8 }}>
                  <InputNumber placeholder="如 350" style={{ width: "100%" }} min={0} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="processNode" label="制程工艺" style={{ marginBottom: 8 }}>
                  <Select placeholder="选择制程" allowClear>
                    <Option value="3nm">3nm</Option>
                    <Option value="4nm">4nm</Option>
                    <Option value="5nm">5nm</Option>
                    <Option value="7nm">7nm</Option>
                    <Option value="12nm">12nm</Option>
                    <Option value="14nm">14nm</Option>
                    <Option value="16nm">16nm</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={16}>
                <Form.Item name="supportedPrecisions" label="支持精度" style={{ marginBottom: 8 }}>
                  <Input placeholder="如 FP64,FP32,TF32,FP16,BF16,FP8,INT8" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* ── 软件栈区域（增强 #159） ── */}
          <Card
            size="small"
            title={<span><AppstoreOutlined style={{ marginRight: 6 }} />软件栈</span>}
            style={{ marginBottom: 16 }}
            type="inner"
          >
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="driver" label="驱动版本" style={{ marginBottom: 8 }}>
                  <Input placeholder="如 535.129.03" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="sdk" label="SDK 版本" style={{ marginBottom: 8 }}>
                  <Input placeholder="如 CUDA 12.2" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="frameworks" label="适配框架" style={{ marginBottom: 8 }}>
              <Select
                mode="tags"
                placeholder="选择或输入适配框架"
                allowClear
                tokenSeparators={[","]}
              >
                {FRAMEWORK_OPTIONS.map((f) => (
                  <Option key={f} value={f}>{f}</Option>
                ))}
              </Select>
            </Form.Item>
          </Card>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="tags" label="标签">
                <Input placeholder="多个标签用逗号分隔" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="remark" label="备注">
                <Input placeholder="备注信息..." />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 详情抽屉 */}
      <Drawer
        title={detailRecord ? `芯片详情 — ${detailRecord.name}` : "芯片详情"}
        open={detailVisible}
        onClose={() => setDetailVisible(false)}
        width={560}
      >
        {detailRecord && (() => {
          const tech = safeParse(detailRecord.techSpec);
          const sw = safeParse(detailRecord.softwareStack);
          return (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="芯片编号">{detailRecord.chipNo}</Descriptions.Item>
              <Descriptions.Item label="名称">{detailRecord.name}</Descriptions.Item>
              <Descriptions.Item label="厂商">{detailRecord.manufacturer}</Descriptions.Item>
              <Descriptions.Item label="类型">
                <Tag color={CHIP_TYPE_COLORS[detailRecord.chipType]}>{CHIP_TYPE_LABELS[detailRecord.chipType] || detailRecord.chipType}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {(() => { const s = STATUS_MAP[detailRecord.status] || { text: detailRecord.status, status: "default" }; return <Badge status={s.status} text={s.text} />; })()}
              </Descriptions.Item>
              <Descriptions.Item label="标称算力">{tech.computePower ? `${tech.computePower} ${tech.computePowerUnit || "TFLOPS"}` : "-"}</Descriptions.Item>
              <Descriptions.Item label="显存/内存">{tech.memory ? `${tech.memory} GB ${tech.memoryType || ""}` : "-"}</Descriptions.Item>
              <Descriptions.Item label="TDP功耗">{tech.tdp ? `${tech.tdp} W` : "-"}</Descriptions.Item>
              <Descriptions.Item label="频率">{tech.frequency ? `${tech.frequency} GHz` : "-"}</Descriptions.Item>
              <Descriptions.Item label="核心数">{tech.cores || "-"}</Descriptions.Item>
              <Descriptions.Item label="驱动版本">{sw.driver || "-"}</Descriptions.Item>
              <Descriptions.Item label="SDK版本">{sw.sdk || "-"}</Descriptions.Item>
              <Descriptions.Item label="适配框架">
                {(sw.frameworks || []).length > 0
                  ? sw.frameworks.map((f) => <Tag key={f} color={FRAMEWORK_COLORS[f] || "blue"}>{f}</Tag>)
                  : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="标签">{detailRecord.tags || "-"}</Descriptions.Item>
              <Descriptions.Item label="备注">{detailRecord.remark || "-"}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{detailRecord.createdAt ? new Date(detailRecord.createdAt).toLocaleString("zh-CN") : "-"}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{detailRecord.updatedAt ? new Date(detailRecord.updatedAt).toLocaleString("zh-CN") : "-"}</Descriptions.Item>
            </Descriptions>
          );
        })()}
      </Drawer>
    </div>
  );
}
