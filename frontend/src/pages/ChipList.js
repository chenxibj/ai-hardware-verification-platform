/**
 * @file ChipList.js
 * @description 芯片管理页面 — 列表 + 注册弹窗 + 详情抽屉
 * Issues: #129 芯片注册, #130 芯片列表
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Button, Modal, Form, Input, Select, Tag, Badge, Space,
  Statistic, Row, Col, message, Popconfirm, Drawer, Descriptions, Tooltip, Typography,
} from "antd";
import {
  PlusOutlined, ReloadOutlined, SearchOutlined, EyeOutlined,
  EditOutlined, DeleteOutlined, ExperimentOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

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
const FRAMEWORK_OPTIONS = ["PyTorch", "ONNX Runtime", "TensorFlow", "PaddlePaddle"];

/* ── 主组件 ── */
export default function ChipList({ onOpenProfile }) {
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
      /* 用不带筛选的全量查询算统计（后端暂无 /chips/stats 接口） */
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
    } catch (_) {
      /* 统计失败不影响主流程 */
    }
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
      computePower: techSpec.computePower || "",
      memory: techSpec.memory || "",
      tdp: techSpec.tdp || "",
      driver: softwareStack.driver || "",
      sdk: softwareStack.sdk || "",
      frameworks: softwareStack.frameworks || [],
      tags: record.tags || "",
      remark: record.remark || "",
    });
    setCreateVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);

      const techSpec = JSON.stringify({
        computePower: values.computePower || "",
        memory: values.memory || "",
        tdp: values.tdp || "",
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
      if (e.errorFields) return; // 表单校验失败
      message.error("操作失败: " + (e.response?.data?.message || e.message));
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
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onOpenProfile ? onOpenProfile(record.id) : openDetail(record)} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          <Popconfirm title="确定删除该芯片?" onConfirm={() => handleDelete(record.id)} okText="删除" cancelText="取消">
            <Tooltip title="删除">
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
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
          <Card hoverable>
            <Statistic title="芯片总数" value={stats.total} prefix={<ExperimentOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable>
            <Statistic title="GPU" value={stats.gpu} valueStyle={{ color: "#1890ff" }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable>
            <Statistic title="NPU" value={stats.npu} valueStyle={{ color: "#52c41a" }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card hoverable>
            <Statistic title="评测中" value={stats.evaluating} valueStyle={{ color: "#faad14" }} />
          </Card>
        </Col>
      </Row>

      {/* 工具栏 + 表格 */}
      <Card
        title="芯片列表"
        extra={
          <Space>
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
            <Button icon={<ReloadOutlined />} onClick={() => { fetchChips(); fetchStats(); }}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增芯片</Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={chips}
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

      {/* 注册 / 编辑弹窗 */}
      <Modal
        title={editRecord ? "编辑芯片" : "注册芯片"}
        open={createVisible}
        onCancel={() => { setCreateVisible(false); form.resetFields(); }}
        onOk={handleSubmit}
        confirmLoading={submitLoading}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入芯片名称" }]}>
                <Input placeholder="如 NVIDIA A100" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="manufacturer" label="厂商" rules={[{ required: true, message: "请输入厂商" }]}>
                <Input placeholder="如 NVIDIA" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="chipType" label="类型" rules={[{ required: true, message: "请选择芯片类型" }]}>
            <Select placeholder="选择芯片类型">
              {CHIP_TYPES.map((t) => <Option key={t} value={t}>{CHIP_TYPE_LABELS[t]}</Option>)}
            </Select>
          </Form.Item>

          <Card size="small" title="技术规格（选填）" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="computePower" label="标称算力">
                  <Input placeholder="如 312 TFLOPS" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="memory" label="显存/内存">
                  <Input placeholder="如 80GB HBM2e" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="tdp" label="TDP功耗">
                  <Input placeholder="如 400W" />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card size="small" title="软件栈（选填）" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="driver" label="驱动版本">
                  <Input placeholder="如 535.129.03" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="sdk" label="SDK版本">
                  <Input placeholder="如 CUDA 12.2" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="frameworks" label="适配框架">
              <Select mode="multiple" placeholder="选择适配框架" allowClear>
                {FRAMEWORK_OPTIONS.map((f) => <Option key={f} value={f}>{f}</Option>)}
              </Select>
            </Form.Item>
          </Card>

          <Form.Item name="tags" label="标签">
            <Input placeholder="多个标签用逗号分隔" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <TextArea rows={3} placeholder="备注信息..." />
          </Form.Item>
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
              <Descriptions.Item label="标称算力">{tech.computePower || "-"}</Descriptions.Item>
              <Descriptions.Item label="显存/内存">{tech.memory || "-"}</Descriptions.Item>
              <Descriptions.Item label="TDP功耗">{tech.tdp || "-"}</Descriptions.Item>
              <Descriptions.Item label="驱动版本">{sw.driver || "-"}</Descriptions.Item>
              <Descriptions.Item label="SDK版本">{sw.sdk || "-"}</Descriptions.Item>
              <Descriptions.Item label="适配框架">
                {(sw.frameworks || []).length > 0
                  ? sw.frameworks.map((f) => <Tag key={f} color="blue">{f}</Tag>)
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
