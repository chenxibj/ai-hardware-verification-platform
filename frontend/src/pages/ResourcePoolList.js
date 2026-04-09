/**
 * @file ResourcePoolList.js
 * @description 资源池管理页面 — 卡片展示+CRUD+节点绑定/解绑 (#175, #250)
 * @feat #175, #250
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Row, Col, Button, Modal, Form, Input, Select, Tag, Space,
  Typography, Empty, Spin, message, Badge, Table, Descriptions, Statistic,
  Tooltip, Popconfirm, Transfer,
} from "antd";
import {
  PlusOutlined, CloudServerOutlined, ReloadOutlined,
  DeleteOutlined, EditOutlined, ArrowLeftOutlined,
  ClusterOutlined, LinkOutlined, DisconnectOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text } = Typography;

const STATUS_COLORS = { ACTIVE: "green", INACTIVE: "default", MAINTENANCE: "orange" };
const STATUS_LABELS = { ACTIVE: "运行中", INACTIVE: "已停用", MAINTENANCE: "维护中" };
const TYPE_COLORS = { GPU: "blue", CPU: "orange", NPU: "green", MIXED: "purple", GENERAL: "cyan", COMPUTE: "geekblue", K8S_POOL: "volcano" };

const NODE_STATUS_BADGE = {
  ONLINE: "success", OFFLINE: "default", BUSY: "processing", ERROR: "error", MAINTENANCE: "warning"
};
const NODE_STATUS_LABEL = {
  ONLINE: "在线", OFFLINE: "离线", BUSY: "繁忙", ERROR: "异常", MAINTENANCE: "维护"
};

export default function ResourcePoolList() {
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPool, setEditingPool] = useState(null);
  const [detailPool, setDetailPool] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // #250: 节点绑定
  const [bindModalVisible, setBindModalVisible] = useState(false);
  const [allNodes, setAllNodes] = useState([]);
  const [nodesLoading, setNodesLoading] = useState(false);

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

  const fetchAllNodes = async () => {
    setNodesLoading(true);
    try {
      const { data: resp } = await api.get("/nodes");
      if (resp.code === 0) setAllNodes(resp.data || []);
    } catch (e) { message.error("获取节点列表失败"); }
    finally { setNodesLoading(false); }
  };

  const handleCreate = () => {
    setEditingPool(null);
    form.resetFields();
    form.setFieldsValue({ type: "COMPUTE", status: "ACTIVE" });
    setModalVisible(true);
  };

  const handleEdit = (pool) => {
    setEditingPool(pool);
    form.setFieldsValue({
      name: pool.name,
      type: pool.type,
      description: pool.description,
      status: pool.status,
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
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
    } finally { setSubmitting(false); }
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

  // #250: 绑定节点
  const handleOpenBind = () => {
    fetchAllNodes();
    setBindModalVisible(true);
  };

  const handleBindNode = async (nodeId) => {
    if (!detailPool) return;
    try {
      // 通过更新节点的 resourcePoolId 来绑定
      const node = allNodes.find(n => n.id === nodeId);
      if (!node) return;
      await api.put(`/nodes/${nodeId}`, {
        name: node.name,
        ipAddress: node.ipAddress,
        agentPort: node.agentPort,
        description: node.description,
        tags: node.tags,
        resourcePoolId: detailPool.id,
      });
      message.success(`节点 ${node.name} 已绑定到资源池`);
      fetchDetail(detailPool.id);
      fetchAllNodes();
      fetchPools();
    } catch (e) {
      message.error("绑定失败: " + (e.response?.data?.message || e.message));
    }
  };

  const handleUnbindNode = async (nodeId) => {
    const node = (detailData?.nodes || []).find(n => n.id === nodeId);
    if (!node) return;
    try {
      await api.put(`/nodes/${nodeId}`, {
        name: node.name,
        ipAddress: node.ipAddress,
        agentPort: node.agentPort,
        description: node.description,
        tags: node.tags,
        resourcePoolId: null,
      });
      message.success(`节点 ${node.name} 已从资源池移除`);
      fetchDetail(detailPool.id);
      fetchPools();
    } catch (e) {
      message.error("解绑失败: " + (e.response?.data?.message || e.message));
    }
  };

  // Detail view
  if (detailPool) {
    const nodeColumns = [
      { title: "名称", dataIndex: "name", key: "name",
        render: (text) => <Space><ClusterOutlined /><Text strong>{text}</Text></Space>
      },
      { title: "IP", dataIndex: "ipAddress", key: "ip",
        render: (ip, record) => <Text copyable={{ text: ip }}>{ip}{record.agentPort ? `:${record.agentPort}` : ""}</Text>
      },
      {
        title: "状态", dataIndex: "status", key: "status",
        render: (s) => <Badge status={NODE_STATUS_BADGE[s] || "default"} text={NODE_STATUS_LABEL[s] || s} />,
      },
      {
        title: "硬件", key: "hw",
        render: (_, record) => {
          let hw;
          try { hw = typeof record.hardwareInfo === "string" ? JSON.parse(record.hardwareInfo) : record.hardwareInfo; } catch { hw = null; }
          if (!hw) return <Text type="secondary">-</Text>;
          return (
            <Space size={4} wrap>
              {hw.cpu_cores_logical && <Tag style={{ fontSize: 11 }}>CPU {hw.cpu_cores_logical}核</Tag>}
              {hw.memory_total_gb && <Tag style={{ fontSize: 11 }}>内存 {Number(hw.memory_total_gb).toFixed(0)}GB</Tag>}
              {hw.gpu_count > 0 && <Tag color="blue" style={{ fontSize: 11 }}>GPU ×{hw.gpu_count}</Tag>}
            </Space>
          );
        },
      },
      {
        title: "最后心跳", dataIndex: "lastHeartbeat", key: "heartbeat",
        render: (v) => v ? <Text type="secondary" style={{ fontSize: 12 }}>{new Date(v).toLocaleString("zh-CN")}</Text> : <Text type="secondary">从未</Text>,
      },
      {
        title: "操作", key: "action", width: 80,
        render: (_, record) => (
          <Popconfirm title={`确定将节点 "${record.name}" 从资源池移除？`} onConfirm={() => handleUnbindNode(record.id)}>
            <Tooltip title="移除">
              <Button type="text" size="small" danger icon={<DisconnectOutlined />} />
            </Tooltip>
          </Popconfirm>
        ),
      },
    ];

    // 可绑定的节点（未分配到任何池，或分配到当前池）
    const availableNodes = allNodes.filter(n =>
      !n.resourcePoolId || n.resourcePoolId === detailPool.id
    ).filter(n =>
      // 排除已在当前池中的节点
      !(detailData?.nodes || []).some(dn => dn.id === n.id)
    );

    return (
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={() => { setDetailPool(null); setDetailData(null); }} style={{ marginBottom: 16 }}>
          返回资源池列表
        </Button>
        <Card
          title={
            <Space>
              <CloudServerOutlined style={{ color: "#1890ff" }} />
              <span>资源池: {detailPool.name}</span>
              <Tag color={STATUS_COLORS[detailPool.status]}>{STATUS_LABELS[detailPool.status] || detailPool.status}</Tag>
            </Space>
          }
          loading={detailLoading}
          extra={
            <Space>
              <Button icon={<EditOutlined />} onClick={() => handleEdit(detailPool)}>编辑</Button>
              <Button type="primary" icon={<LinkOutlined />} onClick={handleOpenBind}>添加节点</Button>
            </Space>
          }
        >
          {detailData && (
            <>
              <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={4}><Statistic title="节点数" value={detailData.nodeCount || (detailData.nodes || []).length} valueStyle={{ color: "#1890ff" }} /></Col>
                <Col span={4}><Statistic title="在线" value={detailData.onlineNodeCount || (detailData.nodes || []).filter(n => n.status === "ONLINE").length} valueStyle={{ color: "#52c41a" }} /></Col>
                <Col span={4}><Statistic title="总 CPU" value={detailData.totalCpu || 0} suffix="核" /></Col>
                <Col span={4}><Statistic title="总内存" value={Number(detailData.totalMemoryGb || 0).toFixed(1)} suffix="GB" /></Col>
                <Col span={4}><Statistic title="总 GPU" value={detailData.totalGpu || 0} /></Col>
                <Col span={4}><Statistic title="类型" value={detailData.type || "-"} valueStyle={{ fontSize: 18 }} /></Col>
              </Row>

              <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="名称">{detailData.name}</Descriptions.Item>
                <Descriptions.Item label="类型"><Tag color={TYPE_COLORS[detailData.type]}>{detailData.type}</Tag></Descriptions.Item>
                <Descriptions.Item label="状态"><Tag color={STATUS_COLORS[detailData.status]}>{STATUS_LABELS[detailData.status] || detailData.status}</Tag></Descriptions.Item>
                <Descriptions.Item label="描述" span={3}>{detailData.description || "-"}</Descriptions.Item>
              </Descriptions>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Title level={5} style={{ margin: 0 }}>
                  <ClusterOutlined /> 关联节点 ({(detailData.nodes || []).length})
                </Title>
              </div>
              <Table
                dataSource={detailData.nodes || []}
                columns={nodeColumns}
                rowKey="id"
                size="small"
                pagination={false}
                locale={{ emptyText: <Empty description="暂无关联节点" image={Empty.PRESENTED_IMAGE_SIMPLE}><Button type="primary" ghost onClick={handleOpenBind}>添加节点</Button></Empty> }}
              />
            </>
          )}
        </Card>

        {/* #250: 绑定节点 Modal */}
        <Modal
          title="添加节点到资源池"
          open={bindModalVisible}
          onCancel={() => setBindModalVisible(false)}
          footer={null}
          width={600}
        >
          <Spin spinning={nodesLoading}>
            {availableNodes.length === 0 ? (
              <Empty description="没有可用的未分配节点" />
            ) : (
              <Table
                dataSource={availableNodes}
                rowKey="id"
                size="small"
                pagination={false}
                columns={[
                  { title: "名称", dataIndex: "name", render: (t) => <Space><ClusterOutlined />{t}</Space> },
                  { title: "IP", dataIndex: "ipAddress" },
                  { title: "状态", dataIndex: "status", render: (s) => <Badge status={NODE_STATUS_BADGE[s] || "default"} text={NODE_STATUS_LABEL[s] || s} /> },
                  {
                    title: "操作", key: "action", width: 80,
                    render: (_, record) => (
                      <Button type="primary" size="small" icon={<LinkOutlined />} onClick={() => handleBindNode(record.id)}>
                        绑定
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </Spin>
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <CloudServerOutlined style={{ marginRight: 8, color: "#1890ff" }} />
          资源池管理
        </Title>
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
                    <Col span={6}><Statistic title="在线" value={pool.onlineNodeCount || 0} valueStyle={{ fontSize: 18, color: "#52c41a" }} /></Col>
                    <Col span={6}><Statistic title="CPU" value={pool.totalCpu || 0} suffix="核" valueStyle={{ fontSize: 18 }} /></Col>
                    <Col span={6}><Statistic title="内存" value={Number(pool.totalMemoryGb || 0).toFixed(0)} suffix="G" valueStyle={{ fontSize: 18 }} /></Col>
                  </Row>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Spin>

      <Modal
        title={editingPool ? "编辑资源池" : "创建资源池"}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText="确认"
        cancelText="取消"
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="资源池名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="如: GPU高性能池" />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select options={[
              { value: "COMPUTE", label: "通用计算" },
              { value: "GPU", label: "GPU" },
              { value: "CPU", label: "CPU" },
              { value: "NPU", label: "NPU" },
              { value: "MIXED", label: "混合" },
              { value: "K8S_POOL", label: "K8s 集群池" },
            ]} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="资源池用途说明" />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={[
              { value: "ACTIVE", label: "运行中" },
              { value: "INACTIVE", label: "已停用" },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
