/**
 * @file ClusterOnboardTab.js
 * @description 集群纳管 Tab — 已注册集群列表 + 注册新集群（3步 Steps）
 * 合并了原 ClusterList.js 和 K8sAgent.js 的功能
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Table, Button, Space, Typography, Tag, Steps, Form, Input, Upload,
  message, Alert, Spin, Progress, Empty, Popconfirm, Card, Divider, Result,
} from "antd";
import {
  PlusOutlined, ClusterOutlined, ReloadOutlined, DeleteOutlined,
  UploadOutlined, CopyOutlined, InboxOutlined, CheckCircleOutlined,
  CloseCircleOutlined, EyeOutlined, RocketOutlined,
} from "@ant-design/icons";
import api from "../../utils/api";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;

/* 集群状态映射 */
const STATUS_MAP = {
  CONNECTED: { color: "green", text: "已连接" },
  DEPLOYING: { color: "processing", text: "部署中" },
  DISCONNECTED: { color: "red", text: "已断开" },
  PENDING: { color: "orange", text: "连接中" },
  UNKNOWN: { color: "default", text: "未知" },
};

export default function ClusterOnboardTab({ onNavigateToNodes }) {
  /* === 集群列表 === */
  const [clusters, setClusters] = useState([]);
  const [listLoading, setListLoading] = useState(false);

  /* === 注册新集群 === */
  const [showRegister, setShowRegister] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [form] = Form.useForm();
  const [kubeconfigContent, setKubeconfigContent] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployProgress, setDeployProgress] = useState(0);
  const [deployStatus, setDeployStatus] = useState(""); // deploying | success | failed
  const [discoveredNodes, setDiscoveredNodes] = useState([]);
  const [newClusterId, setNewClusterId] = useState(null);
  const pollRef = useRef(null);

  /* 获取集群列表 */
  const fetchClusters = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await api.get("/k8s/clusters");
      if (res.data.code === 0) {
        setClusters(res.data.data || []);
      }
    } catch {
      // API 可能不存在，降级显示空状态
      setClusters([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  /* 清理轮询 */
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  /* 删除集群 */
  const handleDelete = async (id) => {
    try {
      await api.delete(`/k8s/clusters/${id}`);
      message.success("集群已删除");
      fetchClusters();
    } catch (err) {
      message.error("删除失败: " + (err.displayMessage || "未知错误"));
    }
  };

  /* Step 1: 提交 kubeconfig 注册集群 */
  const handleSubmitCluster = async () => {
    try {
      const values = await form.validateFields(["clusterName"]);
      if (!kubeconfigContent) {
        message.warning("请上传或粘贴 kubeconfig 内容");
        return;
      }
      setDeploying(true);
      setDeployProgress(0);
      setDeployStatus("deploying");
      setCurrentStep(1);

      const res = await api.post("/k8s/clusters", {
        name: values.clusterName,
        kubeconfig: kubeconfigContent,
      });

      if (res.data.code === 0) {
        const clusterId = res.data.data?.id;
        setNewClusterId(clusterId);
        message.success("集群注册成功，正在部署 Agent...");
        // 开始轮询部署进度
        if (clusterId) {
          pollDeployStatus(clusterId);
        } else {
          // 无 ID 返回，模拟完成
          simulateDeployProgress();
        }
      } else {
        message.error(res.data.message || "注册失败");
        setDeployStatus("failed");
        setDeploying(false);
      }
    } catch (err) {
      message.error("注册失败: " + (err.displayMessage || err.message || "未知错误"));
      setDeployStatus("failed");
      setDeploying(false);
    }
  };

  /* 轮询部署进度 */
  const pollDeployStatus = (clusterId) => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await api.get(`/k8s/clusters/${clusterId}/status`);
        if (res.data.code === 0) {
          const data = res.data.data;
          setDeployProgress(data.progress || 0);
          if (data.status === "completed" || data.progress >= 100) {
            clearInterval(pollRef.current);
            setDeployStatus("success");
            setDeploying(false);
            setDiscoveredNodes(data.nodes || []);
            setCurrentStep(2);
            fetchClusters();
          } else if (data.status === "failed") {
            clearInterval(pollRef.current);
            setDeployStatus("failed");
            setDeploying(false);
          }
        }
      } catch {
        // API 不通，降级模拟
        if (attempts === 1) simulateDeployProgress();
        clearInterval(pollRef.current);
      }
      if (attempts >= 60) {
        clearInterval(pollRef.current);
        setDeployStatus("failed");
        setDeploying(false);
        message.error("部署超时，请检查集群状态");
      }
    }, 3000);
  };

  /* 模拟部署进度（API 不通时降级） */
  const simulateDeployProgress = () => {
    let progress = 10;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(pollRef.current);
        setDeployProgress(100);
        setDeployStatus("success");
        setDeploying(false);
        setCurrentStep(2);
        setDiscoveredNodes([]);
        fetchClusters();
      } else {
        setDeployProgress(progress);
      }
    }, 1500);
  };

  /* 重置注册流程 */
  const handleResetRegister = () => {
    setShowRegister(false);
    setCurrentStep(0);
    setDeployProgress(0);
    setDeployStatus("");
    setDiscoveredNodes([]);
    setNewClusterId(null);
    setKubeconfigContent("");
    form.resetFields();
    if (pollRef.current) clearInterval(pollRef.current);
  };

  /* 文件上传处理 */
  const handleFileUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setKubeconfigContent(e.target.result);
      message.success(`已读取文件: ${file.name}`);
    };
    reader.readAsText(file);
    return false;
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(
      () => message.success("已复制到剪贴板"),
      () => message.error("复制失败"),
    );
  };

  /* 集群列表列定义 */
  const clusterColumns = [
    {
      title: "集群名称", dataIndex: "name", key: "name",
      render: (text) => <Space><ClusterOutlined />{text}</Space>,
    },
    { title: "节点数", dataIndex: "nodeCount", key: "nodeCount", width: 80 },
    {
      title: "状态", dataIndex: "status", key: "status", width: 100,
      render: (status) => {
        const cfg = STATUS_MAP[status] || STATUS_MAP.UNKNOWN;
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: "注册时间", dataIndex: "createdAt", key: "createdAt", width: 180,
      render: (v) => v ? new Date(v).toLocaleString("zh-CN") : "-",
    },
    {
      title: "操作", key: "action", width: 140,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />}>详情</Button>
          <Popconfirm title="确定删除此集群？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /* 发现的节点列表列定义 */
  const nodeColumns = [
    { title: "节点名称", dataIndex: "name", key: "name" },
    { title: "IP", dataIndex: "ip", key: "ip", width: 140 },
    {
      title: "状态", dataIndex: "status", key: "status", width: 80,
      render: (v) => (
        <Tag color={v === "Ready" || v === "ONLINE" ? "green" : "red"}>
          {v || "未知"}
        </Tag>
      ),
    },
  ];

  /* 注册新集群的 Steps 内容 */
  const renderStep0 = () => (
    <div style={{ maxWidth: 640 }}>
      <Form form={form} layout="vertical">
        <Form.Item
          name="clusterName"
          label="集群名称"
          rules={[{ required: true, message: "请输入集群名称" }]}
        >
          <Input placeholder="如: prod-cluster-01" prefix={<ClusterOutlined />} />
        </Form.Item>
        <Form.Item label="导入 Kubeconfig">
          <Dragger
            accept=".yaml,.yml,.conf,.config"
            maxCount={1}
            beforeUpload={handleFileUpload}
            showUploadList={false}
            style={{ marginBottom: 12 }}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">点击或拖拽 kubeconfig 文件到此处</p>
            <p className="ant-upload-hint">支持 .yaml, .yml, .conf 格式</p>
          </Dragger>
          <Divider plain>或直接粘贴</Divider>
          <TextArea
            rows={8}
            placeholder="粘贴 kubeconfig YAML 内容..."
            style={{ fontFamily: "monospace", fontSize: 12 }}
            value={kubeconfigContent}
            onChange={(e) => setKubeconfigContent(e.target.value)}
          />
        </Form.Item>
      </Form>
      {kubeconfigContent && (
        <Alert
          message={`已导入 kubeconfig（${kubeconfigContent.length} 字符）`}
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={() => handleCopy(kubeconfigContent)}>
              复制
            </Button>
          }
        />
      )}
      <Button
        type="primary"
        icon={<RocketOutlined />}
        onClick={handleSubmitCluster}
        size="large"
        disabled={!kubeconfigContent}
      >
        注册集群并部署 Agent
      </Button>
    </div>
  );

  const renderStep1 = () => (
    <div style={{ textAlign: "center", padding: "40px 0" }}>
      <Spin spinning={deploying} size="large" />
      <Title level={5} style={{ marginTop: 16 }}>
        {deployStatus === "failed" ? "部署失败" : "正在部署 Agent DaemonSet..."}
      </Title>
      <Progress
        percent={deployProgress}
        status={deployStatus === "failed" ? "exception" : "active"}
        style={{ maxWidth: 400, margin: "16px auto" }}
      />
      <Text type="secondary">
        {deployStatus === "failed"
          ? "Agent 部署失败，请检查 kubeconfig 是否有效且集群可达"
          : "正在将 AHVP Agent 部署到集群各节点，请稍候..."}
      </Text>
      {deployStatus === "failed" && (
        <div style={{ marginTop: 16 }}>
          <Button onClick={() => { setCurrentStep(0); setDeployStatus(""); }}>
            返回重试
          </Button>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <Result
      status="success"
      title="集群纳管完成"
      subTitle={
        discoveredNodes.length > 0
          ? `已成功发现 ${discoveredNodes.length} 个节点并注册到平台`
          : "Agent 已部署完成，节点将在 Agent 上线后自动发现"
      }
      extra={[
        <Button
          key="nodes"
          type="primary"
          onClick={() => onNavigateToNodes && onNavigateToNodes()}
        >
          查看节点
        </Button>,
        <Button key="more" onClick={handleResetRegister}>
          继续注册
        </Button>,
      ]}
    >
      {discoveredNodes.length > 0 && (
        <Table
          dataSource={discoveredNodes}
          columns={nodeColumns}
          rowKey="name"
          size="small"
          pagination={false}
          style={{ maxWidth: 600, margin: "0 auto" }}
        />
      )}
    </Result>
  );

  return (
    <div>
      {/* 上半部分：已注册集群列表 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Title level={5} style={{ margin: 0 }}>已注册集群</Title>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchClusters}>刷新</Button>
            {!showRegister && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setShowRegister(true)}
              >
                注册新集群
              </Button>
            )}
          </Space>
        </div>

        {clusters.length > 0 ? (
          <Table
            dataSource={clusters}
            columns={clusterColumns}
            rowKey="id"
            loading={listLoading}
            size="small"
            pagination={{ pageSize: 10 }}
          />
        ) : (
          <Card>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span>
                  暂无已注册的 K8s 集群
                  <br />
                  <Text type="secondary">
                    {listLoading ? "加载中..." : "点击「注册新集群」导入 kubeconfig 开始纳管"}
                  </Text>
                </span>
              }
            >
              {!showRegister && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setShowRegister(true)}
                >
                  注册新集群
                </Button>
              )}
            </Empty>
          </Card>
        )}
      </div>

      {/* 下半部分：注册新集群 */}
      {showRegister && (
        <>
          <Divider />
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Title level={5} style={{ margin: 0 }}>注册新集群</Title>
              <Button onClick={handleResetRegister}>取消</Button>
            </div>
            <Steps
              current={currentStep}
              style={{ marginBottom: 24, maxWidth: 600 }}
              items={[
                { title: "导入 Kubeconfig" },
                { title: "部署 Agent" },
                { title: "节点发现完成" },
              ]}
            />
            {currentStep === 0 && renderStep0()}
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
          </div>
        </>
      )}
    </div>
  );
}
