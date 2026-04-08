/**
 * @file NodeList.js
 * @description 计算节点管理 — 列表 + 注册Modal + 诊断/修复 (#247)
 * @feat #167, #247
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Tag, Badge, Button, Space, Input, Select, Modal, Form, Row, Col,
  Typography, Tooltip, message, Popconfirm, Progress, Drawer, Descriptions, Divider, Spin
} from "antd";
import {
  PlusOutlined, ReloadOutlined, DeleteOutlined,
  EditOutlined, EyeOutlined, SearchOutlined,
  ClusterOutlined, MedicineBoxOutlined, BugOutlined,
  CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled,
  ToolOutlined
} from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const { Text, Title, Paragraph } = Typography;

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

const HEALTH_CONFIG = {
  HEALTHY: { color: "#52c41a", text: "健康", icon: <CheckCircleFilled style={{ color: "#52c41a" }} /> },
  DEGRADED: { color: "#faad14", text: "亚健康", icon: <ExclamationCircleFilled style={{ color: "#faad14" }} /> },
  UNHEALTHY: { color: "#ff4d4f", text: "不健康", icon: <CloseCircleFilled style={{ color: "#ff4d4f" }} /> },
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

  // #247: 诊断/修复状态
  const [diagModalVisible, setDiagModalVisible] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState(null);
  const [diagNodeName, setDiagNodeName] = useState("");

  const [repairModalVisible, setRepairModalVisible] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairResult, setRepairResult] = useState(null);
  const [repairNodeName, setRepairNodeName] = useState("");

  // #247: 节点详情 Drawer
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false);
  const [detailNode, setDetailNode] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
      if (err.response?.status !== 401) {
        message.error("获取节点列表失败");
      }
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  /* ============ 注册/编辑 ============ */
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

  /* ============ #247: 诊断 ============ */
  const handleDiagnose = async (node) => {
    setDiagNodeName(node.name);
    setDiagResult(null);
    setDiagModalVisible(true);
    setDiagLoading(true);
    try {
      const res = await api.post(`/nodes/${node.id}/diagnose`);
      if (res.data.code === 0) {
        setDiagResult(res.data.data);
      } else {
        message.error(res.data.message || "诊断失败");
      }
    } catch (err) {
      message.error(err.response?.data?.message || "诊断请求失败");
    }
    setDiagLoading(false);
  };

  /* ============ #247: 修复 ============ */
  const handleRepair = async (node) => {
    setRepairNodeName(node.name);
    setRepairResult(null);
    setRepairModalVisible(true);
    setRepairLoading(true);
    try {
      const res = await api.post(`/nodes/${node.id}/repair`);
      if (res.data.code === 0) {
        setRepairResult(res.data.data);
        if (res.data.data?.success) {
          message.success("节点修复成功");
          fetchNodes();
        }
      } else {
        message.error(res.data.message || "修复失败");
      }
    } catch (err) {
      message.error(err.response?.data?.message || "修复请求失败");
    }
    setRepairLoading(false);
  };

  const handleRepairFromDiag = (nodeId) => {
    setDiagModalVisible(false);
    const node = nodes.find(n => n.id === nodeId);
    if (node) handleRepair(node);
  };

  /* ============ #247: 节点详情 Drawer ============ */
  const handleOpenDetail = async (node) => {
    setDetailNode(node);
    setDetailDrawerVisible(true);
    // Fetch latest detail
    setDetailLoading(true);
    try {
      const res = await api.get(`/nodes/${node.id}`);
      if (res.data.code === 0) {
        setDetailNode(res.data.data);
      }
    } catch { /* keep existing data */ }
    setDetailLoading(false);
  };

  /* ============ Helpers ============ */
  const extractType = (tags) => {
    if (!tags) return null;
    const upper = tags.toUpperCase();
    if (upper.includes("GPU")) return "GPU";
    if (upper.includes("NPU")) return "NPU";
    if (upper.includes("CPU")) return "CPU";
    if (upper.includes("FPGA")) return "FPGA";
    return null;
  };

  const parseJSON = (str) => {
    if (!str) return null;
    try {
      return typeof str === "string" ? JSON.parse(str) : str;
    } catch { return null; }
  };

  const filteredNodes = nodes.filter(n => {
    if (searchText && !n.name?.toLowerCase().includes(searchText.toLowerCase())
        && !n.ipAddress?.includes(searchText)) return false;
    return true;
  });

  /* ============ 诊断结果渲染 ============ */
  const renderDiagCheck = (label, value) => {
    if (value === true) {
      return <div style={{ marginBottom: 4 }}><CheckCircleFilled style={{ color: "#52c41a", marginRight: 8 }} />{label}: <Text type="success">正常</Text></div>;
    }
    if (value === false) {
      return <div style={{ marginBottom: 4 }}><CloseCircleFilled style={{ color: "#ff4d4f", marginRight: 8 }} />{label}: <Text type="danger">异常</Text></div>;
    }
    return <div style={{ marginBottom: 4 }}><ExclamationCircleFilled style={{ color: "#d9d9d9", marginRight: 8 }} />{label}: <Text type="secondary">{String(value)}</Text></div>;
  };

  const renderDiagResult = () => {
    if (!diagResult) return null;
    const healthCfg = HEALTH_CONFIG[diagResult.health] || HEALTH_CONFIG.UNHEALTHY;
    const heartbeatText = diagResult.minutesSinceHeartbeat >= 0
      ? `${diagResult.minutesSinceHeartbeat} 分钟前`
      : "从未";

    return (
      <div>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 48 }}>{healthCfg.icon}</div>
          <Title level={4} style={{ color: healthCfg.color, margin: "8px 0 0" }}>
            {healthCfg.text}
          </Title>
          <Text type="secondary">节点 {diagResult.nodeName} · 当前状态 {diagResult.currentStatus}</Text>
        </div>

        <Divider style={{ margin: "12px 0" }} />

        <div style={{ padding: "0 8px" }}>
          {renderDiagCheck("Ping 连通性", diagResult.pingReachable)}
          {renderDiagCheck("SSH 可达", diagResult.sshConnectable)}
          {renderDiagCheck("Agent 进程", diagResult.agentRunning)}
          <div style={{ marginBottom: 4 }}>
            {diagResult.minutesSinceHeartbeat >= 0 && diagResult.minutesSinceHeartbeat <= 5
              ? <CheckCircleFilled style={{ color: "#52c41a", marginRight: 8 }} />
              : <CloseCircleFilled style={{ color: "#ff4d4f", marginRight: 8 }} />
            }
            心跳: <Text type={diagResult.minutesSinceHeartbeat >= 0 && diagResult.minutesSinceHeartbeat <= 5 ? "success" : "danger"}>
              {heartbeatText}
            </Text>
          </div>
        </div>

        {diagResult.issues?.length > 0 && (
          <>
            <Divider style={{ margin: "12px 0" }} />
            <div style={{ padding: "0 8px" }}>
              <Text strong style={{ color: "#ff4d4f" }}>问题:</Text>
              {diagResult.issues.map((issue, i) => (
                <div key={i} style={{ marginTop: 4, paddingLeft: 8 }}>
                  <CloseCircleFilled style={{ color: "#ff4d4f", marginRight: 6, fontSize: 12 }} />
                  <Text>{issue}</Text>
                </div>
              ))}
            </div>
          </>
        )}

        {diagResult.suggestions?.length > 0 && (
          <div style={{ padding: "8px 8px 0" }}>
            <Text strong style={{ color: "#1890ff" }}>建议:</Text>
            {diagResult.suggestions.map((sug, i) => (
              <div key={i} style={{ marginTop: 4, paddingLeft: 8 }}>
                <span style={{ marginRight: 6 }}>💡</span>
                <Text type="secondary">{sug}</Text>
              </div>
            ))}
          </div>
        )}

        {diagResult.issues?.length > 0 && (
          <>
            <Divider style={{ margin: "12px 0" }} />
            <div style={{ textAlign: "center" }}>
              <Button
                type="primary"
                danger
                icon={<ToolOutlined />}
                onClick={() => handleRepairFromDiag(diagResult.nodeId)}
              >
                一键修复
              </Button>
            </div>
          </>
        )}
      </div>
    );
  };

  /* ============ 修复结果渲染 ============ */
  const renderRepairResult = () => {
    if (!repairResult) return null;
    return (
      <div>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 48 }}>
            {repairResult.success
              ? <CheckCircleFilled style={{ color: "#52c41a" }} />
              : <CloseCircleFilled style={{ color: "#ff4d4f" }} />
            }
          </div>
          <Title level={4} style={{ color: repairResult.success ? "#52c41a" : "#ff4d4f", margin: "8px 0 0" }}>
            {repairResult.success ? "修复成功" : "修复失败"}
          </Title>
          <Text type="secondary">节点 {repairResult.nodeName}</Text>
        </div>

        <Divider style={{ margin: "12px 0" }} />

        <div style={{ padding: "0 8px" }}>
          <Text strong>修复过程:</Text>
          {repairResult.actions?.map((action, i) => (
            <div key={i} style={{ marginTop: 6, paddingLeft: 8 }}>
              <CheckCircleFilled style={{ color: "#52c41a", marginRight: 6, fontSize: 12 }} />
              <Text>{action}</Text>
            </div>
          ))}
        </div>

        {repairResult.error && (
          <div style={{ padding: "8px", marginTop: 8 }}>
            <Text type="danger">{repairResult.error}</Text>
          </div>
        )}
      </div>
    );
  };

  /* ============ 硬件/环境信息展示 ============ */
  const renderJsonInfo = (title, jsonStr) => {
    const data = parseJSON(jsonStr);
    if (!data || Object.keys(data).length === 0) {
      return <Text type="secondary">暂无数据</Text>;
    }
    const labelMap = {
      hostname: "主机名", os: "操作系统", os_version: "系统版本", architecture: "架构",
      cpu_model: "CPU 型号", cpu_cores_physical: "物理核心", cpu_cores_logical: "逻辑核心",
      cpu_threads: "线程数", cpu_frequency_mhz: "CPU 频率(MHz)",
      memory_total_gb: "总内存(GB)", memory_available_gb: "可用内存(GB)",
      disk_total_gb: "磁盘总量(GB)", disk_used_gb: "磁盘使用(GB)", disk_free_gb: "磁盘空闲(GB)",
      gpu_count: "GPU 数量", gpu_devices: "GPU 设备",
      python_version: "Python", pip_packages: "Pip 包数",
      cpuUsage: "CPU 使用率(%)", memoryUsage: "内存使用率(%)",
      cpu_percent: "CPU 使用率(%)", memory_used_percent: "内存使用率(%)",
    };
    return (
      <Descriptions size="small" column={1} bordered style={{ marginTop: 8 }}>
        {Object.entries(data).map(([key, value]) => {
          const label = labelMap[key] || key;
          let display;
          if (Array.isArray(value)) {
            display = value.map((v, i) => <Tag key={i} style={{ marginBottom: 2 }}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</Tag>);
          } else if (typeof value === "object" && value !== null) {
            display = <Text code style={{ fontSize: 11 }}>{JSON.stringify(value)}</Text>;
          } else {
            display = String(value);
          }
          return <Descriptions.Item key={key} label={label}>{display}</Descriptions.Item>;
        })}
      </Descriptions>
    );
  };

  /* ============ 表格列定义 ============ */
  const columns = [
    {
      title: "名称",
      dataIndex: "name",
      width: 160,
      render: (text, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => handleOpenDetail(record)}>
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
      render: (status, record) => {
        const info = NODE_STATUS_MAP[status] || { text: status, badge: "default" };
        if (status === "OFFLINE" || status === "ERROR") {
          return (
            <Tooltip title="点击诊断">
              <span style={{ cursor: "pointer" }} onClick={() => handleDiagnose(record)}>
                <Badge status={info.badge} text={<Text style={{ color: info.color }}>{info.text}</Text>} />
              </span>
            </Tooltip>
          );
        }
        return <Badge status={info.badge} text={info.text} />;
      },
    },
    {
      title: "CPU",
      width: 100,
      render: (_, record) => {
        const hw = parseJSON(record.hardwareInfo);
        if (hw?.cpuUsage != null) {
          return <Progress percent={Math.round(hw.cpuUsage)} size="small" strokeWidth={4} />;
        }
        return <Text type="secondary">-</Text>;
      },
    },
    {
      title: "内存",
      width: 100,
      render: (_, record) => {
        const hw = parseJSON(record.hardwareInfo);
        if (hw?.memoryUsage != null) {
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
      width: 220,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="详情">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleOpenDetail(record)} />
          </Tooltip>
          <Tooltip title="诊断">
            <Button type="text" size="small" icon={<BugOutlined />} onClick={() => handleDiagnose(record)} />
          </Tooltip>
          <Tooltip title="修复">
            <Button type="text" size="small" icon={<ToolOutlined />} onClick={() => handleRepair(record)} />
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

      {/* 注册/编辑 Modal */}
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

      {/* #247: 诊断结果 Modal */}
      <Modal
        title={<><BugOutlined /> 节点诊断 — {diagNodeName}</>}
        open={diagModalVisible}
        onCancel={() => setDiagModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDiagModalVisible(false)}>关闭</Button>,
        ]}
        width={520}
      >
        {diagLoading ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}><Text type="secondary">正在诊断中，请稍候...</Text></div>
          </div>
        ) : renderDiagResult()}
      </Modal>

      {/* #247: 修复结果 Modal */}
      <Modal
        title={<><ToolOutlined /> 节点修复 — {repairNodeName}</>}
        open={repairModalVisible}
        onCancel={() => setRepairModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setRepairModalVisible(false)}>关闭</Button>,
        ]}
        width={480}
      >
        {repairLoading ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}><Text type="secondary">正在修复中，请稍候...</Text></div>
          </div>
        ) : renderRepairResult()}
      </Modal>

      {/* #247: 节点详情 Drawer */}
      <Drawer
        title={<><ClusterOutlined /> 节点详情 — {detailNode?.name}</>}
        open={detailDrawerVisible}
        onClose={() => setDetailDrawerVisible(false)}
        width={560}
      >
        {detailNode && (
          <Spin spinning={detailLoading}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="ID">{detailNode.id}</Descriptions.Item>
              <Descriptions.Item label="名称">{detailNode.name}</Descriptions.Item>
              <Descriptions.Item label="IP 地址">{detailNode.ipAddress || "-"}</Descriptions.Item>
              <Descriptions.Item label="Agent 端口">{detailNode.agentPort || "-"}</Descriptions.Item>
              <Descriptions.Item label="状态">
                {(() => {
                  const info = NODE_STATUS_MAP[detailNode.status] || { text: detailNode.status, badge: "default" };
                  return <Badge status={info.badge} text={info.text} />;
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="类型">
                {(() => {
                  const type = extractType(detailNode.tags);
                  return type ? <Tag color={NODE_TYPE_COLORS[type]}>{type}</Tag> : "-";
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="标签" span={2}>{detailNode.tags || "-"}</Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>{detailNode.description || "-"}</Descriptions.Item>
              <Descriptions.Item label="最后心跳" span={2}>
                {detailNode.lastHeartbeat
                  ? `${dayjs(detailNode.lastHeartbeat).fromNow()} (${dayjs(detailNode.lastHeartbeat).format("YYYY-MM-DD HH:mm:ss")})`
                  : "从未"
                }
              </Descriptions.Item>
              {detailNode.errorMessage && (
                <Descriptions.Item label="错误信息" span={2}>
                  <Text type="danger">{detailNode.errorMessage}</Text>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Divider orientation="left">硬件信息</Divider>
            {renderJsonInfo("硬件信息", detailNode.hardwareInfo)}

            <Divider orientation="left">环境信息</Divider>
            {renderJsonInfo("环境信息", detailNode.envInfo)}

            <Divider />
            <Space>
              <Button icon={<BugOutlined />} onClick={() => { setDetailDrawerVisible(false); handleDiagnose(detailNode); }}>
                诊断
              </Button>
              <Button type="primary" icon={<ToolOutlined />} onClick={() => { setDetailDrawerVisible(false); handleRepair(detailNode); }}>
                修复
              </Button>
            </Space>
          </Spin>
        )}
      </Drawer>
    </div>
  );
}
