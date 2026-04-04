/**
 * @file ResourcePoolList.js
 * @description 资源池管理页面 — 卡片展示+创建Modal+详情查看
 * Issue: #175 资源池管理与调度
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Row, Col, Button, Modal, Form, Input, Select, Tag, Space,
  Typography, Empty, Spin, message, Badge, Table, Descriptions, Statistic,
} from "antd";
import {
  PlusOutlined, CloudServerOutlined, ReloadOutlined,
  DeleteOutlined, EditOutlined, ArrowLeftOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text } = Typography;

const STATUS_COLORS = { ACTIVE: "green", INACTIVE: "default", MAINTENANCE: "orange" };
const STATUS_LABELS = { ACTIVE: "运行中", INACTIVE: "已停用", MAINTENANCE: "维护中" };
const TYPE_COLORS = { GPU: "blue", CPU: "orange", NPU: "green", MIXED: "purple", GENERAL: "cyan" };

export default function ResourcePoolList() {
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPool, setEditingPool] = useState(null);
  const [detailPool, setDetailPool] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchPools = useCallback(async () => {
    setLoading(true);
    try {
      const { data: resp } = await api.get("/resource-pools");
      if (resp.code === 0) setPools(resp.data || []);
    } catch (e) { message.error("获取资源池列表失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPools(); }, [fetchPools]);

  const fetchDetail = async (id) => {
    setDetailLoading(true);
    try {
      const { data: resp } = await api.get(`/resource-pools/${id}`);
      if (resp.code === 0) setDetailData(resp.data);
    } catch (e) { message.error("获取资源池详情失败"); }
    finally { setDetailLoading(false); }
  };

  const handleCreate = () => {
    setEditingPool(null);
    form.resetFields();
    form.setFieldsValue({ type: "GENERAL", status: "ACTIVE" });
    setModalVisible(true);
  };

  const handleEdit = (pool) => {
    setEditingPool(pool);
    form.setFieldsValue({ name: pool.name, type: pool.type, description: pool.description, status: pool.status });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = { ...values, capacity: "{}" };
      if (editingPool) {
        await api.put(`/resource-pools/${editingPool.id}`, payload);
        message.success("资源池更新成功");
      } else {
        await api.post("/resource-pools", payload);
        message.success("资源池创建成功");
      }
      setModalVisible(false);
      fetchPools();
    } catch (e) {
      if (e.response?.data?.message) message.error(e.response.data.message);
    }
  };

  const handleDelete = (pool) => {
    Modal.confirm({
      title: "确认删除",
      content: `确定要删除资源池「${pool.name}」吗？关联节点将被解绑。`,
      okType: "danger",
      onOk: async () => {
        try {
          await api.delete(`/resource-pools/${pool.id}`);
          message.success("资源池已删除");
          fetchPools();
        } catch (e) { message.error("删除失败"); }
      },
    });
  };

  const openDetail = (pool) => {
    setDetailPool(pool);
    fetchDetail(pool.id);
  };

  // Detail view
  if (detailPool) {
    const nodeColumns = [
      { title: "名称", dataIndex: "name", key: "name" },
      { title: "IP", dataIndex: "ipAddress", key: "ip" },
      {
        title: "状态", dataIndex: "status", key: "status",
        render: (s) => {
          const color = { ONLINE: "green", OFFLINE: "default", BUSY: "processing", ERROR: "red", MAINTENANCE: "orange" }[s] || "default";
          const label = { ONLINE: "在线", OFFLINE: "离线", BUSY: "繁忙", ERROR: "异常", MAINTENANCE: "维护" }[s] || s;
          return <Badge status={color} text={label} />;
        },
      },
      {
        title: "硬件", key: "hw",
        render: (_, record) => {
          let hw;
          try { hw = typeof record.hardwareInfo === "string" ? JSON.parse(record.hardwareInfo) : record.hardwareInfo; } catch { hw = null; }
          if (!hw) return <Text type="secondary">-</Text>;
          return (
            <Space size={4} wrap>
              {hw.cpu_model && <Tag style={{ fontSize: 11 }}>CPU {hw.cpu_threads || hw.cpu_cores_logical || "?"}核</Tag>}
              {hw.memory_total_gb && <Tag style={{ fontSize: 11 }}>内存 {Number(hw.memory_total_gb).toFixed(0)}GB</Tag>}
              {hw.gpu_count > 0 && <Tag color="blue" style={{ fontSize: 11 }}>GPU ×{hw.gpu_count}</Tag>}
            </Space>
          );
        },
      },
    ];

    return (
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={() => { setDetailPool(null); setDetailData(null); }} style={{ marginBottom: 16 }}>
          返回资源池列表
        </Button>
        <Card title={`资源池: ${detailPool.name}`} loading={detailLoading}>
          {detailData && (
            <>
              <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="名称">{detailData.name}</Descriptions.Item>
                <Descriptions.Item label="类型"><Tag color={TYPE_COLORS[detailData.type]}>{detailData.type}</Tag></Descriptions.Item>
                <Descriptions.Item label="状态"><Tag color={STATUS_COLORS[detailData.status]}>{STATUS_LABELS[detailData.status] || detailData.status}</Tag></Descriptions.Item>
                <Descriptions.Item label="描述" span={3}>{detailData.description || "-"}</Descriptions.Item>
              </Descriptions>
              <Title level={5}>关联节点 ({(detailData.nodes || []).length})</Title>
              <Table dataSource={detailData.nodes || []} columns={nodeColumns} rowKey="id" size="small" pagination={false} />
            </>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>资源池管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchPools}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>创建资源池</Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        {pools.length === 0 && !loading ? (
          <Empty description="暂无资源池">
            <Button type="primary" onClick={handleCreate}>创建第一个资源池</Button>
          </Empty>
        ) : (
          <Row gutter={[16, 16]}>
            {pools.map(pool => (
              <Col xs={24} sm={12} lg={8} key={pool.id}>
                <Card hoverable
                  onClick={() => openDetail(pool)}
                  actions={[
                    <EditOutlined key="edit" onClick={(e) => { e.stopPropagation(); handleEdit(pool); }} />,
                    <DeleteOutlined key="delete" onClick={(e) => { e.stopPropagation(); handleDelete(pool); }} />,
                  ]}>
                  <div style={{ marginBottom: 12 }}>
                    <Space style={{ width: "100%", justifyContent: "space-between" }}>
                      <Space>
                        <CloudServerOutlined style={{ fontSize: 18, color: "#1890ff" }} />
                        <Text strong style={{ fontSize: 16 }}>{pool.name}</Text>
                      </Space>
                      <Tag color={STATUS_COLORS[pool.status]}>{STATUS_LABELS[pool.status] || pool.status}</Tag>
                    </Space>
                  </div>
                  <Text type="secondary" style={{ display: "block", marginBottom: 12, minHeight: 22 }}>
                    {pool.description || "无描述"}
                  </Text>
                  <Tag color={TYPE_COLORS[pool.type]} style={{ marginBottom: 12 }}>{pool.type}</Tag>
                  <Row gutter={8}>
                    <Col span={6}><Statistic title="节点" value={pool.nodeCount || 0} valueStyle={{ fontSize: 18 }} /></Col>
                    <Col span={6}><Statistic title="CPU" value={pool.totalCpu || 0} suffix="核" valueStyle={{ fontSize: 18 }} /></Col>
                    <Col span={6}><Statistic title="内存" value={pool.totalMemoryGb || 0} suffix="GB" valueStyle={{ fontSize: 18 }} /></Col>
                    <Col span={6}><Statistic title="GPU" value={pool.totalGpu || 0} valueStyle={{ fontSize: 18 }} /></Col>
                  </Row>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Spin>

      <Modal title={editingPool ? "编辑资源池" : "创建资源池"} open={modalVisible}
        onOk={handleSubmit} onCancel={() => setModalVisible(false)} okText="确认" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="资源池名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="如: GPU高性能池" />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select options={[
              { value: "GPU", label: "GPU" },
              { value: "CPU", label: "CPU" },
              { value: "NPU", label: "NPU" },
              { value: "MIXED", label: "混合" },
              { value: "GENERAL", label: "通用" },
            ]} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="资源池用途说明" />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={[
              { value: "ACTIVE", label: "运行中" },
              { value: "INACTIVE", label: "已停用" },
              { value: "MAINTENANCE", label: "维护中" },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
