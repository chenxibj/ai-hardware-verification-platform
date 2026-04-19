/**
 * @file ClusterList.js
 * @description K8s 集群管理页面 — 集群注册+展示+健康检查 (UI 骨架)
 * Issue: #252 K8s 集群注册
 * @feat #252
 *
 * 后端 API 尚未实现，页面展示空状态提示。
 * API 占位:
 * - GET /api/clusters — 集群列表
 * - POST /api/clusters — 注册集群
 * - GET /api/clusters/{id} — 集群详情
 * - POST /api/clusters/{id}/health-check — 健康检查
 * - DELETE /api/clusters/{id} — 删除集群
 */
import React, { useState } from "react";
import {
  Card, Row, Col, Button, Modal, Form, Input, Upload, Tabs, Tag, Space,
  Typography, Empty, Statistic, Alert, Tooltip, Badge, Descriptions,
  message,
} from "antd";
import {
  ClusterOutlined, PlusOutlined, CloudServerOutlined, ReloadOutlined,
  UploadOutlined, CopyOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ExclamationCircleOutlined, HeartOutlined, FileTextOutlined,
  InboxOutlined, ApiOutlined, SafetyCertificateOutlined,
} from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;
const { TabPane } = Tabs;

/* ============ 初始数据 — 后端就绪后从 API 获取 ============ */
const INITIAL_CLUSTERS = [
  // 空状态 — 后端就绪后从 API 获取
];

