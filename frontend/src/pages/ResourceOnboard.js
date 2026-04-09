/**
 * @file ResourceOnboard.js
 * @description 统一资源纳管向导 — 单节点 + K8s 集群统一入口
 * @feat 统一资源纳管流程重构
 */
import React, { useState } from "react";
import {
  Card, Steps, Button, Space, Typography, Radio, Form, Input, Row, Col,
  message, Alert, Table, Tag, Descriptions, Spin, Result,
} from "antd";
import {
  CloudServerOutlined, ClusterOutlined, CheckCircleOutlined,
  CopyOutlined, ArrowLeftOutlined, RocketOutlined,
} from "@ant-design/icons";
import { k8sApi, nodeApi } from "../utils/api";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const ONBOARD_TYPES = {
  SINGLE: "single",
  K8S: "k8s",
};

export default function ResourceOnboard({ onBack }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [onboardType, setOnboardType] = useState(ONBOARD_TYPES.K8S);
  const [form] = Form.useForm();

  /* K8s 状态 */
  const [validating, setValidating] = useState(false);
  const [clusterInfo, setClusterInfo] = useState(null);
  const [k8sNodes, setK8sNodes] = useState([]);
  const [registering, setRegistering] = useState(false);
  const [registerResult, setRegisterResult] = useState(null);

  /* 单节点状态 */
  const [singleScript, setSingleScript] = useState("");

  const steps = [
    { title: "选择接入方式" },
    { title: onboardType === ONBOARD_TYPES.K8S ? "配置集群" : "配置节点" },
    { title: "确认纳管" },
  ];

  /* ===== K8s: 使用当前 kubeconfig 获取集群信息 ===== */
  const handleK8sValidate = async () => {
    setValidating(true);
    try {
      const res = await k8sApi.clusterInfo();
      if (res.data.code === 0) {
        setClusterInfo(res.data.data.cluster);
        setK8sNodes(res.data.data.nodes);
        message.success("集群连接验证成功");
      } else {
        message.error(res.data.message || "集群验证失败");
      }
    } catch (err) {
      message.error("集群连接失败: " + (err.message || "未知错误"));
    } finally {
      setValidating(false);
    }
  };

  /* ===== K8s: 自定义 kubeconfig 验证 ===== */
  const handleCustomValidate = async () => {
    const kubeconfig = form.getFieldValue("kubeconfig");
    if (!kubeconfig) {
      message.warning("请粘贴 kubeconfig 内容");
      return;
    }
    setValidating(true);
    try {
      const res = await k8sApi.validate(kubeconfig);
      if (res.data.code === 0) {
        setClusterInfo(res.data.data.cluster);
        setK8sNodes(res.data.data.nodes);
        message.success("集群连接验证成功");
      } else {
        message.error(res.data.message || "验证失败");
      }
    } catch (err) {
      message.error("验证失败: " + (err.message || "未知错误"));
    } finally {
      setValidating(false);
    }
  };

  /* ===== 确认纳管: 注册 K8s 节点到平台 ===== */
  const handleConfirmK8s = async () => {
    setRegistering(true);
    try {
      const clusterName = form.getFieldValue("clusterName") || "ack-cluster";
      const res = await k8sApi.registerNodes({
        clusterName,
        platformUrl: "http://localhost:8080/api",
        platformToken: "ahvp-agent-secret-2026",
      });
      if (res.data.code === 0) {
        setRegisterResult(res.data.data);
        message.success("K8s 节点注册成功");
        setCurrentStep(2);
      } else {
        message.error(res.data.message || "注册失败");
      }
    } catch (err) {
      message.error("注册失败: " + (err.message || "未知错误"));
    } finally {
      setRegistering(false);
    }
  };

  /* ===== 单节点: 生成部署脚本 ===== */
  const handleGenerateScript = async () => {
    try {
      const values = await form.validateFields(["nodeName", "nodeIp", "nodePort"]);
      const script = [
        "#!/bin/bash",
        "# AHVP Agent 部署脚本",
        `# 节点: ${values.nodeName} (${values.nodeIp}:${values.nodePort})`,
        "",
        "cd /opt/ahvp-agent",
        "cat > config.yaml << EOF",
        "platform:",
        "  url: http://39.97.251.94:8080/api",
        "  token: ahvp-agent-secret-2026",
        "node:",
        `  name: "${values.nodeName}"`,
        `  description: "手动纳管节点 ${values.nodeIp}"`,
        "  tags: cpu,manual",
        "agent:",
        `  port: ${values.nodePort || 8090}`,
        "  host: 0.0.0.0",
        "heartbeat:",
        "  interval: 30",
        "EOF",
        "",
        "python3 main.py &",
        "echo Agent 已启动",
      ].join("\n");
      setSingleScript(script);
      message.success("部署脚本已生成");
    } catch {
      /* validation error */
    }
  };

  /* ===== 单节点: 注册到平台 ===== */
  const handleConfirmSingle = async () => {
    setRegistering(true);
    try {
      const values = form.getFieldsValue(["nodeName", "nodeIp", "nodePort"]);
      await nodeApi.register({
        name: values.nodeName,
        ip: values.nodeIp,
        port: values.nodePort || 8090,
        tags: "cpu,manual",
        description: "手动纳管节点 " + values.nodeIp,
      });
      setRegisterResult({ type: "single" });
      message.success("节点注册成功");
      setCurrentStep(2);
    } catch (err) {
      message.error("注册失败: " + (err.response?.data?.message || err.message || "未知错误"));
    } finally {
      setRegistering(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(
      () => message.success("已复制到剪贴板"),
      () => message.error("复制失败")
    );
  };

  const k8sNodeColumns = [
    { title: "节点名称", dataIndex: "name", key: "name", ellipsis: true },
    { title: "IP", dataIndex: "ip", key: "ip", width: 140 },
    {
      title: "状态", dataIndex: "ready", key: "ready", width: 80,
      render: (v) => (
        <Tag color={v === "True" ? "green" : "red"}>
          {v === "True" ? "Ready" : "NotReady"}
        </Tag>
      ),
    },
    { title: "CPU", dataIndex: "cpu", key: "cpu", width: 60 },
    {
      title: "内存", dataIndex: "memory", key: "memory", width: 100,
      render: (v) => {
        const mb = parseInt(v, 10) / 1024;
        return mb > 1024 ? (mb / 1024).toFixed(1) + " GB" : mb.toFixed(0) + " MB";
      },
    },
    { title: "OS", dataIndex: "os", key: "os", ellipsis: true },
    { title: "Kubelet", dataIndex: "kubelet", key: "kubelet", width: 160 },
  ];

  /* ===== 渲染各步骤 ===== */
  const renderStep0 = () => (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "40px 0" }}>
      <Title level={4} style={{ textAlign: "center", marginBottom: 32 }}>
        选择资源接入方式
      </Title>
      <Radio.Group
        value={onboardType}
        onChange={(e) => setOnboardType(e.target.value)}
        style={{ width: "100%" }}
      >
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Card
            hoverable
            style={{
              border: onboardType === ONBOARD_TYPES.SINGLE ? "2px solid #1890ff" : "1px solid #d9d9d9",
              cursor: "pointer",
            }}
            onClick={() => setOnboardType(ONBOARD_TYPES.SINGLE)}
          >
            <Radio value={ONBOARD_TYPES.SINGLE}>
              <Space>
                <CloudServerOutlined style={{ fontSize: 24, color: "#1890ff" }} />
                <div>
                  <Text strong style={{ fontSize: 16 }}>单节点接入</Text>
                  <br />
                  <Text type="secondary">输入 IP/端口，生成 Agent 部署脚本，适合独立服务器</Text>
                </div>
              </Space>
            </Radio>
          </Card>
          <Card
            hoverable
            style={{
              border: onboardType === ONBOARD_TYPES.K8S ? "2px solid #1890ff" : "1px solid #d9d9d9",
              cursor: "pointer",
            }}
            onClick={() => setOnboardType(ONBOARD_TYPES.K8S)}
          >
            <Radio value={ONBOARD_TYPES.K8S}>
              <Space>
                <ClusterOutlined style={{ fontSize: 24, color: "#722ed1" }} />
                <div>
                  <Text strong style={{ fontSize: 16 }}>K8s 集群接入</Text>
                  <br />
                  <Text type="secondary">验证集群连接，自动发现节点，批量纳管</Text>
                </div>
              </Space>
            </Radio>
          </Card>
        </Space>
      </Radio.Group>
    </div>
  );

  const renderStep1Single = () => (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <Title level={5}>配置单节点信息</Title>
      <Form form={form} layout="vertical">
        <Form.Item name="nodeName" label="节点名称" rules={[{ required: true, message: "请输入节点名称" }]}>
          <Input placeholder="如: prod-node-01" />
        </Form.Item>
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item name="nodeIp" label="IP 地址" rules={[{ required: true, message: "请输入 IP" }]}>
              <Input placeholder="如: 192.168.1.100" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="nodePort" label="Agent 端口" initialValue={8090}>
              <Input placeholder="8090" type="number" />
            </Form.Item>
          </Col>
        </Row>
        <Button type="primary" onClick={handleGenerateScript}>生成部署脚本</Button>
      </Form>
      {singleScript && (
        <Card
          size="small"
          title="部署脚本"
          style={{ marginTop: 16 }}
          extra={<Button type="link" icon={<CopyOutlined />} onClick={() => handleCopy(singleScript)}>复制</Button>}
        >
          <TextArea value={singleScript} readOnly rows={12} style={{ fontFamily: "monospace", fontSize: 12, background: "#f5f5f5" }} />
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message="将上述脚本复制到目标节点执行后，Agent 会自动注册到平台"
          />
        </Card>
      )}
    </div>
  );

  const renderStep1K8s = () => (
    <div>
      <Title level={5}>K8s 集群连接验证</Title>
      <Form form={form} layout="vertical">
        <Form.Item name="clusterName" label="集群名称" initialValue="ack-cluster" rules={[{ required: true }]}>
          <Input placeholder="集群名称，用于标识" />
        </Form.Item>
      </Form>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={handleK8sValidate} loading={validating}>
          使用当前 kubeconfig 验证
        </Button>
        <Text type="secondary">或</Text>
        <Button onClick={() => form.setFieldValue("showCustom", true)}>粘贴自定义 kubeconfig</Button>
      </Space>

      {form.getFieldValue("showCustom") && (
        <Form form={form} layout="vertical" style={{ marginBottom: 16 }}>
          <Form.Item name="kubeconfig" label="Kubeconfig 内容">
            <TextArea rows={8} placeholder="粘贴 kubeconfig YAML 内容..." style={{ fontFamily: "monospace", fontSize: 12 }} />
          </Form.Item>
          <Button type="primary" onClick={handleCustomValidate} loading={validating}>验证自定义 kubeconfig</Button>
        </Form>
      )}

      {validating && <Spin tip="正在验证集群连接..." style={{ display: "block", margin: "20px 0" }} />}

      {clusterInfo && (
        <div style={{ marginTop: 16 }}>
          <Alert type="success" showIcon message="集群连接验证成功" style={{ marginBottom: 16 }} />
          <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="K8s 版本">{clusterInfo.version}</Descriptions.Item>
            <Descriptions.Item label="平台">{clusterInfo.platform}</Descriptions.Item>
            <Descriptions.Item label="节点数量">{clusterInfo.nodeCount}</Descriptions.Item>
            <Descriptions.Item label="Go 版本">{clusterInfo.goVersion}</Descriptions.Item>
          </Descriptions>
          <Title level={5} style={{ marginTop: 16 }}>发现的节点</Title>
          <Table
            dataSource={k8sNodes}
            columns={k8sNodeColumns}
            rowKey="name"
            size="small"
            pagination={false}
          />
        </div>
      )}
    </div>
  );

  const renderStep2 = () => {
    if (registerResult) {
      return (
        <Result
          status="success"
          title="资源纳管成功"
          subTitle={
            onboardType === ONBOARD_TYPES.K8S
              ? `已成功将 ${k8sNodes.length} 个 K8s 节点注册到平台`
              : "节点已成功注册到平台"
          }
          extra={[
            <Button key="list" type="primary" onClick={() => onBack && onBack()}>
              返回节点列表
            </Button>,
          ]}
        />
      );
    }

    return (
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <Title level={5}>确认纳管信息</Title>
        {onboardType === ONBOARD_TYPES.K8S && clusterInfo && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="接入方式">
                <Tag color="purple" icon={<ClusterOutlined />}>K8s 集群</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="集群名称">{form.getFieldValue("clusterName") || "ack-cluster"}</Descriptions.Item>
              <Descriptions.Item label="K8s 版本">{clusterInfo.version}</Descriptions.Item>
              <Descriptions.Item label="节点数量">{clusterInfo.nodeCount}</Descriptions.Item>
            </Descriptions>
            <Table
              dataSource={k8sNodes}
              columns={k8sNodeColumns}
              rowKey="name"
              size="small"
              pagination={false}
              style={{ marginBottom: 16 }}
            />
            <Button
              type="primary"
              icon={<RocketOutlined />}
              onClick={handleConfirmK8s}
              loading={registering}
              size="large"
              block
            >
              确认纳管 — 注册 {k8sNodes.length} 个节点到平台
            </Button>
          </>
        )}
        {onboardType === ONBOARD_TYPES.SINGLE && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="接入方式">
                <Tag color="blue" icon={<CloudServerOutlined />}>单节点</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="节点名称">{form.getFieldValue("nodeName")}</Descriptions.Item>
              <Descriptions.Item label="IP 地址">{form.getFieldValue("nodeIp")}</Descriptions.Item>
              <Descriptions.Item label="端口">{form.getFieldValue("nodePort") || 8090}</Descriptions.Item>
            </Descriptions>
            <Button
              type="primary"
              icon={<RocketOutlined />}
              onClick={handleConfirmSingle}
              loading={registering}
              size="large"
              block
            >
              确认纳管 — 注册节点到平台
            </Button>
          </>
        )}
      </div>
    );
  };

  const canNext = () => {
    if (currentStep === 0) return true;
    if (currentStep === 1 && onboardType === ONBOARD_TYPES.K8S) return !!clusterInfo;
    if (currentStep === 1 && onboardType === ONBOARD_TYPES.SINGLE) return !!singleScript;
    return false;
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => onBack && onBack()} />
        <Space>
          <RocketOutlined style={{ fontSize: 20, color: "#1890ff" }} />
          <Title level={4} style={{ margin: 0 }}>纳管资源</Title>
        </Space>
      </div>

      <Card>
        <Steps current={currentStep} style={{ marginBottom: 32 }}>
          {steps.map((s, i) => (
            <Steps.Step key={i} title={s.title} />
          ))}
        </Steps>

        {currentStep === 0 && renderStep0()}
        {currentStep === 1 && onboardType === ONBOARD_TYPES.K8S && renderStep1K8s()}
        {currentStep === 1 && onboardType === ONBOARD_TYPES.SINGLE && renderStep1Single()}
        {currentStep === 2 && renderStep2()}

        {currentStep < 2 && !registerResult && (
          <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
            <Space>
              {currentStep > 0 && (
                <Button onClick={() => setCurrentStep(currentStep - 1)}>上一步</Button>
              )}
              {currentStep < 2 && (
                <Button type="primary" disabled={!canNext()} onClick={() => setCurrentStep(currentStep + 1)}>
                  下一步
                </Button>
              )}
            </Space>
          </div>
        )}
      </Card>
    </div>
  );
}
