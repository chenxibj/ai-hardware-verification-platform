import React, { useState, useEffect } from "react";
import { Card, Table, Tag, Space, Button, Modal, Form, Input, Select, message, Descriptions, Typography, Tooltip, Row, Col, Popconfirm, Empty, Badge } from "antd";
import { AppstoreOutlined, PlusOutlined, ReloadOutlined, EyeOutlined, EditOutlined, DeleteOutlined, CopyOutlined, ThunderboltOutlined, ExperimentOutlined, RocketOutlined, ApiOutlined } from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";
const { TextArea } = Input;
const { Text, Paragraph } = Typography;

const EVAL_TYPES = { PERFORMANCE:"性能评测", ACCURACY:"精度评测", COMPATIBILITY:"兼容性评测", STABILITY:"稳定性评测", GENERAL:"通用评测" };
const EVAL_DIMENSIONS = { OPERATOR:"算子评测", CHIP:"芯片评测", MODEL:"模型评测", FRAMEWORK:"框架评测", MIDDLEWARE:"中间层评测", SCENE:"场景评测" };
const DIMENSION_ICONS = { OPERATOR: <AppstoreOutlined/>, MODEL: <RocketOutlined/>, CHIP: <ThunderboltOutlined/>, FRAMEWORK: <ApiOutlined/>, SCENE: <ExperimentOutlined/> };

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form] = Form.useForm();

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const r = await api.get("/templates");
      if (r.data.code === 0) setTemplates(r.data.data || []);
    } catch (e) { message.error("获取模板列表失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const parseConfig = (configJson) => {
    try { return JSON.parse(configJson || "{}"); } catch { return {}; }
  };

  const handleDelete = async (id) => {
    try {
      const r = await api.delete(`/templates/${id}`);
      if (r.data.code === 0) { message.success("已删除"); fetchTemplates(); }
      else message.error(r.data.message || "删除失败");
    } catch (e) { message.error("删除失败"); }
  };

  const handleClone = async (record) => {
    const config = parseConfig(record.configJson);
    try {
      const r = await api.post("/templates", {
        name: record.name + " (副本)",
        description: record.description,
        evalType: record.evalType,
        configJson: record.configJson,
      });
      if (r.data.code === 0) { message.success("克隆成功"); fetchTemplates(); }
      else message.error(r.data.message || "克隆失败");
    } catch (e) { message.error("克隆失败"); }
  };

  const handleCreate = async (values) => {
    try {
      const config = { evalDimension: values.evalDimension || "", evalObject: values.evalDimension || "" };
      const r = await api.post("/templates", {
        name: values.name,
        description: values.description,
        evalType: values.evalType,
        configJson: JSON.stringify(config),
      });
      if (r.data.code === 0) { message.success("创建成功"); setEditVisible(false); form.resetFields(); fetchTemplates(); }
      else message.error(r.data.message || "创建失败");
    } catch (e) { message.error("创建失败"); }
  };

  const handleUpdate = async (values) => {
    if (!selected) return;
    try {
      const existingConfig = parseConfig(selected.configJson);
      const config = { ...existingConfig, evalDimension: values.evalDimension || existingConfig.evalDimension };
      const r = await api.put(`/templates/${selected.id}`, {
        name: values.name,
        description: values.description,
        evalType: values.evalType,
        configJson: JSON.stringify(config),
      });
      if (r.data.code === 0) { message.success("更新成功"); setEditVisible(false); setSelected(null); form.resetFields(); fetchTemplates(); }
      else message.error(r.data.message || "更新失败");
    } catch (e) { message.error("更新失败"); }
  };

  const openEdit = (record) => {
    const config = parseConfig(record.configJson);
    setSelected(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      evalType: record.evalType,
      evalDimension: config.evalDimension || config.evalObject || "",
    });
    setEditVisible(true);
  };

  const openCreate = () => {
    setSelected(null);
    form.resetFields();
    setEditVisible(true);
  };

  const renderConfigDetail = (configJson) => {
    const config = parseConfig(configJson);
    const entries = Object.entries(config).filter(([k]) => !["evalDimension", "evalObject"].includes(k));
    if (entries.length === 0) return <Text type="secondary">无额外配置</Text>;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {entries.map(([key, value]) => (
          <Tag key={key} style={{ marginBottom: 4 }}>
            <Text strong style={{ fontSize: 12 }}>{key}: </Text>
            <Text style={{ fontSize: 12 }}>{Array.isArray(value) ? value.join(", ") : String(value)}</Text>
          </Tag>
        ))}
      </div>
    );
  };

  const columns = [
    {
      title: "模板名称", dataIndex: "name", width: 260, render: (v, r) => (
        <Space>
          {DIMENSION_ICONS[parseConfig(r.configJson).evalDimension] || <AppstoreOutlined />}
          <span style={{ fontWeight: 500 }}>{v}</span>
          {r.isSystem && <Tag color="purple" style={{ fontSize: 11 }}>📦 系统预置</Tag>}
        </Space>
      ),
    },
    { title: "评测类型", dataIndex: "evalType", width: 110, render: v => <Tag color="blue">{EVAL_TYPES[v] || v}</Tag> },
    {
      title: "评测维度", key: "dimension", width: 110, render: (_, r) => {
        const d = parseConfig(r.configJson).evalDimension;
        return d ? <Tag>{EVAL_DIMENSIONS[d] || d}</Tag> : <Text type="secondary">-</Text>;
      },
    },
    { title: "描述", dataIndex: "description", ellipsis: true },
    {
      title: "配置预览", key: "config", width: 200, render: (_, r) => {
        const config = parseConfig(r.configJson);
        const operators = config.operators;
        const models = config.models;
        if (operators) return <Text type="secondary" style={{ fontSize: 12 }}>{operators.length} 个算子 · {config.iterations || 0} 次迭代</Text>;
        if (models) return <Text type="secondary" style={{ fontSize: 12 }}>{models.length} 个模型 · batch {(config.batch_sizes || []).join("/")}</Text>;
        return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>;
      },
    },
    { title: "创建时间", dataIndex: "createdAt", width: 140, render: v => v ? dayjs(v).format("MM-DD HH:mm") : "-" },
    {
      title: "操作", key: "action", width: 180, render: (_, r) => (
        <Space size={2}>
          <Tooltip title="查看详情"><Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setSelected(r); setDetailVisible(true); }} /></Tooltip>
          <Tooltip title="克隆"><Button type="link" size="small" icon={<CopyOutlined />} onClick={() => handleClone(r)} /></Tooltip>
          {!r.isSystem && <>
            <Tooltip title="编辑"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
            <Popconfirm title="确定删除该模板？" okText="删除" okType="danger" cancelText="取消" onConfirm={() => handleDelete(r.id)}>
              <Tooltip title="删除"><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Tooltip>
            </Popconfirm>
          </>}
        </Space>
      ),
    },
  ];

  const systemTemplates = templates.filter(t => t.isSystem);
  const userTemplates = templates.filter(t => !t.isSystem);

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {systemTemplates.map(t => {
          const config = parseConfig(t.configJson);
          const dim = config.evalDimension || config.evalObject;
          return (
            <Col span={8} key={t.id}>
              <Card hoverable size="small" style={{ borderLeft: "3px solid #1890ff" }}
                actions={[
                  <Tooltip title="查看详情"><EyeOutlined key="view" onClick={() => { setSelected(t); setDetailVisible(true); }} /></Tooltip>,
                  <Tooltip title="克隆为自定义模板"><CopyOutlined key="clone" onClick={() => handleClone(t)} /></Tooltip>,
                ]}>
                <Card.Meta
                  avatar={<div style={{ fontSize: 28, color: "#1890ff" }}>{DIMENSION_ICONS[dim] || <AppstoreOutlined />}</div>}
                  title={<Space>{t.name}<Tag color="purple" style={{ fontSize: 10 }}>📦 系统</Tag></Space>}
                  description={<>
                    <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 8, fontSize: 13 }}>{t.description}</Paragraph>
                    <Space size={4} wrap>
                      <Tag color="blue">{EVAL_TYPES[t.evalType] || t.evalType}</Tag>
                      {dim && <Tag>{EVAL_DIMENSIONS[dim] || dim}</Tag>}
                      {config.operators && <Tag color="cyan">{config.operators.length} 算子</Tag>}
                      {config.models && <Tag color="green">{config.models.length} 模型</Tag>}
                      {config.priority && <Tag>{config.priority === "LOW" ? "低优先级" : config.priority === "HIGH" ? "高优先级" : "中优先级"}</Tag>}
                    </Space>
                  </>}
                />
              </Card>
            </Col>
          );
        })}
      </Row>

      <Card title={<span><AppstoreOutlined style={{ marginRight: 8 }} />全部模板 <Badge count={templates.length} style={{ backgroundColor: "#1890ff", marginLeft: 8 }} /></span>}
        extra={<Space>
          <Button onClick={fetchTemplates} icon={<ReloadOutlined />}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建模板</Button>
        </Space>}>
        <Table columns={columns} dataSource={templates} rowKey="id" loading={loading}
          pagination={{ pageSize: 10, showTotal: t => `共 ${t} 条` }} />
      </Card>

      {/* Detail Modal */}
      <Modal title="模板详情" open={detailVisible} onCancel={() => setDetailVisible(false)} footer={null} width={700}>
        {selected && (() => {
          const config = parseConfig(selected.configJson);
          return (
            <div>
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="名称" span={2}>
                  <Space>{selected.name} {selected.isSystem && <Tag color="purple">📦 系统预置</Tag>}</Space>
                </Descriptions.Item>
                <Descriptions.Item label="评测类型"><Tag color="blue">{EVAL_TYPES[selected.evalType] || selected.evalType}</Tag></Descriptions.Item>
                <Descriptions.Item label="评测维度"><Tag>{EVAL_DIMENSIONS[config.evalDimension] || config.evalDimension || "-"}</Tag></Descriptions.Item>
                <Descriptions.Item label="描述" span={2}>{selected.description || "-"}</Descriptions.Item>
                <Descriptions.Item label="创建时间">{selected.createdAt ? dayjs(selected.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Descriptions.Item>
                <Descriptions.Item label="更新时间">{selected.updatedAt ? dayjs(selected.updatedAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 16 }}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>配置参数：</Text>
                {renderConfigDetail(selected.configJson)}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Edit/Create Modal */}
      <Modal title={selected ? "编辑模板" : "新建模板"} open={editVisible} onCancel={() => { setEditVisible(false); setSelected(null); form.resetFields(); }}
        onOk={() => form.submit()} okText={selected ? "保存" : "创建"}>
        <Form form={form} layout="vertical" onFinish={selected ? handleUpdate : handleCreate}>
          <Form.Item name="name" label="模板名称" rules={[{ required: true, message: "请输入模板名称" }]}>
            <Input placeholder="例：GPU 性能基准评测" maxLength={100} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="evalDimension" label="评测维度">
                <Select placeholder="选择评测维度" allowClear options={Object.entries(EVAL_DIMENSIONS).map(([k, v]) => ({ value: k, label: v }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="evalType" label="评测类型" rules={[{ required: true, message: "请选择评测类型" }]}>
                <Select placeholder="选择评测类型" options={Object.entries(EVAL_TYPES).map(([k, v]) => ({ value: k, label: v }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="描述模板用途" maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
