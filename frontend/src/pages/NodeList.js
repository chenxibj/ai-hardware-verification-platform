/**
 * @file NodeList.js
 * @description 计算节点管理 — 列表 + 注册Modal
 * @feat #167
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Tag, Badge, Button, Space, Input, Select, Modal, Form, Row, Col,
  Typography, Tooltip, message, Popconfirm, Progress
} from "antd";
import {
  PlusOutlined, ReloadOutlined, DeleteOutlined,
  EditOutlined, EyeOutlined, SearchOutlined,
  ClusterOutlined
} from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const { Text, Title } = Typography;

const NODE_TYPE_COLORS = {
  CPU: "blue",
  GPU: "green",
  NPU: "purple",
  FPGA: "orange",
};

const NODE_STATUS_MAP = {
  ONLINE: { text: "在线", color: "#52c41a", badge: "success" },
  OFFLINE: { text: "离线", color: "#ff4d4f", badge: "error" },
  MAINTENANCE: { text: "维护中", color: "#faad14", badge: "warning" },
  BUSY: { text: "忙碌", color: "#1890ff", badge: "processing" },
  ERROR: { text: "异常", color: "#ff4d4f", badge: "error" },
};

export default function NodeList({ onOpenDetail }) {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [form] = Form.useForm();

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await api.get("/nodes", { params });
      if (res.data.code === 0) {
        setNodes(res.data.data || []);
      }
    } catch (err) {
      // Nodes might require auth
      if (err.response?.status !== 401) {
        message.error("获取节点列表失败");
      }
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  const handleRegister = () => {
    setEditingNode(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (node) => {
    setEditingNode(node);
    form.setFieldsValue({
      name: node.name,
      ipAddress: node.ipAddress,
      agentPort: node.agentPort,
      type: extractType(node.tags),
      description: node.description,
      tags: node.tags,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/nodes/${id}`);
      message.success("节点已删除");
      fetchNodes();
    } catch {
      message.error("删除失败");
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      // Include type in tags
      let tags = values.tags || "";
      if (values.type && !tags.toUpperCase().includes(values.type)) {
        tags = tags ? `${values.type},${tags}` : values.type;
      }

      const payload = {
        name: values.name,
        ipAddress: values.ipAddress,
        agentPort: values.agentPort || 8090,
        description: values.description,
        tags: tags,
      };

      if (editingNode) {
        await api.put(`/nodes/${editingNode.id}`, payload);
        message.success("节点已更新");
      } else {
        const res = await api.post("/nodes", payload);
        if (res.data.code === 0 && res.data.data?.sshKey) {
          Modal.success({
            title: "节点注册成功",
            content: (
              <div>
                <p>节点Token（请妥善保存）：</p>
                <Input.TextArea value={res.data.data.sshKey} rows={2} readOnly />
                <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: "block" }}>
                  Agent 心跳时需要使用此Token进行认证
                </Text>
              </div>
            ),
            width: 480,
          });
        } else {
          message.success("节点注册成功");
        }
      }

      setModalVisible(false);
      form.resetFields();
      fetchNodes();
    } catch (err) {
      if (err.response?.data?.message) {
        message.error(err.response.data.message);
      }
    }
    setSubmitting(false);
  };

  const extractType = (tags) => {
    if (!tags) return null;
    const upper = tags.toUpperCase();
    if (upper.includes("GPU")) return "GPU";
    if (upper.includes("NPU")) return "NPU";
    if (upper.includes("CPU")) return "CPU";
    if (upper.includes("FPGA")) return "FPGA";
    return null;
  };

  const parseHardwareInfo = (hwStr) => {
    if (!hwStr) return {};
    try {
      return typeof hwStr === "string" ? JSON.parse(hwStr) : hwStr;
    } catch { return {}; }
  };

  const filteredNodes = nodes.filter(n => {
    if (searchText && !n.name?.toLowerCase().includes(searchText.toLowerCase())
        && !n.ipAddress?.includes(searchText)) return false;
    return true;
  });

  const columns = [
    {
      title: "名称",
      dataIndex: "name",
      width: 160,
      render: (text, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => onOpenDetail?.(record.id)}>
          <ClusterOutlined style={{ marginRight: 4 }} />
          {text}
        </Button>
      ),
    },
    {
      title: "地址",
      dataIndex: "ipAddress",
      width: 150,
      render: (ip, record) => (
        <Text copyable={{ text: ip }}>{ip}{record.agentPort ? `:${record.agentPort}` : ""}</Text>
      ),
    },
    {
      title: "类型",
      width: 80,
      render: (_, record) => {
        const type = extractType(record.tags);
        return type ? <Tag color={NODE_TYPE_COLORS[type] || "default"}>{type}</Tag> : <Text type="secondary">-</Text>;
      },
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (status) => {
        const info = NODE_STATUS_MAP[status] || { text: status, badge: "default" };
        return <Badge status={info.badge} text={info.text} />;
      },
    },
    {
      title: "CPU",
      width: 100,
      render: (_, record) => {
        const hw = parseHardwareInfo(record.hardwareInfo);
        if (hw.cpuUsage != null) {
          return <Progress percent={Math.round(hw.cpuUsage)} size="small" strokeWidth={4} />;
        }
        return <Text type="secondary">-</Text>;
      },
    },
    {
      title: "内存",
      width: 100,
      render: (_, record) => {
        const hw = parseHardwareInfo(record.hardwareInfo);
        if (hw.memoryUsage != null) {
          return <Progress percent={Math.round(hw.memoryUsage)} size="small" strokeWidth={4} />;
        }
        return <Text type="secondary">-</Text>;
      },
    },
    {
      title: "最后心跳",
      dataIndex: "lastHeartbeat",
      width: 140,
      render: (v) => {
        if (!v) return <Text type="secondary">从未</Text>;
        const d = dayjs(v);
        return (
          <Tooltip title={d.format("YYYY-MM-DD HH:mm:ss")}>
            <Text type={d.isBefore(dayjs().subtract(5, "minute")) ? "danger" : "secondary"}>
              {d.fromNow()}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: "操作",
      width: 150,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="详情">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => onOpenDetail?.(record.id)} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm title="确定删除此节点？" onConfirm={() => handleDelete(record.id)}>
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <ClusterOutlined />
            <span>计算节点管理</span>
            <Tag color="blue">{filteredNodes.length} 个节点</Tag>
          </Space>
        }
        extra={
          <Space>
            <Input
              placeholder="搜索名称/IP"
              prefix={<SearchOutlined />}
              allowClear
              style={{ width: 200 }}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            <Select
              placeholder="状态筛选"
              allowClear
              style={{ width: 120 }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={Object.entries(NODE_STATUS_MAP).map(([k, v]) => ({ label: v.text, value: k }))}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchNodes}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleRegister}>注册节点</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredNodes}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 个节点` }}
          size="middle"
        />
      </Card>

      <Modal
        title={editingNode ? "编辑节点" : "注册节点"}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => { setModalVisible(false); form.resetFields(); }}
        confirmLoading={submitting}
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="节点名称" rules={[{ required: true, message: "请输入节点名称" }]}>
            <Input placeholder="如: gpu-node-01" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="ipAddress" label="IP地址" rules={[{ required: true, message: "请输入IP地址" }]}>
                <Input placeholder="192.168.1.100" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="agentPort" label="端口">
                <Input type="number" placeholder="8090" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="type" label="节点类型" rules={[{ required: true, message: "请选择类型" }]}>
            <Select placeholder="选择节点类型" options={[
              { label: "CPU 节点", value: "CPU" },
              { label: "GPU 节点", value: "GPU" },
              { label: "NPU 节点", value: "NPU" },
              { label: "FPGA 节点", value: "FPGA" },
            ]} />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Input placeholder="多个标签用逗号分隔，如: production,high-mem" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="节点描述信息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
