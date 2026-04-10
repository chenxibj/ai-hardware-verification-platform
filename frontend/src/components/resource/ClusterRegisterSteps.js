/**
 * @file ClusterRegisterSteps.js
 * @description 集群注册 3 步流程组件 (kubeconfig导入 → Agent部署 → 节点发现)
 */
import React, { useState, useEffect, useRef } from "react";
import {
  Steps, Form, Input, Upload, Button, Alert, Spin, Progress, Result,
  Table, Tag, Typography, Divider, message,
} from "antd";
import {
  ClusterOutlined, InboxOutlined, RocketOutlined, CopyOutlined,
} from "@ant-design/icons";
import api from "../../utils/api";

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;

export default function ClusterRegisterSteps({ onDone, onCancel, onNavigateToNodes }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [form] = Form.useForm();
  const [kubeconfigContent, setKubeconfigContent] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployProgress, setDeployProgress] = useState(0);
  const [deployStatus, setDeployStatus] = useState("");
  const [discoveredNodes, setDiscoveredNodes] = useState([]);
  const pollRef = useRef(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleFileUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => { setKubeconfigContent(e.target.result); message.success(`已读取: ${file.name}`); };
    reader.readAsText(file);
    return false;
  };

  const simulateProgress = () => {
    let progress = 10;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 5;
      if (progress >= 100) {
        clearInterval(pollRef.current);
        setDeployProgress(100); setDeployStatus("success");
        setDeploying(false); setCurrentStep(2);
        if (onDone) onDone();
      } else { setDeployProgress(progress); }
    }, 1500);
  };

  const pollStatus = (clusterId) => {
    let attempts = 0;
    let lastProgress = 0;
    let stallCount = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await api.get(`/k8s/clusters/${clusterId}/status`);
        if (res.data.code === 0) {
          const d = res.data.data;
          const progress = d.progress || 0;
          setDeployProgress(progress < 0 ? 0 : progress);

          // Handle completed states
          if (d.status === "READY" || d.progress >= 100) {
            clearInterval(pollRef.current);
            setDeployStatus("success"); setDeploying(false);
            setDiscoveredNodes(d.nodes || []); setCurrentStep(2);
            if (onDone) onDone();
            return;
          }

          // Handle error states (Problem 4)
          if (d.status === "ERROR") {
            clearInterval(pollRef.current);
            setDeployStatus("failed"); setDeploying(false);
            message.error(d.errorMessage || "部署失败，请检查 kubeconfig 和集群连接");
            return;
          }

          // Stall detection: if progress hasn't changed for 20 polls (60s)
          if (progress === lastProgress) {
            stallCount++;
          } else {
            stallCount = 0;
            lastProgress = progress;
          }
          if (stallCount >= 20) {
            clearInterval(pollRef.current);
            setDeployStatus("failed"); setDeploying(false);
            message.error("部署超时：进度长时间无变化，请检查集群状态");
            return;
          }
        }
      } catch {
        if (attempts === 1) simulateProgress();
        clearInterval(pollRef.current);
      }
      if (attempts >= 60) {
        clearInterval(pollRef.current);
        setDeployStatus("failed"); setDeploying(false);
        message.error("部署超时");
      }
    }, 3000);
  };

  const validateKubeconfig = (content) => {
    if (!content || !content.trim()) return "kubeconfig 内容为空";
    if (!content.includes("apiVersion")) return "kubeconfig 缺少 apiVersion 字段";
    if (!content.includes("clusters")) return "kubeconfig 缺少 clusters 字段";
    if (!content.includes("users")) return "kubeconfig 缺少 users 字段";
    return null;
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields(["clusterName"]);
      if (!kubeconfigContent) { message.warning("请导入 kubeconfig"); return; }
      const validationError = validateKubeconfig(kubeconfigContent);
      if (validationError) { message.error("kubeconfig 格式无效: " + validationError); return; }
      setDeploying(true); setDeployProgress(0); setDeployStatus("deploying"); setCurrentStep(1);
      const res = await api.post("/k8s/clusters", { name: values.clusterName, kubeconfig: kubeconfigContent });
      if (res.data.code === 0) {
        const id = res.data.data?.id;
        message.success("注册成功，部署 Agent...");
        id ? pollStatus(id) : simulateProgress();
      } else {
        message.error(res.data.message || "注册失败");
        setDeployStatus("failed"); setDeploying(false);
      }
    } catch (err) {
      message.error("注册失败: " + (err.displayMessage || err.message || "未知错误"));
      setDeployStatus("failed"); setDeploying(false);
    }
  };

  const nodeColumns = [
    { title: "节点名", dataIndex: "name", key: "name" },
    { title: "IP", dataIndex: "ip", key: "ip", width: 140 },
    { title: "状态", dataIndex: "status", key: "status", width: 80, render: (v) => <Tag color={v === "Ready" || v === "ONLINE" ? "green" : "red"}>{v || "未知"}</Tag> },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>注册新集群</Title>
        <Button onClick={onCancel}>取消</Button>
      </div>
      <Steps current={currentStep} style={{ marginBottom: 24, maxWidth: 600 }} items={[
        { title: "导入 Kubeconfig" }, { title: "部署 Agent" }, { title: "节点发现完成" },
      ]} />

      {currentStep === 0 && (
        <div style={{ maxWidth: 640 }}>
          <Form form={form} layout="vertical">
            <Form.Item name="clusterName" label="集群名称" rules={[{ required: true, message: "请输入集群名称" }]}>
              <Input placeholder="prod-cluster-01" prefix={<ClusterOutlined />} />
            </Form.Item>
            <Form.Item label="导入 Kubeconfig">
              <Dragger accept=".yaml,.yml,.conf,.config" maxCount={1} beforeUpload={handleFileUpload} showUploadList={false} style={{ marginBottom: 12 }}>
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">拖拽 kubeconfig 文件到此处</p>
              </Dragger>
              <Divider plain>或直接粘贴</Divider>
              <TextArea rows={8} placeholder="kubeconfig YAML..." style={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "pre", overflowWrap: "normal", overflowX: "auto" }} value={kubeconfigContent} onChange={e => setKubeconfigContent(e.target.value)} />
            </Form.Item>
          </Form>
          {kubeconfigContent && <Alert message={`已导入 kubeconfig（${kubeconfigContent.length} 字符）`} type="success" showIcon style={{ marginBottom: 16 }} />}
          <Button type="primary" icon={<RocketOutlined />} onClick={handleSubmit} size="large" disabled={!kubeconfigContent}>注册并部署</Button>
        </div>
      )}

      {currentStep === 1 && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <Spin spinning={deploying} size="large" />
          <Title level={5} style={{ marginTop: 16 }}>{deployStatus === "failed" ? "部署失败" : "部署 Agent DaemonSet..."}</Title>
          <Progress percent={deployProgress} status={deployStatus === "failed" ? "exception" : "active"} style={{ maxWidth: 400, margin: "16px auto" }} />
          {deployStatus === "failed" && (
            <>
              <Alert message="部署失败" description="请检查 kubeconfig 是否正确、集群是否可达" type="error" showIcon style={{ maxWidth: 400, margin: "16px auto" }} />
              <Button onClick={() => { setCurrentStep(0); setDeployStatus(""); }} style={{ marginTop: 16 }}>返回重试</Button>
            </>
          )}
        </div>
      )}

      {currentStep === 2 && (
        <Result status="success" title="集群纳管完成"
          subTitle={discoveredNodes.length > 0 ? `发现 ${discoveredNodes.length} 个节点` : "Agent 已部署，节点将自动发现"}
          extra={[
            <Button key="nodes" type="primary" onClick={() => onNavigateToNodes && onNavigateToNodes()}>查看节点</Button>,
            <Button key="more" onClick={onCancel}>继续注册</Button>,
          ]}>
          {discoveredNodes.length > 0 && <Table dataSource={discoveredNodes} columns={nodeColumns} rowKey="name" size="small" pagination={false} style={{ maxWidth: 600, margin: "0 auto" }} />}
        </Result>
      )}
    </div>
  );
}
