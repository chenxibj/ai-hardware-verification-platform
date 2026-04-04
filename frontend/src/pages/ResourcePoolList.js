/**
 * @file ResourcePoolList.js
 * @description 资源池管理 — 列表 + 创建/编辑弹窗 + 节点分配
 * @feat #175 资源池管理与调度 (US-5.2)
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Tag, Badge, Button, Space, Input, Select, Modal, Form,
  Typography, Tooltip, message, Transfer, Descriptions, Popconfirm
} from "antd";
import {
  PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined,
  EyeOutlined, CloudServerOutlined, NodeIndexOutlined
} from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";

const { Text } = Typography;

const STRATEGY_MAP = {
  round_robin: { text: "轮询调度", color: "blue" },
  least_loaded: { text: "最小负载", color: "green" },
  priority: { text: "优先级", color: "orange" },
  affinity: { text: "亲和性", color: "purple" },
};

const STATUS_MAP = {
  ACTIVE: { text: "活跃", badge: "success" },
  INACTIVE: { text: "未激活", badge: "default" },
  MAINTENANCE: { text: "维护中", badge: "warning" },
};

export default function ResourcePoolList() {
  const [pools, setPools] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [assignVisible, setAssignVisible] = useState(false);
  const [editingPool, setEditingPool] = useState(null);
  const [assigningPool, setAssigningPool] = useState(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchPools = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/resource-pools");
      if (res.data.code === 0) setPools(res.data.data || []);
    } catch (err) {
      message.error("获取资源池列表失败");
    }
    setLoading(false);
  }, []);

  const fetchNodes = useCallback(async () => {
    try {
      const res = await api.get("/nodes");
      if (res.data.code === 0) setNodes(res.data.data || []);
    } catch (err) {}
  }, []);

  useEffect(() => { fetchPools(); fetchNodes(); }, [fetchPools, fetchNodes]);

  const parseCap = (capStr) => {
    if (!capStr) return {};
    try { return typeof capStr === "string" ? JSON.parse(capStr) : capStr; } catch { return {}; }
  };

  const handleCreate = () => {
    setEditingPool(null);
    form.resetFields();
    form.setFieldsValue({ strategy: "round_robin" });
    setModalVisible(true);
  };

  const handleEdit = (pool) => {
    setEditingPool(pool);
    const cap = parseCap(pool.capacity);
    form.setFieldsValue({
      name: pool.name,
      description: pool.description,
      strategy: cap.strategy || pool.type || "round_robin",
      tenantBinding: cap.tenant_binding,
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = {
        name: values.name,
        description: values.description,
        strategy: values.strategy,
        tenantBinding: values.tenantBinding || null,
      };

      if (editingPool) {
        await api.put(`/resource-pools/${editingPool.id}`, payload);
        message.success("资源池已更新");
      } else {
        await api.post("/resource-pools", payload);
        message.success("资源池创建成功");
      }
      setModalVisible(false);
      form.resetFields();
      fetchPools();
    } catch (err) {
      if (err.response?.data?.message) message.error(err.response.data.message);
    }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/resource-pools/${id}`);
      message.success("资源池已删除");
      fetchPools();
    } catch { message.error("删除失败"); }
  };

  const handleAssignNodes = (pool) => {
    setAssigningPool(pool);
    const cap = parseCap(pool.capacity);
    const nodeIds = (cap.node_ids || []).map(id => Number(id));
    setSelectedNodeIds(nodeIds);
    setAssignVisible(true);
  };

  const handleAssignSubmit = async () => {
    try {
      setSubmitting(true);
      await api.post(`/resource-pools/${assigningPool.id}/nodes`, { nodeIds: selectedNodeIds });
      message.success("节点分配成功");
      setAssignVisible(false);
      fetchPools();
    } catch (err) {
      message.error("节点分配失败");
    }
    setSubmitting(false);
  };

  const columns = [
    {
      title: "名称", dataIndex: "name", width: 160,
      render: (text) => <><CloudServerOutlined style={{ marginRight: 4 }} />{text}</>,
    },
    {
      title: "调度策略", width: 120,
      render: (_, record) => {
        const cap = parseCap(record.capacity);
        const strategy = cap.strategy || record.type || "round_robin";
        const info = STRATEGY_MAP[strategy] || { text: strategy, color: "default" };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: "节点数", width: 80,
      render: (_, record) => {
        const cap = parseCap(record.capacity);
        const count = (cap.node_ids || []).length;
        return <Tag color={count > 0 ? "blue" : "default"}>{count} 个</Tag>;
      },
    },
    {
      title: "绑定租户", width: 100,
      render: (_, record) => {
        const cap = parseCap(record.capacity);
        return cap.tenant_binding ? <Tag color="cyan">租户 #{cap.tenant_binding}</Tag> : <Text type="secondary">无</Text>;
      },
    },
    {
      title: "状态", dataIndex: "status", width: 90,
      render: (v) => {
        const info = STATUS_MAP[v] || { text: v, badge: "default" };
        return <Badge status={info.badge} text={info.text} />;
      },
    },
    {
      title: "创建时间", dataIndex: "createdAt", width: 160,
      render: v => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-",
    },
    {
      title: "操作", width: 200,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="分配节点">
            <Button type="text" size="small" icon={<NodeIndexOutlined />} onClick={() => handleAssignNodes(record)} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm title="确定删除此资源池？" onConfirm={() => handleDelete(record.id)}>
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Transfer data source for node assignment
  const transferData = nodes.map(n => ({
    key: n.id,
    title: `${n.name} (${n.ipAddress || "未知IP"})`,
    description: n.status,
    disabled: false,
  }));

  return (
    <div>
      <Card
        title={<Space><CloudServerOutlined /><span>资源池管理</span><Tag color="blue">{pools.length} 个资源池</Tag></Space>}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchPools}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>创建资源池</Button>
          </Space>
        }
      >
        <Table columns={columns} dataSource={pools} rowKey="id" loading={loading}
          pagination={{ pageSize: 20, showTotal: t => `共 ${t} 个资源池` }} size="middle" />
      </Card>

      {/* 创建/编辑弹窗 */}
      <Modal title={editingPool ? "编辑资源池" : "创建资源池"} open={modalVisible}
        onOk={handleSubmit} onCancel={() => setModalVisible(false)}
        confirmLoading={submitting} width={520}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="资源池名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="如: GPU高性能池" />
          </Form.Item>
          <Form.Item name="strategy" label="调度策略" rules={[{ required: true }]}>
            <Select options={Object.entries(STRATEGY_MAP).map(([k, v]) => ({ value: k, label: v.text }))} />
          </Form.Item>
          <Form.Item name="tenantBinding" label="绑定租户ID">
            <Input type="number" placeholder="可选，绑定租户ID" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="资源池描述" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 节点分配弹窗 */}
      <Modal title={`分配节点 — ${assigningPool?.name || ""}`} open={assignVisible}
        onOk={handleAssignSubmit} onCancel={() => setAssignVisible(false)}
        confirmLoading={submitting} width={700}>
        <Transfer
          dataSource={transferData}
          targetKeys={selectedNodeIds}
          onChange={setSelectedNodeIds}
          render={item => item.title}
          titles={["可用节点", "已分配"]}
          showSearch
          listStyle={{ width: 280, height: 400 }}
        />
      </Modal>
    </div>
  );
}
