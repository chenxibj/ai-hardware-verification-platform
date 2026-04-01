import React, { useState, useEffect } from "react";
import { Card, Table, Tag, Space, Button, Row, Col, Statistic, Modal, Form, Input, Select, InputNumber, message, Badge, Descriptions, Tooltip, Progress, Switch, Typography } from "antd";
import { CloudServerOutlined, PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, StopOutlined, DesktopOutlined, HddOutlined, ApiOutlined, ThunderboltOutlined, WarningOutlined } from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import api from "../utils/api";
import dayjs from "dayjs";
const { Text } = Typography;

const TYPE_MAP = { CPU: "CPU", GPU: "GPU/NPU", MEMORY: "内存", STORAGE: "存储" };
const TYPE_COLORS = { CPU: "blue", GPU: "purple", MEMORY: "cyan", STORAGE: "orange" };
const STATUS_MAP = { ONLINE: "在线", OFFLINE: "离线", BUSY: "使用中", MAINTENANCE: "维护中", ERROR: "异常" };
const STATUS_BADGE = { ONLINE: "success", OFFLINE: "default", BUSY: "processing", MAINTENANCE: "warning", ERROR: "error" };

const VENDOR_OPTIONS = [
  { value: "HUAWEI", label: "华为" }, { value: "CAMBRICON", label: "寒武纪" },
  { value: "HYGON", label: "海光" }, { value: "BIREN", label: "壁仞" },
  { value: "INTEL", label: "Intel" }, { value: "AMD", label: "AMD" },
  { value: "OTHER", label: "其他" },
];

const MODEL_OPTIONS = {
  GPU: [
    { value: "Ascend 910B", label: "华为昇腾 910B" }, { value: "Ascend 910C", label: "华为昇腾 910C" },
    { value: "MLU590", label: "寒武纪 MLU590" }, { value: "DCU Z100", label: "海光 DCU Z100" },
    { value: "BR100", label: "壁仞 BR100" },
  ],
  CPU: [
    { value: "Kunpeng 920", label: "鲲鹏 920" }, { value: "Hygon C86", label: "海光 C86" },
    { value: "Phytium D2000", label: "飞腾 D2000" }, { value: "Intel Xeon", label: "Intel Xeon" },
  ],
};

