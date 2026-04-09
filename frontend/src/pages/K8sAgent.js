/**
 * @file K8sAgent.js
 * @description K8s Agent 接入页 — YAML 生成+状态跟踪 (UI 骨架)
 * Issue: #253 K8s Agent 接入
 * @feat #253
 *
 * 纯 UI 骨架，后端 API 占位:
 * - GET /api/clusters/{id}/agent-yaml — 生成 Agent YAML
 * - GET /api/clusters/{id}/agent-status — Agent 状态
 * - POST /api/clusters/{id}/deploy-agent — 部署 Agent
 */
import React, { useState } from "react";
import {
  Card, Steps, Button, Space, Typography, Alert, Tag, Input,
  Row, Col, message, Tooltip, Descriptions, Badge, Empty,
} from "antd";
import {
  CloudServerOutlined, CodeOutlined, CheckCircleOutlined,
  CopyOutlined, RocketOutlined, SyncOutlined,
  ClusterOutlined, FileTextOutlined, ApiOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Step } = Steps;

/* ============ Agent YAML 模板 ============ */
const generateAgentYaml = (clusterName = "my-cluster", namespace = "ahvp-system") => `# AHVP Agent DaemonSet
# 集群: ${clusterName}
# 自动生成时间: ${new Date().toISOString()}
---
apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
  labels:
    app: ahvp-agent
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ahvp-agent
  namespace: ${namespace}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ahvp-agent
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- kind: ServiceAccount
  name: ahvp-agent
  namespace: ${namespace}
---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: ahvp-agent
  namespace: ${namespace}
  labels:
    app: ahvp-agent
spec:
  selector:
    matchLabels:
      app: ahvp-agent
  template:
    metadata:
      labels:
        app: ahvp-agent
    spec:
      serviceAccountName: ahvp-agent
      hostNetwork: true
      hostPID: true
      containers:
      - name: agent
        image: registry.cn-shanghai.aliyuncs.com/ahvp/agent:latest
        env:
        - name: AHVP_SERVER_URL
          value: "http://39.97.251.94:8080"
        - name: AHVP_CLUSTER_NAME
          value: "${clusterName}"
        - name: NODE_NAME
          valueFrom:
            fieldRef:
              fieldPath: spec.nodeName
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
        volumeMounts:
        - name: host-root
          mountPath: /host
          readOnly: true
      volumes:
      - name: host-root
        hostPath:
          path: /
      tolerations:
      - operator: Exists
`;

