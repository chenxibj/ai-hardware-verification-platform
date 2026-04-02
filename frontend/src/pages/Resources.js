import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Card, Table, Tag, Space, Button, Row, Col, Statistic, Modal, message,
  Badge, Descriptions, Tooltip, Progress, Typography, Drawer, Spin, Popconfirm, Empty,
  Form, Input, InputNumber, Radio, Alert, Tabs
} from "antd";
import {
  CloudServerOutlined, ReloadOutlined, DeleteOutlined, CheckCircleOutlined,
  StopOutlined, DesktopOutlined, ThunderboltOutlined, WarningOutlined,
  InfoCircleOutlined, FieldTimeOutlined, DashboardOutlined,
  ClockCircleOutlined, HddOutlined, ApiOutlined, PlusOutlined,
  SyncOutlined, ExclamationCircleOutlined, LoadingOutlined,
  LaptopOutlined, CodeOutlined, ExperimentOutlined
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import api from "../utils/api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const { Text, Title } = Typography;
const { TextArea } = Input;

const STATUS_MAP = {
  ONLINE: { text: "在线", badge: "success", color: "#52c41a" },
  OFFLINE: { text: "离线", badge: "default", color: "#d9d9d9" },
  BUSY: { text: "繁忙", badge: "processing", color: "#1890ff" },
  MAINTENANCE: { text: "维护中", badge: "warning", color: "#faad14" },
  ERROR: { text: "异常", badge: "error", color: "#ff4d4f" },
  PENDING: { text: "待纳管", badge: "default", color: "#d9d9d9" },
  MANAGING: { text: "纳管中", badge: "processing", color: "#1890ff" },
  FAILED: { text: "纳管失败", badge: "error", color: "#ff4d4f" },
};

const NODE_TYPE_ICONS = {
  cpu: <DesktopOutlined />,
  gpu: <ThunderboltOutlined />,
  npu: <ApiOutlined />,
};

function getNodeType(hw) {
  if (!hw) return "cpu";
  const str = JSON.stringify(hw).toLowerCase();
  if (str.includes("npu") || str.includes("ascend") || str.includes("910")) return "npu";
  if (str.includes("gpu") || str.includes("nvidia") || str.includes("cuda")) return "gpu";
  return "cpu";
}

function formatBytes(gb) {
  if (gb == null) return "-";
  if (gb >= 1024) return (gb / 1024).toFixed(1) + " TB";
  return Number(gb).toFixed(1) + " GB";
}

export default function Resources() {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [metricsData, setMetricsData] = useState([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsHours, setMetricsHours] = useState(1);
  const refreshTimer = useRef(null);

  // ====== Env Info state ======
  const [envInfo, setEnvInfo] = useState(null);
  const [envInfoLoading, setEnvInfoLoading] = useState(false);
  const [envInfoCollecting, setEnvInfoCollecting] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  // ====== New: Add Node Modal state ======
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addForm] = Form.useForm();

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/nodes");
      if (res.data.code === 0) {
        setNodes(res.data.data || []);
      }
    } catch (e) {
      message.error("获取节点数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNodes();
    refreshTimer.current = setInterval(fetchNodes, 30000);
    return () => clearInterval(refreshTimer.current);
  }, [fetchNodes]);

  const fetchMetrics = useCallback(async (nodeId, hours) => {
    setMetricsLoading(true);
    try {
      const res = await api.get(`/nodes/${nodeId}/metrics`, { params: { hours } });
      if (res.data.code === 0) {
        setMetricsData(res.data.data || []);
      }
    } catch (e) {
      message.error("获取指标数据失败");
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  // ====== Fetch env info ======
  const fetchEnvInfo = useCallback(async (nodeId) => {
    setEnvInfoLoading(true);
    try {
      const res = await api.get(`/nodes/${nodeId}/env-info`);
      if (res.data.code === 0 && res.data.data && Object.keys(res.data.data).length > 0) {
        setEnvInfo(res.data.data);
      } else {
        setEnvInfo(null);
      }
    } catch (e) {
      console.error("获取环境信息失败", e);
      setEnvInfo(null);
    } finally {
      setEnvInfoLoading(false);
    }
  }, []);

  const handleCollectEnvInfo = async (nodeId) => {
    setEnvInfoCollecting(true);
    try {
      const res = await api.post(`/nodes/${nodeId}/env-info/collect`);
      if (res.data.code === 0) {
        message.success("环境信息采集已触发，请稍后刷新");
        // Poll after a delay
        setTimeout(() => fetchEnvInfo(nodeId), 5000);
        setTimeout(() => fetchEnvInfo(nodeId), 15000);
      } else {
        message.error(res.data.message || "采集触发失败");
      }
    } catch (e) {
      message.error("采集触发失败");
    } finally {
      setEnvInfoCollecting(false);
    }
  };

  const openDetail = (node) => {
    setSelectedNode(node);
    setDrawerVisible(true);
    setMetricsHours(1);
    setActiveTab("basic");
    setEnvInfo(null);
    fetchMetrics(node.id, 1);
    fetchEnvInfo(node.id);
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.put(`/nodes/${id}/status`, { status });
      message.success("状态已更新");
      fetchNodes();
    } catch (e) {
      message.error("更新失败");
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/nodes/${id}`);
      message.success("已删除");
      fetchNodes();
      if (selectedNode && selectedNode.id === id) {
        setDrawerVisible(false);
      }
    } catch (e) {
      message.error("删除失败");
    }
  };

  // ====== New: Create Node ======
  const handleAddNode = async () => {
    try {
      const values = await addForm.validateFields();
      setAddLoading(true);
      const payload = {
        name: values.name,
        ipAddress: values.ipAddress,
        sshPort: values.sshPort || 22,
        authType: values.authType,
        sshUser: values.sshUser || "root",
        remark: values.remark || "",
      };
      if (values.authType === "password") {
        payload.sshPassword = values.sshPassword;
      } else {
        payload.sshKey = values.sshKey;
      }
      const res = await api.post("/nodes/create", payload);
      if (res.data.code === 0) {
        message.success("节点已创建，正在纳管中...");
        setAddModalVisible(false);
        addForm.resetFields();
        // Poll more frequently for a bit to show status updates
        fetchNodes();
        setTimeout(fetchNodes, 3000);
        setTimeout(fetchNodes, 8000);
        setTimeout(fetchNodes, 15000);
      } else {
        message.error(res.data.message || "创建失败");
      }
    } catch (e) {
      if (e.response?.data?.message) {
        message.error(e.response.data.message);
      } else if (!e.errorFields) {
        message.error("创建节点失败");
      }
    } finally {
      setAddLoading(false);
    }
  };

  // ====== New: Retry Manage ======
  const handleRetryManage = async (node) => {
    // For retry, we just trigger the manage endpoint with existing credentials
    try {
      await api.post(`/nodes/${node.id}/manage`, {
        authType: node.sshAuthType || "password",
        sshUser: node.sshUser || "root",
        sshPort: node.sshPort || 22,
      });
      message.info("正在重新纳管...");
      fetchNodes();
      setTimeout(fetchNodes, 3000);
      setTimeout(fetchNodes, 8000);
      setTimeout(fetchNodes, 15000);
    } catch (e) {
      message.error("重新纳管失败");
    }
  };

  // Stats
  const totalNodes = nodes.length;
  const onlineNodes = nodes.filter(n => n.status === "ONLINE" || n.status === "BUSY").length;
  const offlineNodes = nodes.filter(n => n.status === "OFFLINE").length;
  const maintenanceNodes = nodes.filter(n => n.status === "MAINTENANCE" || n.status === "ERROR").length;
  const avgCpu = nodes.length > 0
    ? (nodes.reduce((s, n) => s + (n.latestMetrics?.cpuPercent || 0), 0) / nodes.length).toFixed(1)
    : 0;
  const avgMem = nodes.length > 0
    ? (nodes.reduce((s, n) => s + (n.latestMetrics?.memoryUsedPercent || 0), 0) / nodes.length).toFixed(1)
    : 0;

  // Chart for metrics
  const getMetricsChartOption = () => {
    const times = metricsData.map(m => dayjs(m.recordedAt).format("HH:mm"));
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["CPU %", "内存 %", "磁盘 %"], bottom: 0 },
      grid: { top: 30, right: 20, bottom: 40, left: 50 },
      xAxis: { type: "category", data: times, axisLabel: { rotate: 45, fontSize: 10 } },
      yAxis: { type: "value", name: "%", max: 100, min: 0 },
      series: [
        {
          name: "CPU %", type: "line", smooth: true,
          data: metricsData.map(m => m.cpuPercent != null ? Number(m.cpuPercent).toFixed(1) : null),
          itemStyle: { color: "#1890ff" }, areaStyle: { opacity: 0.08 }, symbol: "none"
        },
        {
          name: "内存 %", type: "line", smooth: true,
          data: metricsData.map(m => m.memoryUsedPercent != null ? Number(m.memoryUsedPercent).toFixed(1) : null),
          itemStyle: { color: "#52c41a" }, areaStyle: { opacity: 0.08 }, symbol: "none"
        },
        {
          name: "磁盘 %", type: "line", smooth: true,
          data: metricsData.map(m => m.diskUsedPercent != null ? Number(m.diskUsedPercent).toFixed(1) : null),
          itemStyle: { color: "#faad14" }, areaStyle: { opacity: 0.08 }, symbol: "none"
        },
      ],
    };
  };

  const getLoadChartOption = () => {
    const times = metricsData.map(m => dayjs(m.recordedAt).format("HH:mm"));
    return {
      tooltip: { trigger: "axis" },
      legend: { data: ["1分钟", "5分钟", "15分钟"], bottom: 0 },
      grid: { top: 30, right: 20, bottom: 40, left: 50 },
      xAxis: { type: "category", data: times, axisLabel: { rotate: 45, fontSize: 10 } },
      yAxis: { type: "value", name: "负载" },
      series: [
        { name: "1分钟", type: "line", smooth: true, data: metricsData.map(m => m.load1m), itemStyle: { color: "#ff4d4f" }, symbol: "none" },
        { name: "5分钟", type: "line", smooth: true, data: metricsData.map(m => m.load5m), itemStyle: { color: "#faad14" }, symbol: "none" },
        { name: "15分钟", type: "line", smooth: true, data: metricsData.map(m => m.load15m), itemStyle: { color: "#1890ff" }, symbol: "none" },
      ],
    };
  };

  // ====== Render status badge with management states ======
  const renderStatus = (status, record) => {
    const s = STATUS_MAP[status] || STATUS_MAP.OFFLINE;
    if (status === "MANAGING") {
      return <Badge status="processing" text={<span><LoadingOutlined spin style={{ marginRight: 4 }} />纳管中</span>} />;
    }
    if (status === "FAILED") {
      return (
        <Tooltip title={record?.errorMessage || "纳管失败"}>
          <Badge status="error" text={<span style={{ color: "#ff4d4f" }}><ExclamationCircleOutlined style={{ marginRight: 4 }} />纳管失败</span>} />
        </Tooltip>
      );
    }
    if (status === "PENDING") {
      return <Badge status="default" text={<span><ClockCircleOutlined style={{ marginRight: 4 }} />待纳管</span>} />;
    }
    return <Badge status={s.badge} text={s.text} />;
  };

  const columns = [
    {
      title: "节点", key: "node", width: 220,
      render: (_, r) => {
        const hw = r.hardwareInfo || {};
        const nodeType = getNodeType(hw);
        return (
          <Space>
            <span style={{ fontSize: 18 }}>{NODE_TYPE_ICONS[nodeType]}</span>
            <div>
              <div><Text strong>{r.name}</Text></div>
              <Text type="secondary" style={{ fontSize: 12 }}>{r.ipAddress || "-"}</Text>
            </div>
          </Space>
        );
      }
    },
    {
      title: "状态", dataIndex: "status", width: 130,
      render: (v, r) => renderStatus(v, r),
      filters: Object.entries(STATUS_MAP).map(([k, v]) => ({ text: v.text, value: k })),
      onFilter: (val, record) => record.status === val,
    },
    {
      title: "硬件", key: "hardware", width: 220,
      render: (_, r) => {
        if (r.status === "PENDING" || r.status === "MANAGING" || r.status === "FAILED") {
          return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>;
        }
        const hw = r.hardwareInfo || {};
        return (
          <div style={{ fontSize: 12 }}>
            <div><DesktopOutlined /> {hw.cpu_model || hw.cpu || "-"} ({hw.cpu_cores_logical || hw.cores || "?"}核)</div>
            <div><HddOutlined /> {hw.memory_total_gb ? hw.memory_total_gb.toFixed(1) + " GB" : (hw.memory || "-")}</div>
            <div style={{ color: "#999" }}>{hw.os ? hw.os.split(" ")[0] : "-"}</div>
          </div>
        );
      }
    },
    {
      title: "OS", key: "os", width: 120,
      render: (_, r) => {
        const hw = r.hardwareInfo || {};
        const os = hw.os || "";
        if (!os) return <Text type="secondary">-</Text>;
        const parts = os.split(" ");
        return (
          <Tooltip title={os}>
            <Text style={{ fontSize: 12 }}><LaptopOutlined style={{ marginRight: 4 }} />{parts[0]}</Text>
          </Tooltip>
        );
      },
    },
    {
      title: "CPU", key: "cpu", width: 120, sorter: (a, b) => (a.latestMetrics?.cpuPercent || 0) - (b.latestMetrics?.cpuPercent || 0),
      render: (_, r) => {
        const v = r.latestMetrics?.cpuPercent;
        if (v == null) return <Text type="secondary">-</Text>;
        const pct = Number(v).toFixed(1);
        return <Progress percent={pct} size="small" strokeColor={pct > 80 ? "#ff4d4f" : pct > 50 ? "#faad14" : "#52c41a"} format={p => `${p}%`} />;
      }
    },
    {
      title: "内存", key: "mem", width: 120, sorter: (a, b) => (a.latestMetrics?.memoryUsedPercent || 0) - (b.latestMetrics?.memoryUsedPercent || 0),
      render: (_, r) => {
        const v = r.latestMetrics?.memoryUsedPercent;
        if (v == null) return <Text type="secondary">-</Text>;
        const pct = Number(v).toFixed(1);
        return <Progress percent={pct} size="small" strokeColor={pct > 80 ? "#ff4d4f" : pct > 50 ? "#faad14" : "#52c41a"} format={p => `${p}%`} />;
      }
    },
    {
      title: "负载", key: "load", width: 80,
      render: (_, r) => {
        const v = r.latestMetrics?.load1m;
        if (v == null) return <Text type="secondary">-</Text>;
        const hw = r.hardwareInfo || {};
        const cores = hw.cpu_cores_logical || hw.cores || 1;
        const loadColor = v > cores ? "#ff4d4f" : v > cores * 0.7 ? "#faad14" : "#52c41a";
        return <Text style={{ color: loadColor }}>{Number(v).toFixed(2)}</Text>;
      }
    },
    {
      title: "最后心跳", key: "heartbeat", width: 140,
      render: (_, r) => r.lastHeartbeat
        ? <Tooltip title={dayjs(r.lastHeartbeat).format("YYYY-MM-DD HH:mm:ss")}>
            <ClockCircleOutlined /> {dayjs(r.lastHeartbeat).fromNow()}
          </Tooltip>
        : <Text type="secondary">从未上报</Text>,
      sorter: (a, b) => new Date(a.lastHeartbeat || 0) - new Date(b.lastHeartbeat || 0),
    },
    {
      title: "操作", key: "action", width: 220, fixed: "right",
      render: (_, r) => (
        <Space size={2}>
          <Button type="link" size="small" onClick={() => openDetail(r)} icon={<InfoCircleOutlined />}>详情</Button>
          {r.status === "FAILED" && (
            <Button type="link" size="small" onClick={() => handleRetryManage(r)} icon={<SyncOutlined />}>重试纳管</Button>
          )}
          {r.status === "ONLINE" && (
            <Button type="link" size="small" onClick={() => handleStatusChange(r.id, "MAINTENANCE")} icon={<StopOutlined />}>维护</Button>
          )}
          {(r.status === "MAINTENANCE" || r.status === "OFFLINE") && (
            <Button type="link" size="small" onClick={() => handleStatusChange(r.id, "ONLINE")} icon={<CheckCircleOutlined />}>上线</Button>
          )}
          <Popconfirm title="确定删除此节点？" onConfirm={() => handleDelete(r.id)} okType="danger">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
    <div>
      {/* Stats Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" hoverable>
            <Statistic title="节点总数" value={totalNodes} prefix={<CloudServerOutlined style={{ color: "#1890ff" }} />} valueStyle={{ color: "#1890ff" }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" hoverable>
            <Statistic title="在线" value={onlineNodes} prefix={<CheckCircleOutlined style={{ color: "#52c41a" }} />} valueStyle={{ color: "#52c41a" }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" hoverable>
            <Statistic title="离线" value={offlineNodes} prefix={<WarningOutlined style={{ color: "#ff4d4f" }} />} valueStyle={{ color: offlineNodes > 0 ? "#ff4d4f" : "#d9d9d9" }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" hoverable>
            <Statistic title="维护/异常" value={maintenanceNodes} prefix={<StopOutlined style={{ color: "#faad14" }} />} valueStyle={{ color: maintenanceNodes > 0 ? "#faad14" : "#d9d9d9" }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" hoverable>
            <Statistic title="平均CPU" value={avgCpu} suffix="%" prefix={<DashboardOutlined style={{ color: "#1890ff" }} />} valueStyle={{ color: "#1890ff" }} />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" hoverable>
            <Statistic title="平均内存" value={avgMem} suffix="%" prefix={<HddOutlined style={{ color: "#52c41a" }} />} valueStyle={{ color: "#52c41a" }} />
          </Card>
        </Col>
      </Row>

      {/* Node Table */}
      <Card
        title={<span><CloudServerOutlined /> 计算节点</span>}
        size="small"
        extra={
          <Space>
            <Text type="secondary" style={{ fontSize: 12 }}>每30秒自动刷新</Text>
            <Button onClick={fetchNodes} icon={<ReloadOutlined />} loading={loading}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { addForm.resetFields(); setAddModalVisible(true); }}>
              新增节点
            </Button>
          </Space>
        }
      >
        {nodes.length === 0 && !loading ? (
          <Empty description="暂无注册节点" style={{ padding: "40px 0" }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { addForm.resetFields(); setAddModalVisible(true); }}>
              新增节点
            </Button>
          </Empty>
        ) : (
          <Table
            columns={columns}
            dataSource={nodes}
            rowKey="id"
            loading={loading}
            size="small"
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showTotal: (total) => `共 ${total} 条` }}
            rowClassName={(r) => r.status === "OFFLINE" ? "row-offline" : ""}
          />
        )}
      </Card>

      {/* ====== New: Add Node Modal ====== */}
      <Modal
        title="新增计算节点"
        open={addModalVisible}
        onOk={handleAddNode}
        onCancel={() => setAddModalVisible(false)}
        confirmLoading={addLoading}
        okText="提交纳管"
        cancelText="取消"
        width={560}
        destroyOnClose
      >
        <Alert
          message="添加节点后系统将自动通过 SSH 连接验证，验证成功后节点状态变为在线。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form
          form={addForm}
          layout="vertical"
          initialValues={{ sshPort: 22, authType: "password", sshUser: "root" }}
        >
          <Form.Item
            label="节点名称"
            name="name"
            rules={[
              { required: true, message: "请输入节点名称" },
              { max: 100, message: "名称不超过100个字符" },
            ]}
          >
            <Input placeholder="例如：gpu-node-01" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={16}>
              <Form.Item
                label="IP 地址"
                name="ipAddress"
                rules={[
                  { required: true, message: "请输入 IP 地址" },
                  {
                    pattern: /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
                    message: "请输入合法的 IP 地址",
                  },
                ]}
              >
                <Input placeholder="例如：192.168.1.100" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="SSH 端口" name="sshPort">
                <InputNumber min={1} max={65535} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="认证方式" name="authType">
            <Radio.Group>
              <Radio value="password">密码认证</Radio>
              <Radio value="key">SSH 密钥</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item label="用户名" name="sshUser" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input placeholder="root" />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.authType !== cur.authType}>
            {({ getFieldValue }) =>
              getFieldValue("authType") === "password" ? (
                <Form.Item
                  label="密码"
                  name="sshPassword"
                  rules={[{ required: true, message: "请输入密码" }]}
                >
                  <Input.Password placeholder="SSH 登录密码" />
                </Form.Item>
              ) : (
                <Form.Item
                  label="SSH 私钥"
                  name="sshKey"
                  rules={[{ required: true, message: "请粘贴 SSH 私钥内容" }]}
                >
                  <TextArea
                    rows={4}
                    placeholder={"-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"}
                    style={{ fontFamily: "monospace", fontSize: 12 }}
                  />
                </Form.Item>
              )
            }
          </Form.Item>

          <Form.Item label="备注信息" name="remark">
            <TextArea rows={2} placeholder="可选：节点用途、配置说明等" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Detail Drawer */}
      <Drawer
        title={selectedNode ? `节点详情 - ${selectedNode.name}` : "节点详情"}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        width={720}
        destroyOnClose
      >
        {selectedNode && (
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
            {
              key: "basic",
              label: <span><InfoCircleOutlined /> 基本信息</span>,
              children: (
          <div>
            {/* Error message alert for FAILED nodes */}
            {selectedNode.status === "FAILED" && selectedNode.errorMessage && (
              <Alert
                message="纳管失败"
                description={selectedNode.errorMessage}
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
                action={
                  <Button size="small" type="primary" onClick={() => handleRetryManage(selectedNode)}>
                    重试纳管
                  </Button>
                }
              />
            )}

            {selectedNode.status === "MANAGING" && (
              <Alert
                message="纳管进行中"
                description="系统正在通过 SSH 连接验证该节点，请稍候..."
                type="info"
                showIcon
                icon={<LoadingOutlined />}
                style={{ marginBottom: 16 }}
              />
            )}

            {/* Basic Info */}
            <Descriptions title="基本信息" column={2} size="small" bordered style={{ marginBottom: 24 }}>
              <Descriptions.Item label="节点名称">{selectedNode.name}</Descriptions.Item>
              <Descriptions.Item label="状态">
                {renderStatus(selectedNode.status, selectedNode)}
              </Descriptions.Item>
              <Descriptions.Item label="IP 地址">{selectedNode.ipAddress || "-"}</Descriptions.Item>
              <Descriptions.Item label="SSH 端口">{selectedNode.sshPort || "-"}</Descriptions.Item>
              <Descriptions.Item label="SSH 用户">{selectedNode.sshUser || "-"}</Descriptions.Item>
              <Descriptions.Item label="认证方式">
                {selectedNode.sshAuthType === "key" ? "SSH 密钥" : selectedNode.sshAuthType === "password" ? "密码" : (selectedNode.agentPort ? `Agent (${selectedNode.agentPort})` : "-")}
              </Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>{selectedNode.description || "-"}</Descriptions.Item>
              <Descriptions.Item label="标签" span={2}>
                {selectedNode.tags ? selectedNode.tags.split(",").map(t => <Tag key={t}>{t.trim()}</Tag>) : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="注册时间">{selectedNode.createdAt ? dayjs(selectedNode.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Descriptions.Item>
              <Descriptions.Item label="最后心跳">{selectedNode.lastHeartbeat ? dayjs(selectedNode.lastHeartbeat).format("YYYY-MM-DD HH:mm:ss") : "-"}</Descriptions.Item>
            </Descriptions>

            {/* Hardware Info */}
            {selectedNode.hardwareInfo && (
              <Descriptions title="硬件信息" column={2} size="small" bordered style={{ marginBottom: 24 }}>
                <Descriptions.Item label="CPU">{selectedNode.hardwareInfo.cpu_model || selectedNode.hardwareInfo.cpu || "-"}</Descriptions.Item>
                <Descriptions.Item label="核数">{selectedNode.hardwareInfo.cpu_cores_logical || selectedNode.hardwareInfo.cores || "-"} (物理 {selectedNode.hardwareInfo.cpu_cores_physical || "?"})</Descriptions.Item>
                <Descriptions.Item label="内存">{selectedNode.hardwareInfo.memory_total_gb ? selectedNode.hardwareInfo.memory_total_gb.toFixed(1) + " GB" : (selectedNode.hardwareInfo.memory || "-")}</Descriptions.Item>
                <Descriptions.Item label="操作系统">{selectedNode.hardwareInfo.os || "-"}</Descriptions.Item>
                <Descriptions.Item label="主机名">{selectedNode.hardwareInfo.hostname || "-"}</Descriptions.Item>
                <Descriptions.Item label="架构">{selectedNode.hardwareInfo.arch || "-"}</Descriptions.Item>
                {selectedNode.hardwareInfo.disk_total_gb && (
                  <Descriptions.Item label="磁盘">{selectedNode.hardwareInfo.disk_total_gb.toFixed(1)} GB (可用 {(selectedNode.hardwareInfo.disk_free_gb || 0).toFixed(1)} GB)</Descriptions.Item>
                )}
                {selectedNode.hardwareInfo.python_version && (
                  <Descriptions.Item label="Python">{selectedNode.hardwareInfo.python_version}</Descriptions.Item>
                )}
              </Descriptions>
            )}

            {/* Current Metrics */}
            {selectedNode.latestMetrics && (
              <Card title="当前指标" size="small" style={{ marginBottom: 24 }}>
                <Row gutter={16}>
                  <Col span={6}>
                    <Statistic title="CPU" value={Number(selectedNode.latestMetrics.cpuPercent || 0).toFixed(1)} suffix="%" valueStyle={{ fontSize: 20 }} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="内存" value={Number(selectedNode.latestMetrics.memoryUsedPercent || 0).toFixed(1)} suffix="%" valueStyle={{ fontSize: 20 }} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="磁盘" value={Number(selectedNode.latestMetrics.diskUsedPercent || 0).toFixed(1)} suffix="%" valueStyle={{ fontSize: 20 }} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="负载(1m)" value={Number(selectedNode.latestMetrics.load1m || 0).toFixed(2)} valueStyle={{ fontSize: 20 }} />
                  </Col>
                </Row>
                {selectedNode.latestMetrics.memoryUsedGb != null && (
                  <div style={{ marginTop: 8, color: "#999", fontSize: 12 }}>
                    内存: 已用 {formatBytes(selectedNode.latestMetrics.memoryUsedGb)} / 可用 {formatBytes(selectedNode.latestMetrics.memoryAvailableGb)}
                  </div>
                )}
              </Card>
            )}

            {/* History Charts */}
            <Card
              title="历史趋势"
              size="small"
              style={{ marginBottom: 24 }}
              extra={
                <Space>
                  {[1, 6, 24].map(h => (
                    <Button
                      key={h}
                      size="small"
                      type={metricsHours === h ? "primary" : "default"}
                      onClick={() => { setMetricsHours(h); fetchMetrics(selectedNode.id, h); }}
                    >
                      {h === 1 ? "1小时" : h === 6 ? "6小时" : "24小时"}
                    </Button>
                  ))}
                </Space>
              }
            >
              <Spin spinning={metricsLoading}>
                {metricsData.length > 0 ? (
                  <>
                    <div style={{ marginBottom: 8 }}><Text strong>使用率</Text></div>
                    <ReactECharts option={getMetricsChartOption()} style={{ height: 220 }} />
                    <div style={{ marginTop: 16, marginBottom: 8 }}><Text strong>系统负载</Text></div>
                    <ReactECharts option={getLoadChartOption()} style={{ height: 180 }} />
                  </>
                ) : (
                  <Empty description="暂无指标数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Spin>
            </Card>
          </div>
              ),
            },
            {
              key: "envInfo",
              label: <span><ExperimentOutlined /> 环境信息</span>,
              children: (
                <div>
                  <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Text type="secondary">
                      {envInfo?.collected_at ? `上次采集: ${dayjs(envInfo.collected_at).format("YYYY-MM-DD HH:mm:ss")}` : "尚未采集环境信息"}
                    </Text>
                    <Space>
                      <Button
                        icon={<ReloadOutlined />}
                        size="small"
                        onClick={() => fetchEnvInfo(selectedNode.id)}
                        loading={envInfoLoading}
                      >
                        刷新
                      </Button>
                      <Button
                        icon={<SyncOutlined />}
                        size="small"
                        type="primary"
                        onClick={() => handleCollectEnvInfo(selectedNode.id)}
                        loading={envInfoCollecting}
                      >
                        重新采集
                      </Button>
                    </Space>
                  </div>

                  <Spin spinning={envInfoLoading}>
                    {envInfo ? (
                      <>
                        {/* OS & Kernel */}
                        <Descriptions title={<span><LaptopOutlined /> 操作系统</span>} column={2} size="small" bordered style={{ marginBottom: 16 }}>
                          <Descriptions.Item label="发行版">{envInfo.os_pretty || envInfo.os_name || "-"}</Descriptions.Item>
                          <Descriptions.Item label="版本">{envInfo.os_version || "-"}</Descriptions.Item>
                          <Descriptions.Item label="内核版本" span={2}>{envInfo.kernel_version || "-"}</Descriptions.Item>
                        </Descriptions>

                        {/* CPU */}
                        <Descriptions title={<span><DesktopOutlined /> CPU 信息</span>} column={2} size="small" bordered style={{ marginBottom: 16 }}>
                          <Descriptions.Item label="型号" span={2}>{envInfo.cpu_model || "-"}</Descriptions.Item>
                          <Descriptions.Item label="架构">{envInfo.cpu_arch || "-"}</Descriptions.Item>
                          <Descriptions.Item label="物理核心">{envInfo.cpu_cores || "-"}</Descriptions.Item>
                          <Descriptions.Item label="线程数">{envInfo.cpu_threads || "-"}</Descriptions.Item>
                          <Descriptions.Item label="插槽数">{envInfo.cpu_sockets || "-"}</Descriptions.Item>
                          <Descriptions.Item label="指令集支持" span={2}>
                            {envInfo.cpu_flags && envInfo.cpu_flags.length > 0
                              ? envInfo.cpu_flags.map(f => (
                                  <Tag key={f} color={f.startsWith("avx512") ? "gold" : f === "avx2" ? "green" : "blue"} style={{ marginBottom: 4 }}>
                                    {f.toUpperCase()}
                                  </Tag>
                                ))
                              : <Text type="secondary">无</Text>
                            }
                          </Descriptions.Item>
                          <Descriptions.Item label="AVX2">
                            {envInfo.avx2_support ? <Tag color="success">支持</Tag> : <Tag>不支持</Tag>}
                          </Descriptions.Item>
                          <Descriptions.Item label="AVX-512">
                            {envInfo.avx512_support ? <Tag color="success">支持</Tag> : <Tag>不支持</Tag>}
                          </Descriptions.Item>
                        </Descriptions>

                        {/* GPU */}
                        <Descriptions title={<span><ThunderboltOutlined /> GPU 信息</span>} column={2} size="small" bordered style={{ marginBottom: 16 }}>
                          <Descriptions.Item label="GPU 数量">{envInfo.gpu_count || 0}</Descriptions.Item>
                          <Descriptions.Item label="GPU 驱动">{envInfo.gpu_driver || "-"}</Descriptions.Item>
                          {envInfo.gpus && envInfo.gpus.length > 0 ? (
                            envInfo.gpus.map((gpu, i) => (
                              <Descriptions.Item key={i} label={`GPU #${i}`} span={2}>
                                {gpu.name} ({gpu.memory_mb ? (gpu.memory_mb / 1024).toFixed(1) + " GB" : "?"} 显存)
                              </Descriptions.Item>
                            ))
                          ) : (
                            <Descriptions.Item label="状态" span={2}>
                              <Text type="secondary">未检测到 GPU</Text>
                            </Descriptions.Item>
                          )}
                          <Descriptions.Item label="CUDA">{envInfo.cuda_version || "-"}</Descriptions.Item>
                          <Descriptions.Item label="cuDNN">{envInfo.cudnn_version || "-"}</Descriptions.Item>
                        </Descriptions>

                        {/* Software */}
                        <Descriptions title={<span><CodeOutlined /> 软件环境</span>} column={2} size="small" bordered style={{ marginBottom: 16 }}>
                          <Descriptions.Item label="Python">{envInfo.python_version || "-"}</Descriptions.Item>
                          <Descriptions.Item label="Python 路径">{envInfo.python_path || "-"}</Descriptions.Item>
                          {envInfo.dl_frameworks && Object.keys(envInfo.dl_frameworks).length > 0 ? (
                            Object.entries(envInfo.dl_frameworks).map(([name, ver]) => (
                              <Descriptions.Item key={name} label={name}>{ver}</Descriptions.Item>
                            ))
                          ) : (
                            <Descriptions.Item label="深度学习框架" span={2}>
                              <Text type="secondary">未检测到深度学习框架</Text>
                            </Descriptions.Item>
                          )}
                          {envInfo.pytorch_cuda_available !== undefined && (
                            <Descriptions.Item label="PyTorch CUDA">
                              {envInfo.pytorch_cuda_available ? <Tag color="success">可用</Tag> : <Tag>不可用</Tag>}
                            </Descriptions.Item>
                          )}
                        </Descriptions>
                      </>
                    ) : (
                      <Empty
                        description="暂无环境信息"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        style={{ padding: "40px 0" }}
                      >
                        <Button
                          type="primary"
                          icon={<SyncOutlined />}
                          onClick={() => handleCollectEnvInfo(selectedNode.id)}
                          loading={envInfoCollecting}
                        >
                          立即采集
                        </Button>
                      </Empty>
                    )}
                  </Spin>
                </div>
              ),
            },
          ]} />
        )}
      </Drawer>

      <style>{`
        .row-offline td { opacity: 0.55; }
      `}</style>
    </div>
    </Spin>
  );
}