export default function Resources() {
  const [resources, setResources] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([api.get("/resources", { params: { size: 100 } }), api.get("/resources/stats")]);
      if (r1.data.code === 0) setResources(r1.data.data || []);
      if (r2.data.code === 0) setStats(r2.data.data || {});
    } catch (e) { message.error("获取资源失败"); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  const handleCreate = async (values) => {
    try {
      const r = await api.post("/resources", values);
      if (r.data.code === 0) { message.success("资源添加成功"); setModalVisible(false); form.resetFields(); fetchData(); }
      else message.error(r.data.message || "添加失败");
    } catch (e) { message.error("添加失败"); }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.put("/resources/" + id + "/status", { status });
      message.success("状态已更新"); fetchData();
    } catch (e) { message.error("更新失败"); }
  };

  const handleDelete = (id) => {
    Modal.confirm({ title: "确定删除此资源？", okType: "danger", onOk: () => api.delete("/resources/" + id).then(() => { message.success("已删除"); fetchData(); }) });
  };

  const utilizationOption = {
    tooltip: { trigger: "axis" },
    legend: { data: ["CPU利用率", "GPU利用率", "内存利用率"], bottom: 0 },
    xAxis: { type: "category", data: Array.from({ length: 12 }, (_, i) => dayjs().subtract(11 - i, "hour").format("HH:00")) },
    yAxis: { type: "value", name: "%", max: 100 },
    series: [
      { name: "CPU利用率", type: "line", smooth: true, data: Array.from({ length: 12 }, () => Math.floor(20 + Math.random() * 50)), itemStyle: { color: "#1890ff" }, areaStyle: { opacity: 0.05 } },
      { name: "GPU利用率", type: "line", smooth: true, data: Array.from({ length: 12 }, () => Math.floor(30 + Math.random() * 60)), itemStyle: { color: "#722ed1" }, areaStyle: { opacity: 0.05 } },
      { name: "内存利用率", type: "line", smooth: true, data: Array.from({ length: 12 }, () => Math.floor(40 + Math.random() * 40)), itemStyle: { color: "#52c41a" }, areaStyle: { opacity: 0.05 } },
    ],
  };

  const columns = [
    { title: "编号", dataIndex: "resourceNo", width: 160, ellipsis: true },
    { title: "名称", dataIndex: "name", width: 160 },
    { title: "类型", dataIndex: "resourceType", width: 80, render: v => <Tag color={TYPE_COLORS[v] || "default"}>{TYPE_MAP[v] || v}</Tag> },
    { title: "型号", dataIndex: "model", width: 140 },
    { title: "厂商", dataIndex: "vendor", width: 80 },
    { title: "状态", dataIndex: "status", width: 90, render: v => <Badge status={STATUS_BADGE[v] || "default"} text={STATUS_MAP[v] || v} /> },
    { title: "总量", dataIndex: "totalCount", width: 60 },
    { title: "可用", dataIndex: "availableCount", width: 60, render: (v, r) => <Text type={v === 0 ? "danger" : v < r.totalCount ? "warning" : "success"}>{v}</Text> },
    { title: "利用率", key: "util", width: 100, render: (_, r) => { const u = r.totalCount > 0 ? Math.round((1 - r.availableCount / r.totalCount) * 100) : 0; return <Progress percent={u} size="small" strokeColor={u > 80 ? "#ff4d4f" : u > 50 ? "#faad14" : "#52c41a"} />; } },
    { title: "资源池", dataIndex: "poolName", width: 100, ellipsis: true },
    { title: "操作", key: "action", width: 180, render: (_, r) => (
      <Space size={2}>
        {r.status === "ONLINE" && <Button type="link" size="small" onClick={() => handleStatusChange(r.id, "MAINTENANCE")} icon={<StopOutlined />}>维护</Button>}
        {r.status === "MAINTENANCE" && <Button type="link" size="small" onClick={() => handleStatusChange(r.id, "ONLINE")} icon={<CheckCircleOutlined />}>上线</Button>}
        {r.status === "OFFLINE" && <Button type="link" size="small" onClick={() => handleStatusChange(r.id, "ONLINE")} icon={<CheckCircleOutlined />}>上线</Button>}
        <Button type="link" size="small" danger onClick={() => handleDelete(r.id)} icon={<DeleteOutlined />}>删除</Button>
      </Space>
    ) },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {[["资源总数", stats.total || 0, <CloudServerOutlined />, "#1890ff"],
          ["在线", stats.online || 0, <CheckCircleOutlined />, "#52c41a"],
          ["使用中", stats.busy || 0, <ThunderboltOutlined />, "#722ed1"],
          ["离线/维护", (stats.offline || 0) + (stats.maintenance || 0), <WarningOutlined />, "#faad14"]
        ].map(([t, v, icon, color], i) => (
          <Col span={6} key={i}><Card size="small"><Statistic title={t} value={v} prefix={React.cloneElement(icon, { style: { color } })} valueStyle={{ color }} /></Card></Col>
        ))}
      </Row>

      <Card title="资源利用率趋势（近12小时）" size="small" style={{ marginBottom: 16 }}>
        <ReactECharts option={utilizationOption} style={{ height: 250 }} />
      </Card>

      <Card title="计算资源列表" size="small" extra={<Space>
        <Button onClick={fetchData} icon={<ReloadOutlined />}>刷新</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>添加资源</Button>
      </Space>}>
        <Table columns={columns} dataSource={resources} rowKey="id" loading={loading} size="small" scroll={{ x: 1200 }} pagination={{ pageSize: 15, showTotal: t => "共 " + t + " 条" }} />
      </Card>

      <Modal title="添加计算资源" open={modalVisible} onCancel={() => { setModalVisible(false); form.resetFields(); }} onOk={() => form.submit()} width={600}>
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Row gutter={16}>
            <Col span={12}><Form.Item name="name" label="资源名称" rules={[{ required: true }]}><Input placeholder="如：昇腾910B集群-A" /></Form.Item></Col>
            <Col span={12}><Form.Item name="resourceType" label="资源类型" rules={[{ required: true }]}><Select options={Object.entries(TYPE_MAP).map(([k, v]) => ({ value: k, label: v }))} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="vendor" label="厂商"><Select options={VENDOR_OPTIONS} placeholder="选择厂商" /></Form.Item></Col>
            <Col span={12}>
              <Form.Item noStyle shouldUpdate={(prev, cur) => prev.resourceType !== cur.resourceType}>
                {({ getFieldValue }) => <Form.Item name="model" label="型号"><Select options={MODEL_OPTIONS[getFieldValue("resourceType")] || []} placeholder="选择型号" allowClear showSearch /></Form.Item>}
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="totalCount" label="数量" initialValue={1}><InputNumber min={1} max={1000} style={{ width: "100%" }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="poolName" label="资源池"><Input placeholder="如：GPU-Pool-01" /></Form.Item></Col>
            <Col span={8}><Form.Item name="specs" label="规格参数"><Input placeholder="如：32GB HBM" /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