/* ============ 主组件 ============ */
export default function ClusterList() {
  const [clusters] = useState(INITIAL_CLUSTERS);
  const [registerModalVisible, setRegisterModalVisible] = useState(false);
  const [kubeconfigInput, setKubeconfigInput] = useState("file"); // "file" | "text"
  const [form] = Form.useForm();

  /* ---- API 占位函数 ---- */
  const fetchClusters = async () => {
    // TODO: 后端实现后启用
    // const res = await api.get("/clusters");
    // if (res.data.code === 0) setClusters(res.data.data || []);
    message.info("K8s 集群管理 API 开发中，敬请期待");
  };

  const handleRegister = async () => {
    try {
      const values = await form.validateFields();
      // TODO: 后端实现后启用
      // const res = await api.post("/clusters", {
      //   name: values.name,
      //   description: values.description,
      //   kubeconfig: values.kubeconfig,
      // });
      message.info("K8s 集群注册 API 开发中，当前为 UI 预览");
      setRegisterModalVisible(false);
      form.resetFields();
    } catch { /* validation error */ }
  };

  const handleHealthCheck = async (clusterId) => {
    // TODO: 后端实现后启用
    // const res = await api.post(`/clusters/${clusterId}/health-check`);
    message.info("健康检查 API 开发中");
  };

  /* ---- 集群状态颜色 ---- */
  const statusConfig = {
    CONNECTED: { color: "green", text: "已连接", icon: <CheckCircleOutlined /> },
    DISCONNECTED: { color: "red", text: "已断开", icon: <CloseCircleOutlined /> },
    PENDING: { color: "orange", text: "连接中", icon: <ExclamationCircleOutlined /> },
    UNKNOWN: { color: "default", text: "未知", icon: <ExclamationCircleOutlined /> },
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          <ClusterOutlined style={{ fontSize: 20, color: "#1890ff" }} />
          <Title level={4} style={{ margin: 0 }}>K8s 集群管理</Title>
          <Tag color="blue">Beta</Tag>
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchClusters}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setRegisterModalVisible(true)}>
            注册集群
          </Button>
        </Space>
      </div>

      {/* 功能开发中提示 */}
      <Alert
        message="K8s 集群管理功能开发中"
        description={
          <div>
            <Paragraph style={{ margin: 0 }}>
              K8s 集群管理功能正在开发中，后端 API 就绪后将支持：
            </Paragraph>
            <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
              <li>通过 kubeconfig 注册 K8s 集群</li>
              <li>集群健康检查与状态监控</li>
              <li>集群节点与资源概览</li>
              <li>K8s 类型资源池关联</li>
            </ul>
          </div>
        }
        type="info"
        showIcon
        icon={<ApiOutlined />}
        style={{ marginBottom: 16 }}
      />

      {/* 概览卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small" hoverable>
            <Statistic title="集群总数" value={clusters.length} prefix={<ClusterOutlined />} valueStyle={{ color: "#1890ff" }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" hoverable>
            <Statistic title="已连接" value={clusters.filter(c => c.status === "CONNECTED").length} prefix={<CheckCircleOutlined />} valueStyle={{ color: "#52c41a" }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" hoverable>
            <Statistic title="已断开" value={clusters.filter(c => c.status === "DISCONNECTED").length} prefix={<CloseCircleOutlined />} valueStyle={{ color: "#ff4d4f" }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" hoverable>
            <Statistic title="总节点数" value={clusters.reduce((s, c) => s + (c.nodeCount || 0), 0)} prefix={<CloudServerOutlined />} valueStyle={{ color: "#722ed1" }} />
          </Card>
        </Col>
      </Row>

      {/* 集群列表 */}
      {clusters.length === 0 ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                暂无已注册的 K8s 集群
                <br />
                <Text type="secondary">点击「注册集群」导入 kubeconfig 以开始管理</Text>
              </span>
            }
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setRegisterModalVisible(true)}>
              注册集群
            </Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {clusters.map(cluster => {
            const status = statusConfig[cluster.status] || statusConfig.UNKNOWN;
            return (
              <Col key={cluster.id} xs={24} sm={12} lg={8}>
                <Card
                  size="small"
                  hoverable
                  title={
                    <Space>
                      <ClusterOutlined />
                      <span>{cluster.name}</span>
                    </Space>
                  }
                  extra={<Tag color={status.color} icon={status.icon}>{status.text}</Tag>}
                  actions={[
                    <Tooltip title="健康检查">
                      <HeartOutlined onClick={() => handleHealthCheck(cluster.id)} />
                    </Tooltip>,
                    <Tooltip title="查看详情">
                      <FileTextOutlined />
                    </Tooltip>,
                  ]}
                >
                  <Descriptions size="small" column={1}>
                    <Descriptions.Item label="版本">{cluster.version || "-"}</Descriptions.Item>
                    <Descriptions.Item label="节点数">{cluster.nodeCount || 0}</Descriptions.Item>
                    <Descriptions.Item label="Provider">{cluster.provider || "-"}</Descriptions.Item>
                    <Descriptions.Item label="注册时间">
                      {cluster.createdAt ? new Date(cluster.createdAt).toLocaleDateString("zh-CN") : "-"}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* 注册集群弹窗 */}
      <Modal
        title={<Space><ClusterOutlined /><span>注册 K8s 集群</span></Space>}
        open={registerModalVisible}
        onOk={handleRegister}
        onCancel={() => { setRegisterModalVisible(false); form.resetFields(); }}
        okText="注册"
        cancelText="取消"
        width={640}
      >
        <Alert
          message="后端 API 开发中"
          description="当前为 UI 预览，集群注册功能将在后端 API 就绪后启用。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="集群名称" rules={[{ required: true, message: "请输入集群名称" }]}>
            <Input placeholder="例如：prod-cluster-01" prefix={<ClusterOutlined />} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="集群描述（可选）" />
          </Form.Item>
          <Form.Item label="Kubeconfig 导入方式">
            <Tabs activeKey={kubeconfigInput} onChange={setKubeconfigInput} size="small">
              <TabPane tab={<span><UploadOutlined /> 文件上传</span>} key="file">
                <Dragger
                  accept=".yaml,.yml,.conf,.config"
                  maxCount={1}
                  beforeUpload={(file) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                      form.setFieldsValue({ kubeconfig: e.target.result });
                      message.success(`已读取文件: ${file.name}`);
                    };
                    reader.readAsText(file);
                    return false;
                  }}
                >
                  <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                  <p className="ant-upload-text">点击或拖拽 kubeconfig 文件到此处</p>
                  <p className="ant-upload-hint">支持 .yaml, .yml, .conf 格式</p>
                </Dragger>
              </TabPane>
              <TabPane tab={<span><CopyOutlined /> 文本粘贴</span>} key="text">
                <Form.Item name="kubeconfig" rules={[{ required: true, message: "请粘贴 kubeconfig 内容" }]}>
                  <TextArea
                    rows={10}
                    placeholder={`apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    server: https://your-k8s-api:6443\n    certificate-authority-data: ...\n  name: my-cluster\n...`}
                    style={{ fontFamily: "monospace", fontSize: 12 }}
                  />
                </Form.Item>
              </TabPane>
            </Tabs>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