/* ============ 主组件 ============ */
export default function K8sAgent() {
  const [currentStep, setCurrentStep] = useState(0);
  const [clusterName, setClusterName] = useState("my-cluster");
  const [namespace, setNamespace] = useState("ahvp-system");

  const yaml = generateAgentYaml(clusterName, namespace);
  const kubectlCommand = `kubectl apply -f ahvp-agent.yaml`;
  const verifyCommand = `kubectl get pods -n ${namespace} -l app=ahvp-agent`;

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success(`${label} 已复制到剪贴板`);
    }).catch(() => {
      message.error("复制失败，请手动复制");
    });
  };

  /* ---- 注册状态跟踪 (Mock) ---- */
  const registrationSteps = [
    { title: "集群注册", description: "通过 kubeconfig 注册集群" },
    { title: "部署 Agent", description: "在集群中部署 AHVP Agent" },
    { title: "Agent 连接", description: "等待 Agent 连接到平台" },
    { title: "就绪", description: "集群资源纳管完成" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          <RocketOutlined style={{ fontSize: 20, color: "#1890ff" }} />
          <Title level={4} style={{ margin: 0 }}>K8s Agent 接入</Title>
          <Tag color="blue">Beta</Tag>
        </Space>
      </div>

      {/* 功能开发中提示 */}
      <Alert
        message="K8s Agent 接入功能开发中"
        description="后端 API 就绪后，将支持一键生成 Agent 配置并自动跟踪接入状态。当前提供 YAML 模板参考。"
        type="info"
        showIcon
        icon={<ApiOutlined />}
        style={{ marginBottom: 16 }}
      />

      <Row gutter={[16, 16]}>
        {/* 左侧：接入步骤 */}
        <Col xs={24} lg={16}>
          <Card title={<Space><FileTextOutlined /><span>Agent 部署指南</span></Space>} size="small">
            <Steps current={currentStep} onChange={setCurrentStep} size="small" style={{ marginBottom: 24 }}>
              {registrationSteps.map((step, i) => (
                <Step key={i} title={step.title} description={step.description} />
              ))}
            </Steps>

            {currentStep === 0 && (
              <div>
                <Title level={5}>Step 1: 注册 K8s 集群</Title>
                <Paragraph>
                  首先在「K8s 集群管理」页面通过 kubeconfig 注册您的集群。
                </Paragraph>
                <Alert
                  message="前置条件"
                  description={
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      <li>Kubernetes 集群版本 &ge; 1.20</li>
                      <li>拥有 cluster-admin 权限的 kubeconfig</li>
                      <li>集群网络可访问 AHVP 平台（39.97.251.94:8080）</li>
                    </ul>
                  }
                  type="info"
                  showIcon
                />
              </div>
            )}

            {currentStep === 1 && (
              <div>
                <Title level={5}>Step 2: 配置并部署 Agent</Title>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={12}>
                    <Text strong>集群名称</Text>
                    <Input
                      value={clusterName}
                      onChange={e => setClusterName(e.target.value)}
                      placeholder="集群名称"
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Text strong>命名空间</Text>
                    <Input
                      value={namespace}
                      onChange={e => setNamespace(e.target.value)}
                      placeholder="ahvp-system"
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                </Row>

                <Card
                  size="small"
                  title="Agent YAML"
                  extra={
                    <Button
                      type="link"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(yaml, "YAML")}
                    >
                      复制
                    </Button>
                  }
                  style={{ marginBottom: 16 }}
                >
                  <TextArea
                    value={yaml}
                    readOnly
                    rows={15}
                    style={{ fontFamily: "monospace", fontSize: 11, background: "#f5f5f5" }}
                  />
                </Card>

                <Card size="small" title="部署命令">
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <Input
                      value={kubectlCommand}
                      readOnly
                      style={{ fontFamily: "monospace", fontSize: 12 }}
                    />
                    <Tooltip title="复制命令">
                      <Button icon={<CopyOutlined />} onClick={() => handleCopy(kubectlCommand, "命令")} />
                    </Tooltip>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    将 YAML 保存为 ahvp-agent.yaml，然后执行上述命令。
                  </Text>
                </Card>
              </div>
            )}

            {currentStep === 2 && (
              <div>
                <Title level={5}>Step 3: 验证 Agent 连接</Title>
                <Card size="small" title="检查 Agent 状态" style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <Input
                      value={verifyCommand}
                      readOnly
                      style={{ fontFamily: "monospace", fontSize: 12 }}
                    />
                    <Tooltip title="复制命令">
                      <Button icon={<CopyOutlined />} onClick={() => handleCopy(verifyCommand, "命令")} />
                    </Tooltip>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    执行上述命令确认 Agent Pod 运行正常。
                  </Text>
                </Card>
                <Alert
                  message="等待连接"
                  description="Agent 部署后通常需要 1-2 分钟完成初始化并连接到平台。可在此页面查看实时状态。"
                  type="info"
                  showIcon
                />
              </div>
            )}

            {currentStep === 3 && (
              <div>
                <Title level={5}>Step 4: 接入完成</Title>
                <Alert
                  message="集群就绪"
                  description="Agent 已成功连接，集群资源已纳管。可在「资源池管理」中创建 K8S_POOL 类型资源池并关联此集群。"
                  type="success"
                  showIcon
                />
              </div>
            )}

            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
              <Space>
                {currentStep > 0 && (
                  <Button onClick={() => setCurrentStep(currentStep - 1)}>上一步</Button>
                )}
                {currentStep < registrationSteps.length - 1 && (
                  <Button type="primary" onClick={() => setCurrentStep(currentStep + 1)}>
                    下一步
                  </Button>
                )}
              </Space>
            </div>
          </Card>
        </Col>

        {/* 右侧：状态面板 */}
        <Col xs={24} lg={8}>
          <Card title={<Space><SyncOutlined /><span>接入状态</span></Space>} size="small" style={{ marginBottom: 16 }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span>
                  暂无接入中的集群
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>完成集群注册后此处显示实时状态</Text>
                </span>
              }
            />
          </Card>

          <Card title={<Space><ThunderboltOutlined /><span>快速帮助</span></Space>} size="small">
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              <Alert message="Agent 日志查看" type="info" showIcon description="kubectl logs -n ahvp-system -l app=ahvp-agent --tail=50" />
              <Alert message="Agent 重启" type="warning" showIcon description="kubectl rollout restart ds/ahvp-agent -n ahvp-system" />
              <Alert message="Agent 卸载" type="error" showIcon description="kubectl delete -f ahvp-agent.yaml" />
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
